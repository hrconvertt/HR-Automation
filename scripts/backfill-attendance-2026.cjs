/* eslint-disable */
/**
 * scripts/backfill-attendance-2026.cjs
 * ─────────────────────────────────────
 * Bulk-set attendance Jan 1 -> 2026-07-02 for 11 employees.
 *
 * Preflight: fix Umar Ameen (CON-UIUX-006) status to ACTIVE.
 *
 * Rules:
 *  - Weekdays only (workDays: Mon-Fri for all these)
 *  - Skip existing HOLIDAY rows
 *  - 2026-05-25 existing WFH -> keep
 *  - 2026-06-12 existing ABSENT -> overwrite to PRESENT
 *  - Default weekday = PRESENT unless override
 *
 * Run: node scripts/backfill-attendance-2026.cjs
 */

const fs = require('fs')
const path = require('path')

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/)
    if (m) {
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  })
}

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// UTC midnight helper
function d(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day))
}
function ymd(date) {
  return date.toISOString().slice(0, 10)
}
function addDays(date, n) {
  const nd = new Date(date)
  nd.setUTCDate(nd.getUTCDate() + n)
  return nd
}

const END = d(2026, 7, 2)
const JAN1 = d(2026, 1, 1)
const MAY25 = ymd(d(2026, 5, 25))
const JUN12 = ymd(d(2026, 6, 12))

// Specs
const SPECS = {
  'CON-WBS-005': {
    // Momna Waryam Khan
    leaves: ['2026-01-09', '2026-05-13'],
    wfh: ['2026-01-19', '2026-02-04', '2026-02-05', '2026-02-06', '2026-03-02', '2026-03-11', '2026-03-26'],
    halfDay: [],
  },
  'CON-WBS-004': {
    // Muhammad Ahsan
    leaves: [],
    wfh: ['2026-02-09', '2026-03-18', '2026-03-24', '2026-03-30'],
    halfDay: [],
  },
  'CON-WBS-003': {
    // Muzaffar Jamil
    leaves: ['2026-03-27', '2026-05-15'],
    wfh: ['2026-03-24', '2026-03-25', '2026-03-26'],
    halfDay: [],
  },
  'CON-WBS-008': {
    // Muhammad Rayyan
    leaves: ['2026-01-06'],
    wfh: [
      '2026-01-01', '2026-01-05', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-12', '2026-01-13',
      '2026-04-09', '2026-04-10', '2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17',
      '2026-04-20', '2026-04-21',
      '2026-06-01',
    ],
    halfDay: [],
  },
  'CON-MDT-001': {
    // Sheikh Taha Adnan
    leaves: ['2026-03-03', '2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27'],
    wfh: [],
    halfDay: [],
  },
  'CON-HR-001': {
    // Tahreem Waheed
    leaves: ['2026-02-16', '2026-03-09', '2026-05-08', '2026-06-10', '2026-06-30'],
    wfh: [],
    halfDay: [],
  },
  'CON-MDT-003': {
    // Tayyab Hussain
    leaves: ['2026-04-09', '2026-05-08', '2026-06-03'],
    wfh: [],
    halfDay: ['2026-06-02'],
  },
  'CON-UIUX-006': {
    // Umar Ameen
    leaves: ['2026-01-12', '2026-01-30', '2026-03-05', '2026-03-23', '2026-03-24', '2026-04-20'],
    wfh: [],
    halfDay: [],
  },
  'CON-MDT-002': {
    // Usman Ali
    leaves: ['2026-01-22', '2026-03-16', '2026-04-30'],
    wfh: [],
    halfDay: [],
  },
  'CON-UIUX-004': {
    // Muhammad Usman Saeed
    leaves: ['2026-03-09', '2026-03-24'],
    wfh: [],
    halfDay: [],
  },
  'CON-UIUX-003': {
    // Zuhaa Jutt — joined 2026-06-01
    leaves: ['2026-06-15'],
    wfh: [],
    halfDay: [],
    joinFrom: '2026-06-01',
  },
}

const ALL_CODES = Object.keys(SPECS)

function isWeekday(date) {
  const day = date.getUTCDay() // 0 Sun .. 6 Sat
  return day >= 1 && day <= 5
}

async function preflight() {
  const res = await prisma.employee.updateMany({
    where: { employeeCode: 'CON-UIUX-006' },
    data: { status: 'ACTIVE', exitDate: null },
  })
  const emp = await prisma.employee.findUnique({ where: { employeeCode: 'CON-UIUX-006' } })
  console.log(`[preflight] Umar Ameen updated: count=${res.count}, status=${emp?.status}, exitDate=${emp?.exitDate}`)
  if (emp?.status !== 'ACTIVE') throw new Error('Umar Ameen status not ACTIVE after preflight')
}

