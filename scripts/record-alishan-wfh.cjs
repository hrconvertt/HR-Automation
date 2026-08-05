/**
 * Record Ali Shan's work-from-home request of 4 August 2026.
 *
 * Sent by email to HR at 10:29 that morning, copied to Momna as his lead, and
 * approved the same day. The reason is his own wording, not a summary: the
 * final day of the Data Sahib Urs, with the road closures that come with it.
 *
 * Approving it here writes the attendance for the day as WFH, which is what the
 * approval path does for any WFH request — so this ends up in exactly the state
 * it would have been in had it been raised in the app.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const DAY = new Date(Date.UTC(2026, 7, 4)) // 4 August 2026
const REASON =
  'Final day of the Data Sahib Urs — heavy rush and severe road blockages. '
  + 'Reaching home last night was already extremely difficult and travelling '
  + 'through this traffic today is not possible. Working remotely to stay fully '
  + 'productive without commute delays.'

;(async () => {
  const emp = await p.employee.findFirst({
    where: { fullName: 'Ali Shan' },
    select: { id: true, employeeCode: true, fullName: true, reportingManagerId: true },
  })
  if (!emp) { console.log('Ali Shan not found.'); return }

  const hr = await p.employee.findFirst({
    where: { employeeCode: 'CON-HR-032' },
    select: { id: true, fullName: true },
  })

  const existing = await p.leaveRequest.findFirst({
    where: { employeeId: emp.id, category: 'WFH', fromDate: DAY },
    select: { id: true },
  })
  if (existing) { console.log('Already recorded — nothing to do.'); return }

  console.log(`${emp.employeeCode}  ${emp.fullName}`)
  console.log(`  4 Aug 2026, work from home, 1 day, approved`)
  console.log(`  lead : ${emp.reportingManagerId ? 'Momna (reporting manager)' : 'none on record'}`)
  console.log(`  HR   : ${hr ? hr.fullName : 'not found'}`)
  console.log(`  reason: ${REASON}`)

  if (!APPLY) { console.log('\nDry run. Re-run with --apply to write.'); return }

  await p.$transaction(async (tx) => {
    await tx.leaveRequest.create({
      data: {
        employeeId: emp.id,
        category: 'WFH',
        // WFH spends no balance, but leaveType is required — CASUAL is the
        // neutral value and nothing reads it for a WFH row.
        leaveType: 'CASUAL',
        fromDate: DAY,
        toDate: DAY,
        days: 1,
        reason: REASON,
        status: 'APPROVED',
        managerApprovedById: emp.reportingManagerId,
        managerApprovedAt: new Date(Date.UTC(2026, 7, 4, 10, 45)),
        approvedById: hr ? hr.id : null,
        approvedAt: new Date(Date.UTC(2026, 7, 4, 11, 0)),
        approvalComment: 'Approved by email the same morning.',
      },
    })

    // A WFH day is a working day — present, from home.
    const log = await tx.attendanceLog.findFirst({
      where: { employeeId: emp.id, date: DAY },
      select: { id: true },
    })
    const data = {
      status: 'PRESENT',
      workType: 'WFH',
      hoursWorked: 8,
      notes: 'Auto-written from approved work from home',
    }
    if (log) await tx.attendanceLog.update({ where: { id: log.id }, data })
    else await tx.attendanceLog.create({ data: { employeeId: emp.id, date: DAY, ...data } })
  })

  console.log('\nRecorded.')
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
