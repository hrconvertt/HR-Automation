/**
 * Merge the duplicate Tahreem Waheed record.
 *
 * Approving the tahreemwaheed77@gmail.com sign-up created a second employee,
 * CON-HR-002, for a person who already existed as CON-HR-032. The real record
 * holds 10 payslips, 197 attendance rows, 6 leave requests, 4 documents and 4
 * compensation entries. The duplicate holds 10 attendance rows written today
 * and nothing else, which is why the same name appears twice in Roles.
 *
 * The login is not the duplicate's fault and must survive: that Gmail address
 * is a real personal account someone signs in with. So the user is repointed at
 * the real employee and the address is kept as their personal email — either
 * address then lands on the same person — and only the empty employee record is
 * removed.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const DUPLICATE_CODE = 'CON-HR-002'
const REAL_CODE = 'CON-HR-032'

;(async () => {
  const dup = await p.employee.findFirst({
    where: { employeeCode: DUPLICATE_CODE },
    include: { user: true, _count: { select: { payslips: true, attendanceLogs: true, leaveRequests: true, documents: true, compensationHistory: true } } },
  })
  const real = await p.employee.findFirst({
    where: { employeeCode: REAL_CODE },
    include: { user: true },
  })

  if (!dup) { console.log(`${DUPLICATE_CODE} not found — nothing to merge.`); return }
  if (!real) { console.log(`${REAL_CODE} not found — refusing to delete anything.`); return }

  // Never delete the one carrying the history, whichever code it sits under.
  const c = dup._count
  const carries = c.payslips + c.leaveRequests + c.documents + c.compensationHistory
  if (carries > 0) {
    console.log(`${DUPLICATE_CODE} carries ${carries} records beyond attendance — refusing.`)
    console.log(JSON.stringify(c))
    return
  }

  console.log(`Duplicate : ${dup.employeeCode}  ${dup.email}  (${c.attendanceLogs} attendance rows)`)
  console.log(`Keeping   : ${real.employeeCode}  ${real.email}`)
  console.log(`Login     : ${dup.user ? dup.user.email : 'none'} -> repointed to ${real.employeeCode}`)
  console.log(`Personal  : ${dup.email} -> stored as personalEmail on ${real.employeeCode}`)

  if (!APPLY) { console.log('\nDry run. Re-run with --apply to write.'); return }

  await p.$transaction(async (tx) => {
    // Keep the personal address reachable on the surviving record.
    if (dup.email && dup.email !== real.personalEmail) {
      await tx.employee.update({
        where: { id: real.id },
        data: { personalEmail: dup.email },
      })
    }
    // The login moves before the employee goes, so it is never orphaned.
    if (dup.user) {
      await tx.user.update({
        where: { id: dup.user.id },
        data: { employeeId: real.id },
      })
    }
    await tx.attendanceLog.deleteMany({ where: { employeeId: dup.id } })
    await tx.employee.delete({ where: { id: dup.id } })
  })

  console.log('\nMerged.')
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
