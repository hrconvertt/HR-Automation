/* eslint-disable */
/**
 * scripts/reimport-attendance.js
 * ───────────────────────────────
 * DESTRUCTIVE — wipes AttendanceLog rows for active employees and re-imports
 * cleanly from the Attendance & Leave Tracking xlsx.
 *
 * Run the audit FIRST (scripts/audit-attendance-comp.js) to confirm there are
 * actual mismatches. Then run this with --confirm:
 *
 *   DATABASE_URL=… node scripts/reimport-attendance.js --confirm
 *
 * Idempotent per-employee: for each employee, deletes all their AttendanceLog
 * rows, then re-creates from the xlsx grid. Will not touch employees who
 * aren't represented in the xlsx.
 */

const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const ATTENDANCE_PATH = process.env.ATTENDANCE_PATH
  || String.raw`C:\Users\HRConvertt\Downloads\Attendance & Leave Tracking (5).xlsx`

if (!process.argv.includes('--confirm')) {
  console.error('Refusing to wipe attendance data without --confirm flag.')
  console.error('Run with:  node scripts/reimport-attendance.js --confirm')
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

function parseHeader(header) {
  const colMap = []
  const MONTH_PROGRESSION = [
    { month: 11, year: 2025 }, { month: 12, year: 2025 },
    { month: 1, year: 2026 },  { month: 2, year: 2026 },
    { month: 3, year: 2026 },  { month: 4, year: 2026 },
    { month: 5, year: 2026 },  { month: 6, year: 2026 },
  ]
  let monthIdx = 0
  for (let c = 1; c < header.length; c++) {
    const cell = String(header[c] ?? '').trim()
    if (!cell) continue
    const lower = cell.toLowerCase()
    const isSummary = lower.startsWith('total ') || lower.includes('year 2025') || lower.includes('year 2026')
    if (isSummary) {
      const isYearSummary = lower.includes('year 2025') || lower.includes('year 2026')
      const isLeavesSummary = lower.includes('total leaves') && !isYearSummary
      if (isLeavesSummary) monthIdx++
      continue
    }
    const dayMatch = cell.match(/^(\d+)/) || (typeof header[c] === 'number' ? [String(header[c]), String(header[c])] : null)
    if (!dayMatch) continue
    const day = parseInt(dayMatch[1])
    if (!day || day > 31) continue
    const month = MONTH_PROGRESSION[monthIdx]
    if (!month) continue
    colMap.push({
      colIdx: c,
      date: new Date(Date.UTC(month.year, month.month - 1, day)),
      isWeekend: /\bSAT\b|\bSUN\b/i.test(cell),
      isHoliday: /holiday/i.test(cell),
      isWfhHeader: /\bWFH\b/i.test(cell),
    })
  }
  return colMap
}

function statusFromCell(cell, col) {
  if (col.isHoliday) return { status: 'HOLIDAY', workType: 'ONSITE', hours: 0 }
  const v = String(cell ?? '').trim().toLowerCase()
  if (v === 'yes') return { status: 'PRESENT', workType: col.isWfhHeader ? 'WFH' : 'ONSITE', hours: 8 }
  if (v === 'wfh')  return { status: 'PRESENT', workType: 'WFH', hours: 8 }
  if (v === 'l' || v === 'leave') return { status: 'LEAVE', workType: 'ONSITE', hours: 0 }
  if (v === 'h' || v === 'half')  return { status: 'HALF_DAY', workType: 'ONSITE', hours: 4 }
  if (v === '') {
    if (col.isWeekend) return { status: 'WEEKEND', workType: 'ONSITE', hours: 0 }
    return { status: 'ABSENT', workType: 'ONSITE', hours: 0 }
  }
  return null
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

  const wb = XLSX.readFile(ATTENDANCE_PATH)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Attendance Record'], { defval: '', header: 1 })
  const colMap = parseHeader(rows[0])
  console.log(`Parsed ${colMap.length} date columns`)

  const employees = await prisma.employee.findMany({ select: { id: true, fullName: true } })
  const empTokens = employees.map(e => ({ id: e.id, name: e.fullName, tokens: new Set(meaningfulTokens(e.fullName)) }))
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

  let employeesReimported = 0, created = 0, deleted = 0
  const unmatched = new Set()

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || []
    const rawName = String(row[0] ?? '').trim()
    if (!rawName) continue
    const m = matchEmp(rawName)
    if (!m) { unmatched.add(rawName); continue }

    const logs = []
    for (const col of colMap) {
      const parsed = statusFromCell(row[col.colIdx], col)
      if (!parsed) continue
      logs.push({
        employeeId: m.id,
        date: col.date,
        workType: parsed.workType,
        status: parsed.status,
        hoursWorked: parsed.hours,
      })
    }
    if (!logs.length) continue

    const delRes = await prisma.attendanceLog.deleteMany({ where: { employeeId: m.id } })
    deleted += delRes.count
    for (let i = 0; i < logs.length; i += 200) {
      const batch = logs.slice(i, i + 200)
      const res = await prisma.attendanceLog.createMany({ data: batch, skipDuplicates: true })
      created += res.count
    }
    employeesReimported++
  }

  console.log('\n' + '═'.repeat(60))
  console.log('REIMPORT SUMMARY')
  console.log('═'.repeat(60))
  console.log(JSON.stringify({ employeesReimported, deleted, created, unmatched: [...unmatched] }, null, 2))
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
