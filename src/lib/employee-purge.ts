/**
 * Permanently remove an employee and everything that points at them — the
 * body of Trash's "Delete forever".
 *
 * Run inside a transaction. Child rows go first, then the employee, then the
 * login. Tables whose foreign key cascades or sets null look after
 * themselves; everything here is a key that would otherwise block the delete.
 * When a new model points at Employee without onDelete, add it here, or the
 * delete fails for anyone who has a row in it.
 *
 * Kept apart from the route so it can be tried inside a rolled-back
 * transaction against a real record before anyone presses the button.
 */
import type { Prisma } from '@prisma/client'

export async function purgeEmployee(tx: Prisma.TransactionClient, id: string, userId: string | null): Promise<void> {
  // Detach direct reports — they survive, but lose their manager pointer.
  await tx.employee.updateMany({ where: { reportingManagerId: id }, data: { reportingManagerId: null } })

  // Audit rows stay, without the pointer.
  await tx.auditLog.updateMany({ where: { employeeId: id }, data: { employeeId: null } })

  // Deductions first: a sandwich deduction is decided against attendance and
  // leave that are removed just below.
  await tx.sandwichDeduction.deleteMany({ where: { employeeId: id } })

  await tx.attendanceCorrection.deleteMany({ where: { employeeId: id } })
  await tx.attendancePunch.deleteMany({ where: { employeeId: id } })
  await tx.attendanceLog.deleteMany({ where: { employeeId: id } })
  await tx.leaveBalance.deleteMany({ where: { employeeId: id } })
  await tx.leaveRequest.deleteMany({ where: { employeeId: id } })
  await tx.leaveOfAbsence.deleteMany({ where: { employeeId: id } })
  await tx.payslip.deleteMany({ where: { employeeId: id } })
  await tx.compensationHistory.deleteMany({ where: { employeeId: id } })
  await tx.goal.deleteMany({ where: { employeeId: id } })
  await tx.performanceReview.deleteMany({ where: { employeeId: id } })
  // Their own appraisals go; ones they filled in for others stay, unsigned.
  await tx.appraisalForm.updateMany({ where: { reviewerId: id }, data: { reviewerId: null } })
  await tx.appraisalForm.deleteMany({ where: { employeeId: id } })
  await tx.showCause.deleteMany({ where: { employeeId: id } })
  await tx.employeeWarning.deleteMany({ where: { employeeId: id } })
  await tx.pIP.deleteMany({ where: { employeeId: id } })
  await tx.onboardingChecklist.deleteMany({ where: { employeeId: id } })
  await tx.employeeJourney.deleteMany({ where: { employeeId: id } })
  await tx.emailDraft.deleteMany({ where: { employeeId: id } })
  await tx.probationRecord.deleteMany({ where: { employeeId: id } })
  await tx.trainingRecord.deleteMany({ where: { employeeId: id } })
  await tx.certification.deleteMany({ where: { employeeId: id } })
  await tx.assetAssignment.deleteMany({ where: { employeeId: id } })
  await tx.employeeDocument.deleteMany({ where: { employeeId: id } })
  await tx.helpDeskTicket.deleteMany({ where: { employeeId: id } })
  await tx.notification.deleteMany({ where: { employeeId: id } })
  await tx.exitClearance.deleteMany({ where: { employeeId: id } })
  await tx.resignation.deleteMany({ where: { employeeId: id } })
  await tx.termination.deleteMany({ where: { employeeId: id } })
  await tx.managerHistory.deleteMany({ where: { employeeId: id } })
  await tx.promotionRequest.deleteMany({ where: { employeeId: id } })
  await tx.jobChange.deleteMany({ where: { employeeId: id } })
  await tx.onboardingFeedback.deleteMany({ where: { employeeId: id } })
  await tx.taskAssignment.deleteMany({ where: { employeeId: id } })
  await tx.letterRequest.deleteMany({ where: { employeeId: id } })
  await tx.trustedDevice.deleteMany({ where: { employeeId: id } })
  await tx.inviteToken.deleteMany({ where: { employeeId: id } })
  await tx.directMessage.deleteMany({ where: { OR: [{ senderId: id }, { recipientId: id }] } })

  // Recruiting and policy rows where they were the interviewer or reviewer.
  // The keys are required, so the rows cannot be detached — the same
  // unavoidable cost as kudos below.
  await tx.scorecard.deleteMany({ where: { interviewerId: id } })
  await tx.interviewSlot.deleteMany({ where: { interviewerId: id } })
  await tx.policyReview.deleteMany({ where: { reviewerId: id } })

  // Offers and requisitions are recruiting history; keep them, detached.
  await tx.jobOffer.updateMany({ where: { employeeId: id }, data: { employeeId: null } })
  await tx.jobRequisition.updateMany({ where: { requestedById: id }, data: { requestedById: null } })
  // Kudos: fromId/toId are required, so delete rather than detach.
  await tx.kudos.deleteMany({ where: { OR: [{ fromId: id }, { toId: id }] } })
  // CelebrationCard is keyed by forEmployeeId. Signatures cascade.
  await tx.celebrationCard.deleteMany({ where: { forEmployeeId: id } })
  await tx.salary.deleteMany({ where: { employeeId: id } })

  await tx.employee.delete({ where: { id } })
  if (userId) await tx.user.delete({ where: { id: userId } })
}
