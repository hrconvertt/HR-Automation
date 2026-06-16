/* eslint-disable */
/**
 * scripts/audit-attendance-comp.js
 * ─────────────────────────────────
 * READ-ONLY diagnostic. Reads the master sheet + attendance xlsx, compares
 * against what's currently in the DB, and prints discrepancies for both
 * attendance logs and compensation history.
 *
 * No data is mutated. Safe to run against prod.
 *
 * Usage:
 *   DATABASE_URL=… node scripts/audit-attendance-comp.js
 *
 * Optional env vars:
 *   MASTER_SHEET_PATH   default: C:\Users\HRConvertt\Downloads\Master Sheet - Convertt_HR (2).xlsx
 *   ATTENDANCE_PATH     default: C:\Users\HRConvertt\Downloads\Attendance & Leave Tracking (5).xlsx
 *   AUDIT_LIMIT         default: 25 (max rows of detail printed per section)
 */

const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const MASTER_PATH = process.env.MASTER_SHEET_PATH
  || String.raw`C:\Users\HRConvertt\Downloads\Master Sheet - Convertt_HR (2).xlsx`
const ATTENDANCE_PATH = process.env.ATTENDANCE_PATH
  || String.raw`C:\Users\HRConvertt\Downloads\Attendance & Leave Tracking (5).xlsx`
const LIMIT = parseInt(process.env.AUDIT_LIMIT || '25', 10)

// ─── Helpers ────────────────────────────────────────────────────────────────

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'sir', 'madam',
  'muhammad', 'mohammad', 'mohd', 'syed', 'syeda', 'sheikh', 'sh',
  'ch', 'chaudhry', 'mr.', 'mrs.', 'hafiz', 'haji', 'malik', 'rana'])

function meaningfulTokens(name) {
  return String(name).toLowerCase().trim().split(/\s+/)
    .map(t => t.replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length >= 2 && !HONORIFICS.has(t))
}

function buildMatcher(employees) {
  const empTokens = employees.map(e => ({
    id: e.id,
    name: e.fullName,
    tokens: new Set(meaningfulTokens(e.fullName)),
  }))
  return function match(rawName) {
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
}

function xlsxDate(serial) {
  if (typeof serial !== 'number') return null
  return new Date(Math.round((serial - 25569) * 86400 * 1000))
}

function ymKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Parse the attendance header into [{colIdx, date, month, year, isWeekend, isHoliday, isWfhHeader}]
function parseAttendanceHeader(header) {
  const colMap = []
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
      day,
      month: month.month,
      year: month.year,
      isWeekend: /\bSAT\b|\bSUN\b/i.test(cell),
      isHoliday: /holiday/i.test(cell),
      isWfhHeader: /\bWFH\b/i.test(cell),
    })
  }
  return colMap
}

