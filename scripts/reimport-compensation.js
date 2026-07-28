/* eslint-disable */
/**
 * scripts/reimport-compensation.js
 * ─────────────────────────────────
 * DESTRUCTIVE — wipes CompensationHistory for active employees and rebuilds
 * cleanly from the master sheet's "Payroll - Increments Performanc" tab.
 *
 * Also FIXES the salary breakdown: the bad `import-salary-history.cjs` set
 * `basic = latestSal` while leaving houseRent/other at the old 30%/10% values,
 * inflating gross by ~40%. This script resets the Salary row to the proper
 * 60/30/10 split keyed off the LATEST xlsx amount.
 *
 * Run the audit FIRST (scripts/audit-attendance-comp.js). Then:
 *
 *   DATABASE_URL=… node scripts/reimport-compensation.js --confirm
 */

const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const MASTER_PATH = process.env.MASTER_SHEET_PATH
  || String.raw`C:\Users\HRConvertt\Downloads\Master Sheet - Convertt_HR (2).xlsx`

if (!process.argv.includes('--confirm')) {
  console.error('Refusing to wipe compensation history without --confirm flag.')
  console.error('Run with:  node scripts/reimport-compensation.js --confirm')
  process.exit(1)
}

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'sir', 'madam',
  'muhammad', 'mohammad', 'mohd', 'syed', 'syeda', 'sheikh', 'sh',
  'ch', 'chaudhry', 'mr.', 'mrs.', 'hafiz', 'haji', 'malik', 'rana'])

function meaningfulTokens(name) {
  return String(name).toLowerCase().trim().split(/\s+/)
    .map(t => t.replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length >= 2 && !HONORIFICS.has(t))
}

function xlsxDate(serial) {
  if (typeof serial !== 'number') return null
  return new Date(Math.round((serial - 25569) * 86400 * 1000))
}

async function main() {
  const prisma = new PrismaClient()
  for (let i = 1; i <= 10; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break }
    catch (e) {
      if (i === 10) throw e
      console.log(`Waking Neon… ${i}/10`)
      await new Promise(r => setTimeout(r, 4000))
    }
  }

  const wb = XLSX.readFile(MASTER_PATH)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Payroll - Increments Performanc'], { defval: null, header: 1 })

  // Row 3 is the header (Name + alternating date/Notes cols)
  const header = rows[3] || []
  const cols = []
  for (let i = 1; i < header.length; i++) {
    if (typeof header[i] === 'number') {
      cols.push({ dateCol: i, notesCol: i + 1, date: xlsxDate(header[i]) })
    }
  }
  console.log(`Date columns: ${cols.length}`)

  const employees = await prisma.employee.findMany({
    select: { id: true, fullName: true, joiningDate: true },
  })
  const empTokens = employees.map(e => ({
    id: e.id, name: e.fullName, joiningDate: e.joiningDate,
    tokens: new Set(meaningfulTokens(e.fullName)),
  }))
  function matchEmp(raw) {
    const wanted = meaningfulTokens(raw)
    if (!wanted.length) return null
    let best = null, bestScore = 0
    for (const c of empTokens) {
      let score = 0
      for (const w of wanted) if (c.tokens.has(w)) score++
      if (score > bestScore) { bestScore = score; best = c }
    }
    return bestScore >= 1 ? best : null
  }

  const hrUser = await prisma.user.findFirst({ where: { role: 'HR_ADMIN' }, select: { id: true } })
  const hrUserId = hrUser?.id ?? null

  let employeesProcessed = 0, deletedHistory = 0, createdHistory = 0, salariesFixed = 0
  const unmatched = new Set()

  for (let r = 4; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !row[0]) continue
    const rawName = String(row[0]).trim()
    const m = matchEmp(rawName)
    if (!m) { unmatched.add(rawName); continue }

    // Collect every (date, amount) where amount > 0
    const points = []
    for (const c of cols) {
      const amount = Number(row[c.dateCol]) || 0
      const note = row[c.notesCol] ? String(row[c.notesCol]).trim() : ''
      if (amount > 0) points.push({ date: c.date, amount, note })
    }
    if (!points.length) continue

    // Wipe + rebuild
    const delRes = await prisma.compensationHistory.deleteMany({ where: { employeeId: m.id } })
    deletedHistory += delRes.count

    // HIRE baseline = FIRST observed amount in xlsx (not current!)
    const firstPoint = points[0]
    await prisma.compensationHistory.create({
      data: {
        employeeId: m.id,
        type: 'HIRE',
        oldSalary: 0,
        newSalary: firstPoint.amount,
        incrementPct: null,
        reason: 'Hired — joining offer',
        effectiveDate: m.joiningDate || firstPoint.date || new Date(),
        approvedById: hrUserId,
      },
    })
    createdHistory++

    // Every change after that
    let prev = firstPoint
    for (let i = 1; i < points.length; i++) {
      const cur = points[i]
      if (cur.amount === prev.amount) continue
      const pct = prev.amount > 0
        ? Math.round(((cur.amount - prev.amount) / prev.amount) * 1000) / 10
        : null
      const lower = (cur.note || '').toLowerCase()
      const type = lower.includes('promotion') ? 'PROMOTION'
        : lower.includes('bonus') ? 'BONUS'
        : lower.includes('overtime') ? 'BONUS'
        : cur.amount < prev.amount ? 'ADJUSTMENT'
        : 'INCREMENT'
      await prisma.compensationHistory.create({
        data: {
          employeeId: m.id,
          type,
          oldSalary: prev.amount,
          newSalary: cur.amount,
          incrementPct: pct,
          reason: cur.note || 'Salary revision',
          effectiveDate: cur.date || new Date(),
          approvedById: hrUserId,
        },
      })
      createdHistory++
      prev = cur
    }

    // Fix Salary row: 60/30/10 split off the LATEST amount, zero everything else
    const latest = points[points.length - 1].amount
    const basic = Math.round(latest * 0.6)
    const houseRent = Math.round(latest * 0.3)
    const other = latest - basic - houseRent
    await prisma.salary.upsert({
      where: { employeeId: m.id },
      update: {
        basic, houseRent, otherAllowance: other,
        utilities: 0, food: 0, fuel: 0, medicalAllowance: 0,
      },
      create: {
        employeeId: m.id,
        basic, houseRent, otherAllowance: other,
        effectiveFrom: m.joiningDate || new Date(),
      },
    })
    salariesFixed++
    employeesProcessed++
  }

  console.log('\n' + '═'.repeat(60))
  console.log('REIMPORT SUMMARY')
  console.log('═'.repeat(60))
  console.log(JSON.stringify({ employeesProcessed, deletedHistory, createdHistory, salariesFixed, unmatched: [...unmatched] }, null, 2))
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
