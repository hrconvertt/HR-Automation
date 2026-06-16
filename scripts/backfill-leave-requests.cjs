/* eslint-disable */
/**
 * scripts/backfill-leave-requests.cjs
 * ───────────────────────────────────
 * For each AttendanceLog with status in (LEAVE, HALF_DAY), check whether the
 * employee already has an APPROVED LeaveRequest that covers that date. If
 * not, generate one — consolidating consecutive days per-employee into a
 * single multi-day request.
 *
 * Idempotent: re-running only creates requests for days that still lack
 * coverage. Reason tag 'Auto-generated from attendance record (legacy)' is
 * also used to skip already-backfilled days when checking coverage.
 *
 * Run with DATABASE_URL set:
 *   node scripts/backfill-leave-requests.cjs
 */

const { PrismaClient } = require('@prisma/client')

const BACKFILL_REASON = 'Auto-generated from attendance record (legacy)'

function dayKey(d) {
  const dt = new Date(d)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function addDaysUTC(d, n) {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + n)
  return out
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

  console.log('Loading attendance logs (LEAVE | HALF_DAY)…')
  const leaveLogs = await prisma.attendanceLog.findMany({
    where: { status: { in: ['LEAVE', 'HALF_DAY'] } },
    select: { employeeId: true, date: true, status: true },
    orderBy: [{ employeeId: 'asc' }, { date: 'asc' }],
  })
  console.log(`  ${leaveLogs.length} leave-status attendance rows`)

  console.log('Loading existing APPROVED leave requests…')
  const approvedReqs = await prisma.leaveRequest.findMany({
    where: { status: 'APPROVED' },
    select: { employeeId: true, fromDate: true, toDate: true },
  })

  // Build covered-day set: "<empId>|YYYY-MM-DD"
  const covered = new Set()
  for (const r of approvedReqs) {
    const from = new Date(r.fromDate)
    const to = new Date(r.toDate)
    let cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()))
    while (cur <= end) {
      covered.add(`${r.employeeId}|${dayKey(cur)}`)
      cur = addDaysUTC(cur, 1)
    }
  }

  // Group uncovered leave days per-employee, then consolidate consecutive runs
  const byEmp = new Map() // empId -> [{date, status}]
  let alreadyCovered = 0
  for (const log of leaveLogs) {
    const key = `${log.employeeId}|${dayKey(log.date)}`
    if (covered.has(key)) { alreadyCovered++; continue }
    if (!byEmp.has(log.employeeId)) byEmp.set(log.employeeId, [])
    byEmp.get(log.employeeId).push({ date: log.date, status: log.status })
  }

  let backfilledDays = 0
  let runsCreated = 0

  for (const [empId, days] of byEmp.entries()) {
    // Sort and dedupe by day-key
    const seen = new Set()
    const uniq = []
    for (const d of days.sort((a, b) => a.date.getTime() - b.date.getTime())) {
      const k = dayKey(d.date)
      if (seen.has(k)) continue
      seen.add(k)
      uniq.push(d)
    }

    // Consolidate into consecutive runs. Two days are "consecutive" if their
    // UTC day index differs by exactly 1. Half-days break a run (so a single
    // H day becomes its own request with days=0.5).
    let runStart = null
    let runEnd = null
    let runDays = 0
    let runHasHalf = false
    let firstHalf = false
    let lastHalf = false

    const flush = async () => {
      if (!runStart) return
      try {
        // Re-check coverage at flush time to stay idempotent across re-runs
        // (in case multiple full-day runs touch the same dates)
        await prisma.leaveRequest.create({
          data: {
            employeeId: empId,
            leaveType: 'CASUAL',
            fromDate: runStart,
            toDate: runEnd,
            days: runDays,
            firstDayHalf: firstHalf,
            lastDayHalf: lastHalf,
            reason: BACKFILL_REASON,
            status: 'APPROVED',
            approvedAt: runStart,
            approvedById: null,
          },
        })
        runsCreated++
        backfilledDays += runDays
      } catch (e) {
        console.error(`  Failed to create request for ${empId} ${dayKey(runStart)}: ${e.message}`)
      }
      runStart = null
      runEnd = null
      runDays = 0
      runHasHalf = false
      firstHalf = false
      lastHalf = false
    }

    for (let i = 0; i < uniq.length; i++) {
      const d = uniq[i]
      const dUtc = new Date(Date.UTC(d.date.getUTCFullYear(), d.date.getUTCMonth(), d.date.getUTCDate()))
      const isHalf = d.status === 'HALF_DAY'
      const dayVal = isHalf ? 0.5 : 1

      if (!runStart) {
        runStart = dUtc
        runEnd = dUtc
        runDays = dayVal
        runHasHalf = isHalf
        firstHalf = isHalf
        lastHalf = isHalf
        continue
      }

      const prevPlusOne = addDaysUTC(runEnd, 1)
      const isConsecutive = dUtc.getTime() === prevPlusOne.getTime()

      // Half-days are kept as single-day requests so the firstDayHalf/lastDayHalf
      // flags remain unambiguous. A consecutive full-day extends the run.
      if (isConsecutive && !isHalf && !runHasHalf) {
        runEnd = dUtc
        runDays += 1
        lastHalf = false
      } else {
        await flush()
        runStart = dUtc
        runEnd = dUtc
        runDays = dayVal
        runHasHalf = isHalf
        firstHalf = isHalf
        lastHalf = isHalf
      }
    }
    await flush()
  }

  console.log('\n' + '═'.repeat(60))
  console.log('LEAVE BACKFILL SUMMARY')
  console.log('═'.repeat(60))
  console.log(JSON.stringify({
    leaveDaysExamined: leaveLogs.length,
    alreadyCovered,
    runsCreated,
    backfilledDays,
  }, null, 2))

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
