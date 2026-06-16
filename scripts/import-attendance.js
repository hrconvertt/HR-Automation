/**
 * scripts/import-attendance.js
 * ─────────────────────────────
 * Imports the real attendance grid from the user's "Attendance & Leave Tracking"
 * xlsx into the AttendanceLog table.
 *
 * Behavior:
 *   1. **Wipes existing attendance logs** (the demo seed data) before importing
 *   2. For each employee row × each day column, computes the date + status
 *      from the header. Cells:
 *        "yes"/"Yes"   → PRESENT (ONSITE)
 *        "WFH"         → PRESENT (WFH)
 *        "L"           → LEAVE
 *        "Holiday"     → HOLIDAY (also applied to all rows for that date)
 *        ""            → if SAT/SUN header → WEEKEND, else ABSENT
 *   3. Skips "Total Leaves" / "Total WFH" / "Total HD" summary columns
 *   4. Also imports Leave Requests (7 rows) into LeaveRequest table
 *
 * Run with DATABASE_URL set:
 *   node scripts/import-attendance.js
 */

const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const XLSX_PATH = process.env.ATTENDANCE_PATH
  || String.raw`C:\Users\HRConvertt\Downloads\Attendance & Leave Tracking (4).xlsx`

// ─── Honorifics matcher (reused from import-full-employees.js) ───
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

/**
 * Parse the attendance header to build a column → {date, type} map.
 * Walks left-to-right starting from column 1, tracking the current month.
 */
function parseHeader(header) {
  const colMap = [] // [{colIdx, date, isWeekend, isHoliday, monthLabel}]
  // Month sequence — derived from the year markers we see in the header
  // (Nov 2025, Dec 2025, [Year 2025 reset], Jan-Jun 2026)
  const MONTH_PROGRESSION = [
    { month: 11, year: 2025 },
    { month: 12, year: 2025 },
    { month: 1, year: 2026 },
    { month: 2, year: 2026 },
    { month: 3, year: 2026 },
    { month: 4, year: 2026 },
    { month: 5, year: 2026 },
    { month: 6, year: 2026 },
  ]
  let monthIdx = 0

  for (let c = 1; c < header.length; c++) {
    const cell = String(header[c] ?? '').trim()
    if (!cell) continue

    // Summary column patterns — advance month or skip
    const lower = cell.toLowerCase()
    const isSummary = lower.startsWith('total ') || lower.includes('year 2025')
    if (isSummary) {
      // Year-summary cells ("Total Leaves Year 2025") do NOT advance month —
      // they sit between Dec totals and Jan data without being a month break.
      // Only the per-month "Total Leaves <month>" advances. WFH / HD summaries
      // come AFTER the leaves summary in the same trailing block, so don't
      // advance on those either.
      const isYearSummary = lower.includes('year 2025') || lower.includes('year 2026')
      const isLeavesSummary = lower.includes('total leaves') && !isYearSummary
      if (isLeavesSummary) monthIdx++
      continue
    }

    // Day cell — extract day number + flags
    // Examples: "1 SAT", "2 SUN", 3, "25 Holiday", "1 Labour Day Holiday", "14 SAT (DT ON)", "24 WFH"
    const dayMatch = cell.match(/^(\d+)/) || (typeof header[c] === 'number' ? [String(header[c]), String(header[c])] : null)
    if (!dayMatch) continue
    const day = parseInt(dayMatch[1])
    if (!day || day > 31) continue

    const month = MONTH_PROGRESSION[monthIdx]
    if (!month) continue

    const isWeekend = /\bSAT\b|\bSUN\b/i.test(cell)
    const isHoliday = /holiday/i.test(cell)
    const isWfhHeader = /\bWFH\b/i.test(cell)

    colMap.push({
      colIdx: c,
      date: new Date(Date.UTC(month.year, month.month - 1, day)),
      day,
      month: month.month,
      year: month.year,
      isWeekend,
      isHoliday,
      isWfhHeader,
    })
  }

  return colMap
}

function statusFromCell(cell, col) {
  if (col.isHoliday) return { status: 'HOLIDAY', workType: 'ONSITE' }
  const v = String(cell ?? '').trim().toLowerCase()
  if (v === 'yes') {
    return { status: 'PRESENT', workType: col.isWfhHeader ? 'WFH' : 'ONSITE' }
  }
  if (v === 'wfh') {
    return { status: 'PRESENT', workType: 'WFH' }
  }
  if (v === 'l' || v === 'leave') {
    return { status: 'LEAVE', workType: 'ONSITE' }
  }
  if (v === 'h' || v === 'half') {
    return { status: 'HALF_DAY', workType: 'ONSITE' }
  }
  if (v === '') {
    if (col.isWeekend) return { status: 'WEEKEND', workType: 'ONSITE' }
    return { status: 'ABSENT', workType: 'ONSITE' }
  }
  // Anything else (unrecognized text) → ABSENT but log
  return null
}

const LEAVE_TYPE_MAP = {
  'sick leave': 'SICK',
  'casual leave': 'CASUAL',
  'annual leave': 'ANNUAL',
  'earned leave': 'ANNUAL',
}

