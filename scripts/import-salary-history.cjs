/**
 * Import salaries + increment history from Performance Rewards / Increments Excel.
 * Run: node scripts/import-salary-history.cjs
 */
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const FILE = 'C:\\Users\\HRConvertt\\Downloads\\Performance Rewards_ Increments_.xlsx'

function excelDate(serial) {
  return new Date(Math.floor(serial - 25569) * 86400 * 1000)
}

function normalize(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function similarity(a, b) {
  const na = normalize(a), nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  // Substring bonus
  if (na.includes(nb) || nb.includes(na)) return 0.95
  const aB = new Set(), bB = new Set()
  for (let i = 0; i < na.length - 1; i++) aB.add(na.slice(i, i + 2))
  for (let i = 0; i < nb.length - 1; i++) bB.add(nb.slice(i, i + 2))
  let common = 0
  for (const g of aB) if (bB.has(g)) common++
  return (2 * common) / (aB.size + bB.size)
}

async function main() {
  const wb = XLSX.readFile(FILE)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['IncrementsBonus'], { header: 1 })

  // Decode month columns from header
  const hdr = rows[0]
  const monthCols = []
  for (let i = 1; i < hdr.length; i += 2) {
    if (typeof hdr[i] === 'number') {
      monthCols.push({ salaryIdx: i, notesIdx: i + 1, date: excelDate(hdr[i]) })
    }
  }
  console.log(`📅 Month columns detected: ${monthCols.length}`)
  monthCols.forEach((m) => console.log(`   ${m.date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`))

  // Load all employees for name matching
  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, fullName: true, status: true },
  })

  // Clear old compensation history
  await prisma.compensationHistory.deleteMany({})

  let salariesUpdated = 0
  let salariesCreated = 0
  let historyRecords = 0
  let notMatched = []

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !r[0]) continue
    const nameInFile = String(r[0]).trim()

    // Find latest salary (rightmost non-empty)
    let latestSal = null
    let latestNote = ''
    let latestDate = null
    for (const mc of monthCols) {
      if (typeof r[mc.salaryIdx] === 'number' && r[mc.salaryIdx] > 0) {
        latestSal = r[mc.salaryIdx]
        latestNote = r[mc.notesIdx] ? String(r[mc.notesIdx]).trim() : ''
        latestDate = mc.date
      }
    }
    if (!latestSal) continue

    // Match employee by name
    const candidates = employees
      .map((e) => ({ e, s: similarity(e.fullName, nameInFile) }))
      .filter((x) => x.s >= 0.6)
      .sort((a, b) => b.s - a.s)

    if (candidates.length === 0) {
      notMatched.push(nameInFile)
      continue
    }
    const emp = candidates[0].e

    // ─── Build compensation history from the row ───────────────────────────
    let prevSal = null
    for (const mc of monthCols) {
      const sal = r[mc.salaryIdx]
      const note = r[mc.notesIdx] ? String(r[mc.notesIdx]).trim() : ''
      if (typeof sal !== 'number' || sal <= 0) continue

      if (prevSal !== null && sal !== prevSal) {
        // It's a change — record it
        const pct = prevSal > 0 ? Math.round(((sal - prevSal) / prevSal) * 1000) / 10 : 0
        const type =
          sal > prevSal ? (note.toLowerCase().includes('overtime') || note.toLowerCase().includes('bonus') ? 'BONUS' : 'INCREMENT') :
          sal < prevSal ? 'DEDUCTION' : 'ADJUSTMENT'

        await prisma.compensationHistory.create({
          data: {
            employeeId: emp.id,
            effectiveDate: mc.date,
            oldSalary: prevSal,
            newSalary: sal,
            incrementPct: pct,
            type,
            reason: note || null,
          },
        })
        historyRecords++
      }
      prevSal = sal
    }

    // ─── Set current Salary record to latest amount ─────────────────────────
    // Preserve existing salary breakdown (HR/Util/Fuel etc.) if it exists; just update basic to latest total
    const existingSalary = await prisma.salary.findUnique({ where: { employeeId: emp.id } })
    if (existingSalary) {
      // The existing record has the breakdown — update basic to total, keep other components if their sum < latestSal
      // Treat the latest amount as the total CTC; replace basic only
      await prisma.salary.update({
        where: { employeeId: emp.id },
        data: { basic: latestSal },
      })
      salariesUpdated++
    } else {
      await prisma.salary.create({
        data: {
          employeeId: emp.id,
          basic: latestSal,
          houseRent: 0, utilities: 0, food: 0, fuel: 0,
          medicalAllowance: 0, otherAllowance: 0,
          effectiveFrom: latestDate || new Date('2025-11-01'),
        },
      })
      salariesCreated++
    }

    const tag = candidates[0].s < 0.9 ? ` (fuzzy match → ${emp.fullName})` : ''
    console.log(`  ✅ ${emp.employeeCode.padEnd(15)} | ${nameInFile.padEnd(25)} → PKR ${latestSal.toLocaleString()}${tag}`)
  }

  console.log(`\n📊 Summary`)
  console.log(`   Salaries updated:  ${salariesUpdated}`)
  console.log(`   Salaries created:  ${salariesCreated}`)
  console.log(`   History records:   ${historyRecords}`)
  console.log(`   Unmatched names:   ${notMatched.length}`)
  if (notMatched.length > 0) {
    console.log(`\n⚠️  These names from the file are NOT in your canonical roster:`)
    notMatched.forEach((n) => console.log(`     ${n}`))
  }

  const totalActive = await prisma.employee.count({ where: { status: 'ACTIVE' } })
  const withSal = await prisma.employee.count({ where: { status: 'ACTIVE', salary: { isNot: null } } })
  console.log(`\n🏁 ${withSal}/${totalActive} active employees have salary records`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('Import failed:', e)
  process.exit(1)
})
