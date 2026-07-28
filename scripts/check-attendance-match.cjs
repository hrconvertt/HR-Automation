/* eslint-disable */
/**
 * scripts/check-attendance-match.cjs
 * ───────────────────────────────────
 * READ-ONLY verifier. For each active employee, compares AttendanceLog rows in
 * the DB to the matching row in the v4 attendance xlsx and reports any cell
 * that doesn't match.
 *
 * Output:
 *   Abdullah Shafiq · 2026-06-08 · DB=PRESENT XLSX=WFH
 *
 * Exit code:
 *   0 — no mismatches
 *   1 — at least one mismatch (CI-friendly)
 *
 * Usage:
 *   DATABASE_URL=… node scripts/check-attendance-match.cjs
 *
 * Optional env:
 *   ATTENDANCE_PATH    default: C:\Users\HRConvertt\Downloads\Attendance & Leave Tracking (5).xlsx
 *   CHECK_LIMIT        max mismatches to print per employee (default 25)
 */

const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const ATTENDANCE_PATH = process.env.ATTENDANCE_PATH
  || String.raw`C:\Users\HRConvertt\Downloads\Attendance & Leave Tracking (5).xlsx`
const LIMIT = parseInt(process.env.CHECK_LIMIT || '25', 10)

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

// Same cell parser used by reimport-attendance.js
function statusFromCell(cell, col) {
  if (col.isHoliday) return { status: 'HOLIDAY', workType: 'ONSITE' }
  const v = String(cell ?? '').trim().toLowerCase()
  if (v === 'yes') return { status: 'PRESENT', workType: col.isWfhHeader ? 'WFH' : 'ONSITE' }
  if (v === 'wfh')  return { status: 'PRESENT', workType: 'WFH' }
  if (v === 'l' || v === 'leave') return { status: 'LEAVE', workType: 'ONSITE' }
  if (v === 'h' || v === 'half')  return { status: 'HALF_DAY', workType: 'ONSITE' }
  if (v === '') {
    if (col.isWeekend) return { status: 'WEEKEND', workType: 'ONSITE' }
    return { status: 'ABSENT', workType: 'ONSITE' }
  }
  return null
}

function dayKey(d) {
  const dt = new Date(d)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
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

  const wb = XLSX.readFile(ATTENDANCE_PATH)
  const sheet = wb.Sheets['Attendance Record']
  if (!sheet) { console.error('Sheet "Attendance Record" not found in xlsx'); process.exit(2) }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 })
  const colMap = parseHeader(rows[0])
  console.log(`Loaded ${colMap.length} date columns from xlsx`)

  const employees = await prisma.employee.findMany({
    where: { status: { in: ['ACTIVE', 'PROBATION', 'ON_LEAVE'] } },
    select: { id: true, fullName: true },
  })
  const empTokens = employees.map(e => ({
    id: e.id, name: e.fullName, tokens: new Set(meaningfulTokens(e.fullName)),
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

  // Build xlsx-side state: empId -> Map<dayKey, {status, workType}>
  const xlsxByEmp = new Map()
  const matchedEmpIds = new Set()
  const unmatchedNames = new Set()
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || []
    const rawName = String(row[0] ?? '').trim()
    if (!rawName) continue
    const m = matchEmp(rawName)
    if (!m) { unmatchedNames.add(rawName); continue }
    matchedEmpIds.add(m.id)
    const byDay = new Map()
    for (const col of colMap) {
      const parsed = statusFromCell(row[col.colIdx], col)
      if (!parsed) continue
      byDay.set(dayKey(col.date), parsed)
    }
    xlsxByEmp.set(m.id, { name: rawName, byDay })
  }

  // Compare against DB
  let totalMismatches = 0
  let employeesWithMismatch = 0
  const missingFromXlsx = []
  for (const emp of employees) {
    const xlsxData = xlsxByEmp.get(emp.id)
    if (!xlsxData) {
      missingFromXlsx.push(emp.fullName)
      continue
    }
    const logs = await prisma.attendanceLog.findMany({
      where: { employeeId: emp.id },
      select: { date: true, status: true, workType: true },
    })
    const dbByDay = new Map()
    for (const l of logs) dbByDay.set(dayKey(l.date), { status: l.status, workType: l.workType })

    const issues = []
    // Iterate union of keys
    const keys = new Set([...dbByDay.keys(), ...xlsxData.byDay.keys()])
    for (const k of keys) {
      const db = dbByDay.get(k)
      const xl = xlsxData.byDay.get(k)
      if (!db && !xl) continue
      if (!db) {
        issues.push(`${emp.fullName} · ${k} · DB=<missing> XLSX=${xl.status}${xl.workType !== 'ONSITE' ? `/${xl.workType}` : ''}`)
        continue
      }
      if (!xl) {
        issues.push(`${emp.fullName} · ${k} · DB=${db.status}${db.workType !== 'ONSITE' ? `/${db.workType}` : ''} XLSX=<missing>`)
        continue
      }
      if (db.status !== xl.status || db.workType !== xl.workType) {
        issues.push(
          `${emp.fullName} · ${k} · ` +
          `DB=${db.status}${db.workType !== 'ONSITE' ? `/${db.workType}` : ''} ` +
          `XLSX=${xl.status}${xl.workType !== 'ONSITE' ? `/${xl.workType}` : ''}`
        )
      }
    }

    if (issues.length) {
      employeesWithMismatch++
      totalMismatches += issues.length
      const shown = issues.slice(0, LIMIT)
      for (const line of shown) console.log(line)
      if (issues.length > LIMIT) console.log(`  … and ${issues.length - LIMIT} more for ${emp.fullName}`)
    }
  }

  console.log('\n' + '═'.repeat(70))
  console.log('ATTENDANCE MATCH SUMMARY')
  console.log('═'.repeat(70))
  console.log(`Employees checked        : ${employees.length}`)
  console.log(`Matched in xlsx          : ${matchedEmpIds.size}`)
  console.log(`Active emp not in xlsx   : ${missingFromXlsx.length}`)
  console.log(`Employees with mismatches: ${employeesWithMismatch}`)
  console.log(`Total cell mismatches    : ${totalMismatches}`)
  if (unmatchedNames.size) {
    console.log(`Unmatched xlsx rows      : ${unmatchedNames.size}`)
    for (const n of unmatchedNames) console.log(`  · ${n}`)
  }

  await prisma.$disconnect()
  process.exit(totalMismatches > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(2) })
