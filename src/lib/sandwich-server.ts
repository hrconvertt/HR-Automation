/**
 * Server side of the sandwich rule — what a full month is worth, and the
 * warning that goes with a deduction.
 *
 * Kept apart from src/lib/sandwich.ts so the pure date and money maths stays
 * importable from a Client Component without dragging Prisma in with it.
 */

import { prisma } from '@/lib/prisma'
import { getPayrollConfig } from '@/lib/config'
import { calculatePayslip } from '@/lib/payroll'
import { daysInMonth, describeDates, TRIGGER_LABEL, type SandwichTrigger } from '@/lib/sandwich'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export const pkr = (n: number) =>
  'PKR ' + n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Net pay for a whole month worked in full.
 *
 * A real payslip for that month wins, when there is one for a month worked in
 * full. Zuhaa's salary components sum to 56,000 but her July payslip paid
 * 55,000 — the components and what was actually paid disagree, and a deduction
 * has to come off what she was actually paid. Deducting against a number she
 * never received would be wrong in the direction that costs her money.
 *
 * With no such payslip — a new joiner, a month not yet run — it falls back to
 * the same calculatePayslip the payroll generator uses, present days equal to
 * working days, so EOBI and tax settings still apply.
 */
export async function fullMonthNetFor(
  employeeId: string,
  year?: number,
  month?: number,
): Promise<number> {
  if (year && month) {
    const slip = await prisma.payslip.findFirst({
      where: { employeeId, year, month, netSalary: { gt: 0 } },
      select: { netSalary: true, presentDays: true, workingDays: true },
      orderBy: { createdAt: 'desc' },
    })
    // Only a full month tells us what a full month pays. A pro-rated slip is
    // the answer to a different question.
    if (slip && slip.workingDays > 0 && slip.presentDays >= slip.workingDays) {
      return slip.netSalary
    }
  }

  const salary = await prisma.salary.findUnique({ where: { employeeId } })
  if (!salary) return 0
  const cfg = await getPayrollConfig()

  // Any positive number works as the divisor here — present == working means a
  // full month either way, and the ratio is 1.
  const WHOLE_MONTH = 30
  const result = calculatePayslip(
    {
      basic: salary.basic,
      hra: salary.houseRent,
      medical: salary.medicalAllowance,
      conveyance: 0,
      fuelAllowance: salary.fuel,
      otherAllowances: salary.otherAllowance,
      food: salary.food,
      utilities: salary.utilities,
    },
    WHOLE_MONTH,
    WHOLE_MONTH,
    0,
    cfg.overtimeMultiplier,
    cfg.standardHoursPerDay,
    cfg.eobiEmployeeRate,
    cfg.eobiCap,
    cfg.eobiEnabled,
    cfg.taxEnabled,
    cfg.otAllowanceTargetHours,
    cfg.otAllowanceCapPkr,
  )
  return result.netPay
}

export interface WarningInput {
  fullName: string
  trigger: SandwichTrigger
  triggerDate: string       // YYYY-MM-DD
  dates: string[]
  days: number
  amount: number
  perDayAmount: number
  divisorDays: number
  month: number
  year: number
  leaveType?: string | null
  informed?: boolean        // did they tell anyone at all
  // The whole absence, which is often longer than the day that triggered the
  // rule. Zuhaa was away Thursday and Friday; a letter that opens by naming
  // only the Friday reads as though we had not noticed the Thursday.
  leaveFrom?: string        // YYYY-MM-DD
  leaveTo?: string          // YYYY-MM-DD
}

/** "Thursday, 09 July and Friday, 10 July 2026" — every day of the absence. */
function describeAbsence(from: string, to: string): string {
  const days: string[] = []
  const cursor = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  while (cursor <= end && days.length < 31) {
    days.push(cursor.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' }))
    cursor.setDate(cursor.getDate() + 1)
  }
  const year = new Date(`${to}T00:00:00`).getFullYear()
  if (days.length === 1) return `${days[0]} ${year}`
  return `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]} ${year}`
}

/**
 * The warning letter.
 *
 * Firm about what happened and what it costs, without being unpleasant about
 * it — this goes to someone who is probably about to be upset, and a letter
 * that reads as a telling-off gets argued with rather than understood. It
 * states the policy, the days, the arithmetic, and what to do differently.
 */
export function buildWarning(input: WarningInput): { subject: string; body: string } {
  const {
    fullName, trigger, triggerDate, dates, days, amount, perDayAmount,
    divisorDays, month, year, informed, leaveFrom, leaveTo,
  } = input

  const first = fullName.split(/\s+/)[0]
  const triggerLong = new Date(`${triggerDate}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
  const monthLabel = `${MONTHS[month - 1]} ${year}`
  const weekendPart = trigger === 'FRIDAY'
    ? 'the Saturday and Sunday that follow it'
    : 'the Saturday and Sunday before it'

  // The absence as it actually was, falling back to the trigger day alone.
  const multiDay = !!(leaveFrom && leaveTo && leaveFrom !== leaveTo)
  const absence = multiDay ? describeAbsence(leaveFrom!, leaveTo!) : triggerLong
  const subject = `Sandwich leave deduction — ${multiDay ? absence : triggerLong}`

  const body = [
    `Dear ${first},`,
    '',
    informed === false
      ? `You were away on ${absence} and we had no notice of it from HR or your lead beforehand.`
      : `This is regarding your leave on ${absence}.`,
    '',
    `Under section 5 of the Convertt Leave Policy, leave taken on a ${TRIGGER_LABEL[trigger]} without prior notice counts ${weekendPart} as well. `
      + `${multiDay ? `The ${TRIGGER_LABEL[trigger]} in question was ${triggerLong}, so that makes` : 'That makes'} ${days} unpaid days in total:`,
    '',
    `    ${describeDates(dates)}`,
    '',
    `These will be deducted from your ${monthLabel} salary. ${monthLabel} has ${divisorDays} days, so a day is ${pkr(perDayAmount)} of your net pay, and ${days} days come to ${pkr(amount)}.`,
    '',
    'To avoid this in future, please send leave requests to your lead ahead of the day and copy HR once they have approved. Where something genuinely could not be planned for — illness or an emergency — tell us as early in the day as you can and send the supporting documentation, and we will look at it on its merits.',
    '',
    'If you believe this has been recorded wrongly, reply to this email within three working days and we will review it with your lead.',
    '',
    'Regards,',
    'HR Department',
    'Convertt',
  ].join('\n')

  return { subject, body }
}

/** Same letter as simple HTML, in the type the rest of Convertt's mail uses. */
export function warningHtml(body: string): string {
  const style = 'margin:0 0 14px;font-family:Calibri,Segoe UI,Helvetica,Arial,sans-serif;'
    + 'font-size:15px;line-height:1.7;color:#1e293b;'
  return body
    .split('\n\n')
    .map((p) => `<p style="${style}white-space:pre-wrap;">${p
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('')
}

export { daysInMonth, MONTHS }