async function main() {
  const prisma = new PrismaClient()

  // Wake Neon
  for (let i = 1; i <= 10; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break }
    catch (e) {
      if (i === 10) throw e
      console.log(`Waking Neon… ${i}/10`)
      await new Promise(r => setTimeout(r, 4000))
    }
  }

  console.log('Reading workbook…')
  const wb = XLSX.readFile(XLSX_PATH)
  const sheet = wb.Sheets['Attendance Record']
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 })
  const header = rows[0]

  console.log('Parsing header…')
  const colMap = parseHeader(header)
  console.log(`  Found ${colMap.length} date columns (Nov 2025 → Jun 2026)`)

  // Build employee token map for fuzzy matching
  const allEmps = await prisma.employee.findMany({
    select: { id: true, fullName: true, employeeCode: true },
  })
  const empTokens = allEmps.map(e => ({
    id: e.id,
    name: e.fullName,
    tokens: new Set(meaningfulTokens(e.fullName)),
  }))

  function matchEmployee(rawName) {
    const wanted = meaningfulTokens(rawName)
    if (!wanted.length) return null
    let best = null, bestScore = 0
    for (const c of empTokens) {
      let score = 0
      for (const w of wanted) if (c.tokens.has(w)) score++
      if (score > bestScore) { bestScore = score; best = c }
    }
    return bestScore >= 1 ? best : null
  }

  // ─── 1. WIPE existing demo attendance ───
  console.log('Wiping existing AttendanceLog rows (demo data)…')
  const wiped = await prisma.attendanceLog.deleteMany({})
  console.log(`  Deleted ${wiped.count} rows`)

  // ─── 2. Import attendance grid ───
  console.log('Importing attendance grid…')
  let created = 0, skipped = 0
  const unmatchedNames = new Map()

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || []
    const rawName = String(row[0] ?? '').trim()
    if (!rawName) continue

    const match = matchEmployee(rawName)
    if (!match) {
      unmatchedNames.set(rawName, (unmatchedNames.get(rawName) || 0) + 1)
      continue
    }

    const logs = []
    for (const col of colMap) {
      const raw = row[col.colIdx]
      const parsed = statusFromCell(raw, col)
      if (!parsed) continue
      logs.push({
        employeeId: match.id,
        date: col.date,
        workType: parsed.workType,
        status: parsed.status,
        hoursWorked: parsed.status === 'PRESENT' ? 8 : (parsed.status === 'HALF_DAY' ? 4 : 0),
      })
    }

    // Use createMany with skipDuplicates so unique (employeeId, date) collisions
    // (and any same-employee dupes from header parsing) don't blow the batch.
    for (let i = 0; i < logs.length; i += 200) {
      const batch = logs.slice(i, i + 200)
      try {
        const res = await prisma.attendanceLog.createMany({
          data: batch,
          skipDuplicates: true,
        })
        created += res.count
        skipped += batch.length - res.count
      } catch (e) {
        // Fall back to one-by-one if batch fails entirely
        for (const log of batch) {
          try {
            await prisma.attendanceLog.create({ data: log })
            created++
          } catch (err) {
            skipped++
            if (skipped < 5) console.error(`Row failed for ${match.name} @ ${log.date.toISOString().slice(0,10)}: ${err.message}`)
          }
        }
      }
    }
  }

  // ─── 3. Import leave requests ───
  console.log('\nImporting leave requests…')
  let leavesCreated = 0
  const leaveRows = XLSX.utils.sheet_to_json(wb.Sheets['Leave Requests'], { defval: null, header: 1 })
  // Header: Request ID, Employee ID, Employee Name, Department, Leave Type, From Date, To Date, Days, Reason, Status, Manager, Applied Date
  // Need to find an HR user for approvedById
  const hrUser = await prisma.user.findFirst({ where: { role: 'HR_ADMIN' }, select: { id: true } })
  const hrUserId = hrUser?.id ?? null

  for (let i = 1; i < leaveRows.length; i++) {
    const r = leaveRows[i]
    if (!r || !r[2]) continue // need employee name
    const empName = String(r[2]).trim()
    const match = matchEmployee(empName)
    if (!match) {
      unmatchedNames.set(empName, (unmatchedNames.get(empName) || 0) + 1)
      continue
    }
    const leaveType = LEAVE_TYPE_MAP[String(r[4] ?? '').trim().toLowerCase()] || 'CASUAL'
    const fromDate = xlsxDate(r[5])
    const toDate = xlsxDate(r[6])
    if (!fromDate || !toDate) continue
    const days = Number(r[7]) || 1
    const reason = String(r[8] ?? '').trim() || null
    const statusRaw = String(r[9] ?? '').trim().toLowerCase()
    const status = statusRaw.includes('approve') ? 'APPROVED'
      : statusRaw.includes('reject') ? 'REJECTED'
      : 'PENDING'
    const appliedAt = xlsxDate(r[11]) || fromDate

    try {
      // Idempotency — skip if a matching leave already exists
      const existing = await prisma.leaveRequest.findFirst({
        where: { employeeId: match.id, fromDate, toDate, leaveType },
      })
      if (existing) {
        console.log(`  skip (exists): ${empName} ${fromDate.toISOString().slice(0,10)} ${leaveType}`)
        continue
      }
      await prisma.leaveRequest.create({
        data: {
          employeeId: match.id,
          leaveType,
          fromDate,
          toDate,
          days,
          reason: reason ?? 'Personal',
          status,
          // Note: LeaveRequest has no appliedAt field; createdAt fills in.
          ...(status === 'APPROVED' && hrUserId ? { approvedById: hrUserId, approvedAt: appliedAt } : {}),
        },
      })
      leavesCreated++
    } catch (e) {
      console.error(`Leave request failed for ${empName}: ${e.message}`)
    }
  }

  console.log('\n' + '═'.repeat(60))
  console.log('IMPORT SUMMARY')
  console.log('═'.repeat(60))
  console.log(JSON.stringify({
    attendanceWiped: wiped.count,
    attendanceCreated: created,
    attendanceSkipped: skipped,
    leavesCreated,
  }, null, 2))

  if (unmatchedNames.size > 0) {
    console.log('\nUnmatched names (no employee row matched):')
    for (const [name, count] of unmatchedNames.entries()) {
      console.log(`  • "${name}" — appeared ${count}x`)
    }
  }

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