function statusFromCell(cell, col) {
  if (col.isHoliday) return 'HOLIDAY'
  const v = String(cell ?? '').trim().toLowerCase()
  if (v === 'yes') return col.isWfhHeader ? 'PRESENT_WFH' : 'PRESENT'
  if (v === 'wfh') return 'PRESENT_WFH'
  if (v === 'l' || v === 'leave') return 'LEAVE'
  if (v === 'h' || v === 'half') return 'HALF_DAY'
  if (v === '') return col.isWeekend ? 'WEEKEND' : 'ABSENT'
  return null
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

  console.log('Reading workbooks…')
  const masterWb = XLSX.readFile(MASTER_PATH)
  const attWb = XLSX.readFile(ATTENDANCE_PATH)

  // ─── Load active employees ───────────────────────────────────────────
  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, fullName: true, employeeCode: true, joiningDate: true },
  })
  const matchEmp = buildMatcher(employees)
  console.log(`Loaded ${employees.length} active employees from DB`)

  // ═════════════════════════════════════════════════════════════════════
  // ATTENDANCE AUDIT
  // ═════════════════════════════════════════════════════════════════════
  console.log('\nAuditing attendance…')
  const attSheet = attWb.Sheets['Attendance Record']
  const attRows = XLSX.utils.sheet_to_json(attSheet, { defval: '', header: 1 })
  const colMap = parseAttendanceHeader(attRows[0])
  console.log(`  Parsed ${colMap.length} date columns`)

  // Build per-employee XLSX monthly summary: empId → { 'YYYY-MM' → { present, absent, leave, holiday, weekend, half } }
  const xlsxAttByEmp = new Map()
  const unmatchedAtt = new Set()

  for (let r = 1; r < attRows.length; r++) {
    const row = attRows[r] || []
    const rawName = String(row[0] ?? '').trim()
    if (!rawName) continue
    const m = matchEmp(rawName)
    if (!m) { unmatchedAtt.add(rawName); continue }
    if (!employees.find(e => e.id === m.id)) continue // not active

    let buckets = xlsxAttByEmp.get(m.id)
    if (!buckets) { buckets = new Map(); xlsxAttByEmp.set(m.id, buckets) }

    for (const col of colMap) {
      const status = statusFromCell(row[col.colIdx], col)
      if (!status) continue
      const key = ymKey(col.date)
      let b = buckets.get(key)
      if (!b) { b = { present: 0, absent: 0, leave: 0, holiday: 0, weekend: 0, half: 0 }; buckets.set(key, b) }
      if (status === 'PRESENT' || status === 'PRESENT_WFH') b.present++
      else if (status === 'ABSENT') b.absent++
      else if (status === 'LEAVE') b.leave++
      else if (status === 'HOLIDAY') b.holiday++
      else if (status === 'WEEKEND') b.weekend++
      else if (status === 'HALF_DAY') b.half++
    }
  }

  // Build per-employee DB monthly summary
  const dbAttByEmp = new Map()
  const allLogs = await prisma.attendanceLog.findMany({
    where: { employee: { status: 'ACTIVE' } },
    select: { employeeId: true, date: true, status: true },
  })
  for (const l of allLogs) {
    let buckets = dbAttByEmp.get(l.employeeId)
    if (!buckets) { buckets = new Map(); dbAttByEmp.set(l.employeeId, buckets) }
    const key = ymKey(l.date)
    let b = buckets.get(key)
    if (!b) { b = { present: 0, absent: 0, leave: 0, holiday: 0, weekend: 0, half: 0 }; buckets.set(key, b) }
    if (l.status === 'PRESENT') b.present++
    else if (l.status === 'ABSENT') b.absent++
    else if (l.status === 'LEAVE') b.leave++
    else if (l.status === 'HOLIDAY') b.holiday++
    else if (l.status === 'WEEKEND') b.weekend++
    else if (l.status === 'HALF_DAY') b.half++
  }

  // Compare
  const attMismatches = []
  let empsWithAttIssues = 0
  for (const emp of employees) {
    const x = xlsxAttByEmp.get(emp.id)
    const d = dbAttByEmp.get(emp.id)
    if (!x && !d) continue
    let hasIssue = false
    const keys = new Set([...(x ? x.keys() : []), ...(d ? d.keys() : [])])
    for (const k of keys) {
      const xb = (x && x.get(k)) || { present: 0, absent: 0, leave: 0, holiday: 0, weekend: 0, half: 0 }
      const db = (d && d.get(k)) || { present: 0, absent: 0, leave: 0, holiday: 0, weekend: 0, half: 0 }
      for (const field of ['present', 'absent', 'leave', 'holiday', 'weekend', 'half']) {
        if (xb[field] !== db[field]) {
          hasIssue = true
          attMismatches.push({
            employee: emp.fullName, code: emp.employeeCode, month: k, field,
            db: db[field], xlsx: xb[field], delta: db[field] - xb[field],
          })
        }
      }
    }
    if (hasIssue) empsWithAttIssues++
  }

  // ═════════════════════════════════════════════════════════════════════
  // COMPENSATION AUDIT
  // ═════════════════════════════════════════════════════════════════════
  console.log('Auditing compensation history…')
  const incSheet = masterWb.Sheets['Payroll - Increments Performanc']
  const incRows = XLSX.utils.sheet_to_json(incSheet, { defval: null, header: 1 })
  const headerRow = incRows[3] || []
  const cols = []
  for (let i = 1; i < headerRow.length; i++) {
    const cell = headerRow[i]
    if (typeof cell === 'number') {
      cols.push({ dateCol: i, notesCol: i + 1, date: xlsxDate(cell) })
    }
  }

  // From the xlsx, for each employee: list of {date, amount} where amount > 0
  // AND the changes [{date, oldAmount, newAmount, note}]
  const xlsxCompByEmp = new Map() // empId → { points: [{date, amount}], changes: [...] }
  const unmatchedComp = new Set()
  for (let r = 4; r < incRows.length; r++) {
    const row = incRows[r]
    if (!row || !row[0]) continue
    const rawName = String(row[0]).trim()
    const m = matchEmp(rawName)
    if (!m) { unmatchedComp.add(rawName); continue }
    if (!employees.find(e => e.id === m.id)) continue
    const points = []
    const changes = []
    let prev = null
    for (const c of cols) {
      const amount = Number(row[c.dateCol]) || 0
      const note = row[c.notesCol] ? String(row[c.notesCol]).trim() : ''
      if (amount > 0) {
        points.push({ date: c.date, amount, note })
        if (prev != null && amount !== prev.amount) {
          changes.push({ date: c.date, oldAmount: prev.amount, newAmount: amount, note })
        }
        prev = { date: c.date, amount }
      }
    }
    xlsxCompByEmp.set(m.id, { points, changes, firstAmount: points[0]?.amount, lastAmount: points[points.length - 1]?.amount })
  }

  // DB comp history
  const dbCompHistory = await prisma.compensationHistory.findMany({
    where: { employee: { status: 'ACTIVE' } },
    select: { employeeId: true, type: true, oldSalary: true, newSalary: true, effectiveDate: true, reason: true },
    orderBy: { effectiveDate: 'asc' },
  })
  const dbCompByEmp = new Map()
  for (const h of dbCompHistory) {
    let arr = dbCompByEmp.get(h.employeeId)
    if (!arr) { arr = []; dbCompByEmp.set(h.employeeId, arr) }
    arr.push(h)
  }

  // DB salary records (to flag inflated basic+breakdown bug)
  const dbSalaries = await prisma.salary.findMany({
    where: { employee: { status: 'ACTIVE' } },
    select: { employeeId: true, basic: true, houseRent: true, utilities: true, food: true, fuel: true, medicalAllowance: true, otherAllowance: true },
  })
  const salaryByEmp = new Map(dbSalaries.map(s => [s.employeeId, s]))

  const compMismatches = []
  const salaryMismatches = []
  let empsWithCompIssues = 0
  for (const emp of employees) {
    const x = xlsxCompByEmp.get(emp.id)
    const dbList = dbCompByEmp.get(emp.id) || []
    const sal = salaryByEmp.get(emp.id)

    // Compare current salary (DB) vs latest amount in xlsx
    if (x && sal) {
      const dbGross = sal.basic + sal.houseRent + sal.utilities + sal.food + sal.fuel + sal.medicalAllowance + sal.otherAllowance
      if (Math.abs(dbGross - x.lastAmount) > 1) {
        salaryMismatches.push({
          employee: emp.fullName, code: emp.employeeCode,
          dbGross, xlsxLatest: x.lastAmount, delta: dbGross - x.lastAmount,
          basic: sal.basic, houseRent: sal.houseRent, other: sal.otherAllowance,
        })
      }
    }

    if (!x) continue
    let hasIssue = false

    // Verify every xlsx change is present in DB
    for (const ch of x.changes) {
      const found = dbList.find(d => {
        const sameMonth = ymKey(d.effectiveDate) === ymKey(ch.date)
        const sameAmt = Math.abs(d.newSalary - ch.newAmount) < 1
        return sameMonth && sameAmt
      })
      if (!found) {
        hasIssue = true
        compMismatches.push({
          employee: emp.fullName, code: emp.employeeCode,
          month: ymKey(ch.date), kind: 'MISSING_IN_DB',
          detail: `xlsx change ${ch.oldAmount}→${ch.newAmount} (${ch.note || 'n/a'}) not in DB`,
        })
      }
    }
    // Flag DB entries that don't exist in xlsx
    for (const d of dbList) {
      // Skip HIRE baseline (auto-generated)
      if ((d.reason || '').toLowerCase().includes('hired') || (d.reason || '').toLowerCase().includes('joining')) continue
      const matched = x.changes.find(ch => ymKey(ch.date) === ymKey(d.effectiveDate) && Math.abs(ch.newAmount - d.newSalary) < 1)
      if (!matched) {
        hasIssue = true
        compMismatches.push({
          employee: emp.fullName, code: emp.employeeCode,
          month: ymKey(d.effectiveDate), kind: 'EXTRA_IN_DB',
          detail: `DB has ${d.oldSalary}→${d.newSalary} (${d.reason || 'n/a'}) but xlsx has no such change`,
        })
      }
    }
    if (hasIssue) empsWithCompIssues++
  }

  // ═════════════════════════════════════════════════════════════════════
  // REPORT
  // ═════════════════════════════════════════════════════════════════════
  console.log('\n')
  console.log('═'.repeat(72))
  console.log('ATTENDANCE AUDIT')
  console.log('═'.repeat(72))
  console.log(`Total active employees checked: ${employees.length}`)
  console.log(`Employees with attendance mismatches: ${empsWithAttIssues}`)
  console.log(`Total monthly-bucket mismatches: ${attMismatches.length}`)
  if (unmatchedAtt.size) {
    console.log(`\nUnmatched names in xlsx (no DB employee):`)
    for (const n of [...unmatchedAtt].slice(0, 10)) console.log(`  · ${n}`)
    if (unmatchedAtt.size > 10) console.log(`  … and ${unmatchedAtt.size - 10} more`)
  }
  if (attMismatches.length) {
    console.log(`\nTop ${LIMIT} discrepancies:`)
    for (const m of attMismatches.slice(0, LIMIT)) {
      console.log(`  ${m.employee} · ${m.month} · ${m.field}: DB=${m.db} XLSX=${m.xlsx} (Δ ${m.delta > 0 ? '+' : ''}${m.delta})`)
    }
    if (attMismatches.length > LIMIT) console.log(`  … and ${attMismatches.length - LIMIT} more`)
  }

  console.log('\n')
  console.log('═'.repeat(72))
  console.log('COMPENSATION HISTORY AUDIT')
  console.log('═'.repeat(72))
  console.log(`Total active employees checked: ${employees.length}`)
  console.log(`Employees with comp-history mismatches: ${empsWithCompIssues}`)
  console.log(`Total comp record mismatches: ${compMismatches.length}`)
  if (unmatchedComp.size) {
    console.log(`\nUnmatched names in increments tab:`)
    for (const n of [...unmatchedComp].slice(0, 10)) console.log(`  · ${n}`)
  }
  if (compMismatches.length) {
    console.log(`\nTop ${LIMIT} discrepancies:`)
    for (const m of compMismatches.slice(0, LIMIT)) {
      console.log(`  ${m.employee} · ${m.month} · ${m.kind}`)
      console.log(`    ${m.detail}`)
    }
    if (compMismatches.length > LIMIT) console.log(`  … and ${compMismatches.length - LIMIT} more`)
  }

  console.log('\n')
  console.log('═'.repeat(72))
  console.log('CURRENT SALARY vs LATEST XLSX AMOUNT')
  console.log('═'.repeat(72))
  console.log(`Salaries with gross mismatch vs latest xlsx amount: ${salaryMismatches.length}`)
  if (salaryMismatches.length) {
    console.log(`\nTop ${LIMIT} discrepancies (these likely come from the salary-history "basic = total" bug):`)
    for (const m of salaryMismatches.slice(0, LIMIT)) {
      console.log(`  ${m.employee} (${m.code})`)
      console.log(`    DB gross=${m.dbGross}  XLSX latest=${m.xlsxLatest}  Δ=${m.delta > 0 ? '+' : ''}${m.delta}`)
      console.log(`    breakdown: basic=${m.basic}  houseRent=${m.houseRent}  other=${m.other}`)
    }
  }

  console.log('\n✓ Audit complete (read-only — no data was modified).\n')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