async function main() {
  await preflight()

  const employees = await prisma.employee.findMany({
    where: { employeeCode: { in: ALL_CODES } },
    select: { id: true, employeeCode: true, fullName: true, joiningDate: true, workDays: true },
  })

  const byCode = new Map(employees.map((e) => [e.employeeCode, e]))
  for (const code of ALL_CODES) {
    if (!byCode.has(code)) console.warn(`[warn] employeeCode ${code} not found in DB`)
  }

  // Plan phase
  const plans = [] // { emp, ops: [{date, action, status, existing}] }
  let totalInsert = 0
  let totalUpdate = 0
  let totalSkip = 0

  for (const code of ALL_CODES) {
    const emp = byCode.get(code)
    if (!emp) continue
    const spec = SPECS[code]

    const startDate = spec.joinFrom
      ? new Date(spec.joinFrom + 'T00:00:00Z')
      : (emp.joiningDate && new Date(emp.joiningDate) > JAN1 ? new Date(Date.UTC(new Date(emp.joiningDate).getUTCFullYear(), new Date(emp.joiningDate).getUTCMonth(), new Date(emp.joiningDate).getUTCDate())) : JAN1)

    // Fetch existing rows in range
    const existing = await prisma.attendanceLog.findMany({
      where: {
        employeeId: emp.id,
        date: { gte: startDate, lte: END },
      },
      select: { id: true, date: true, status: true },
    })
    const existingByDate = new Map(existing.map((r) => [ymd(new Date(r.date)), r]))

    const ops = []
    let cursor = startDate
    while (cursor <= END) {
      if (isWeekday(cursor)) {
        const key = ymd(cursor)
        const ex = existingByDate.get(key)

        // Compute expected
        let expected = 'PRESENT'
        if (spec.leaves.includes(key)) expected = 'LEAVE'
        else if (spec.wfh.includes(key)) expected = 'WFH'
        else if (spec.halfDay.includes(key)) expected = 'HALF_DAY'

        if (ex) {
          if (ex.status === 'HOLIDAY') {
            ops.push({ date: key, action: 'skip', reason: 'HOLIDAY' })
          } else if (key === MAY25) {
            // Keep existing (usually WFH)
            ops.push({ date: key, action: 'skip', reason: `keep May25 (${ex.status})` })
          } else if (key === JUN12 && ex.status === 'ABSENT') {
            ops.push({ date: key, action: 'update', from: ex.status, to: 'PRESENT', id: ex.id })
          } else if (ex.status === expected) {
            ops.push({ date: key, action: 'skip', reason: `already ${expected}` })
          } else {
            ops.push({ date: key, action: 'update', from: ex.status, to: expected, id: ex.id })
          }
        } else {
          // No row — but for May25, spec says keep existing WFH. If no row, insert PRESENT (spec default) — unless override.
          ops.push({ date: key, action: 'insert', to: expected })
        }
      }
      cursor = addDays(cursor, 1)
    }

    const ins = ops.filter((o) => o.action === 'insert').length
    const upd = ops.filter((o) => o.action === 'update').length
    const skp = ops.filter((o) => o.action === 'skip').length
    totalInsert += ins
    totalUpdate += upd
    totalSkip += skp

    plans.push({ emp, ops, ins, upd, skp })
    console.log(`[plan] ${emp.fullName} (${code}): insert=${ins} update=${upd} skip=${skp}`)
  }

  console.log(`\n=== Plan totals ===`)
  console.log(`Would insert: ${totalInsert} rows`)
  console.log(`Would update: ${totalUpdate} rows`)
  console.log(`Would skip:   ${totalSkip} rows`)

  console.log('WRITE MODE — proceeding')

  const results = []
  for (const p of plans) {
    let inserted = 0
    let updated = 0
    let skipped = p.skp
    await prisma.$transaction(async (tx) => {
      for (const op of p.ops) {
        const dt = new Date(op.date + 'T00:00:00Z')
        if (op.action === 'insert') {
          await tx.attendanceLog.create({
            data: {
              employeeId: p.emp.id,
              date: dt,
              status: op.to,
              workType: op.to === 'WFH' ? 'WFH' : 'ONSITE',
            },
          })
          inserted++
        } else if (op.action === 'update') {
          await tx.attendanceLog.update({
            where: { id: op.id },
            data: {
              status: op.to,
              workType: op.to === 'WFH' ? 'WFH' : 'ONSITE',
            },
          })
          updated++
        }
      }
    }, { timeout: 120000, maxWait: 30000 })
    results.push({ code: p.emp.employeeCode, name: `${p.emp.fullName}`, inserted, updated, skipped, empId: p.emp.id })
    console.log(`[write] ${p.emp.fullName} (${p.emp.employeeCode}): inserted ${inserted}, updated ${updated}, skipped ${skipped}`)
  }

  // Verification
  console.log(`\n=== Verification ===`)
  for (const r of results) {
    const emp = byCode.get(r.code)
    const spec = SPECS[r.code]
    const startDate = spec.joinFrom
      ? new Date(spec.joinFrom + 'T00:00:00Z')
      : (emp.joiningDate && new Date(emp.joiningDate) > JAN1 ? new Date(Date.UTC(new Date(emp.joiningDate).getUTCFullYear(), new Date(emp.joiningDate).getUTCMonth(), new Date(emp.joiningDate).getUTCDate())) : JAN1)

    // Count workdays expected
    let expectedWorkdays = 0
    let cursor = startDate
    while (cursor <= END) {
      if (isWeekday(cursor)) expectedWorkdays++
      cursor = addDays(cursor, 1)
    }
    const rows = await prisma.attendanceLog.count({
      where: {
        employeeId: r.empId,
        date: { gte: startDate, lte: END },
        status: { in: ['PRESENT', 'WFH', 'LEAVE', 'HALF_DAY', 'ABSENT', 'LATE'] },
      },
    })
    const holidays = await prisma.attendanceLog.count({
      where: {
        employeeId: r.empId,
        date: { gte: startDate, lte: END },
        status: 'HOLIDAY',
      },
    })
    const totalCovered = rows + holidays
    const match = totalCovered === expectedWorkdays ? 'OK' : `MISMATCH (rows=${rows} + holidays=${holidays} vs expected=${expectedWorkdays})`
    console.log(`[verify] ${r.name} (${r.code}): workdays=${expectedWorkdays} covered=${totalCovered} — ${match}`)
  }

  console.log('\nAttendance backfill complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
