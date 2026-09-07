/**
 * The sandwich rule, spent.
 *
 * `SandwichDeduction` has been computing an amount — the unpaid days a Friday
 * or Monday without notice carries — and nothing ever charged it. A row could
 * say PKR 8,000 APPLIED and the payslip for that month would still pay the
 * full net, because payroll never looked.
 *
 * Only APPLIED rows count. Waiving is the whole point of the decision: a
 * waived row keeps the record and stops the charge, so it must leave no trace
 * on the slip.
 *
 * The stored `amount` is used as-is. It was worked out from the month's own
 * net and the calendar length of that month at the moment HR decided, and
 * stored precisely so a later pay rise cannot move a charge that has already
 * been made.
 */
import { prisma } from '@/lib/prisma'

/** Applied sandwich charges for a payroll month, by employee id. */
export async function sandwichByEmployee(
  month: number, year: number,
): Promise<Map<string, number>> {
  const rows = await prisma.sandwichDeduction.findMany({
    where: { month, year, status: 'APPLIED' },
    select: { employeeId: true, amount: true },
  })
  const out = new Map<string, number>()
  for (const r of rows) {
    out.set(r.employeeId, (out.get(r.employeeId) ?? 0) + r.amount)
  }
  return out
}

/** One employee's applied charge for a month. */
export async function sandwichFor(
  employeeId: string, month: number, year: number,
): Promise<number> {
  const rows = await prisma.sandwichDeduction.findMany({
    where: { employeeId, month, year, status: 'APPLIED' },
    select: { amount: true },
  })
  return rows.reduce((s, r) => s + r.amount, 0)
}

/**
 * Net pay never goes below zero. A three-day charge cannot exceed a month's
 * pay in practice, but a run of them in one month could, and a negative net
 * would reach the bank file.
 */
export function applySandwich(netSalary: number, sandwich: number): number {
  return Math.max(0, Math.round((netSalary - sandwich) * 100) / 100)
}

/**
 * Push a sandwich decision onto the payslip that already exists.
 *
 * Recompute is not enough on its own: it deliberately skips HR-adjusted
 * payslips, and twelve of September's twenty-three are adjusted — including
 * the one this rule was first applied to. A charge that silently misses every
 * hand-edited slip is worse than no charge at all, because the screen says
 * APPLIED either way.
 *
 * Idempotent by construction. The net is rebuilt as
 *   (current net + the charge already on the slip) − the charge now decided
 * so applying twice, waiving, or reinstating all land on the same figure
 * rather than compounding.
 *
 * Returns what it touched, so the caller can say so.
 */
/**
 * The bank row carries a note, and a payment that is short by three days'
 * pay should say why on the line the bank sees. Tagged so it can be cleared
 * again when the charge goes, without touching anything HR typed.
 */
export const SANDWICH_NOTE = 'Sandwich:'

export async function syncSandwichToPayslips(
  employeeId: string, month: number, year: number,
): Promise<{ payslipId: string; from: number; to: number; charge: number }[]> {
  const charge = await sandwichFor(employeeId, month, year)

  const slips = await prisma.payslip.findMany({
    where: { employeeId, month, year },
    select: {
      id: true, netSalary: true, sandwichDeduction: true,
      transactionAmount: true, status: true, payoutNotes: true,
    },
  })

  // How many unpaid days, so the note says something a person can check.
  const detail = charge > 0
    ? await prisma.sandwichDeduction.findMany({
      where: { employeeId, month, year, status: 'APPLIED' },
      select: { days: true },
    })
    : []
  const unpaidDays = detail.reduce((s, d) => s + d.days, 0)
  const noteText = charge > 0
    ? `${SANDWICH_NOTE} ${unpaidDays} unpaid day${unpaidDays === 1 ? '' : 's'} `
      + `(PKR ${charge.toLocaleString('en-PK', { maximumFractionDigits: 2 })}) deducted`
    : null

  const touched: { payslipId: string; from: number; to: number; charge: number }[] = []
  for (const s of slips) {
    // A slip that has already gone out is history. Correcting it is a
    // conversation with the employee, not a silent overwrite.
    if (s.status === 'SENT') continue

    const already = s.sandwichDeduction ?? 0
    const base = s.netSalary + already
    const next = applySandwich(base, charge)
    const noteAlreadyRight = (!s.payoutNotes && !noteText)
      || (s.payoutNotes ?? null) === noteText
      || (s.payoutNotes != null && !s.payoutNotes.startsWith(SANDWICH_NOTE))
    if (next === s.netSalary && already === charge && noteAlreadyRight) continue

    // The bank amount only follows when it was tracking net. If HR typed a
    // different payout figure, that stands.
    const tracksNet = s.transactionAmount == null || s.transactionAmount === s.netSalary

    // Only ever write over our own note, or an empty one.
    const ours = !s.payoutNotes || s.payoutNotes.startsWith(SANDWICH_NOTE)
    const nextNote = ours ? noteText : s.payoutNotes

    await prisma.payslip.update({
      where: { id: s.id },
      data: {
        sandwichDeduction: charge,
        netSalary: next,
        ...(tracksNet ? { transactionAmount: next } : {}),
        ...(ours ? { payoutNotes: nextNote } : {}),
      },
    })
    touched.push({ payslipId: s.id, from: s.netSalary, to: next, charge })
  }

  // The run total has to follow the slips it is the sum of.
  if (touched.length) {
    const runs = await prisma.payslip.findMany({
      where: { id: { in: touched.map((t) => t.payslipId) } },
      select: { payrollRunId: true },
    })
    for (const runId of new Set(runs.map((r) => r.payrollRunId).filter(Boolean) as string[])) {
      const rows = await prisma.payslip.findMany({
        where: { payrollRunId: runId }, select: { netSalary: true },
      })
      await prisma.payrollRun.update({
        where: { id: runId },
        data: { totalNet: rows.reduce((s, r) => s + r.netSalary, 0) },
      })
    }
  }
  return touched
}

/**
 * A sandwich decision can only be changed while its own payroll month is still
 * the current one.
 *
 * Once a month is behind us its payroll has been run, approved and in most
 * cases paid. Reinstating a charge against August in October does not take
 * money back — it silently rewrites a figure somebody has already been paid
 * and signed off. The decision stays visible; it just stops being editable.
 */
export function isCurrentPayrollMonth(month: number, year: number, now = new Date()): boolean {
  return month === now.getMonth() + 1 && year === now.getFullYear()
}

/** Said the same way on screen and in the refusal. */
export function closedMonthReason(month: number, year: number): string {
  const label = new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  return `${label} payroll has closed — this decision can no longer be changed.`
}
