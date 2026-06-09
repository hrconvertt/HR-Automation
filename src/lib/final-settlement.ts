// Auto-compute the final-settlement amount on an exit clearance.
//   prorataSalary       = (daysWorkedInFinalMonth / daysInMonth) × monthlyGross
//   leaveEncashment     = remainingAnnualLeave × dailyRate
//   outstandingDeductions = loan + advance balances from latest payslip
//   finalSettlementAmount = prorata + encashment - outstanding
//
// Pure-ish — touches Prisma but no I/O outside it. Safe to call from
// multiple flows (resignation ack, manual init, recompute action).

import { prisma } from '@/lib/prisma'

export interface SettlementResult {
  prorataSalary: number
  leaveEncashment: number
  outstandingDeductions: number
  finalSettlementAmount: number
  monthlyGross: number
  daysInMonth: number
  daysWorkedInMonth: number
  remainingAnnualLeave: number
  dailyRate: number
}

export async function computeFinalSettlement(
  employeeId: string,
  lastWorkingDay: Date | null,
): Promise<SettlementResult> {
  const last = lastWorkingDay ?? new Date()
  const year = last.getFullYear()
  const month = last.getMonth() // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysWorkedInMonth = Math.min(daysInMonth, last.getDate())

  const [salary, latestPayslip, annualBalance] = await Promise.all([
    prisma.salary.findUnique({ where: { employeeId } }),
    prisma.payslip.findFirst({ where: { employeeId }, orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
    prisma.leaveBalance.findFirst({ where: { employeeId, year, leaveType: 'ANNUAL' } }),
  ])

  const monthlyGross = salary
    ? salary.basic + salary.houseRent + salary.utilities + salary.food + salary.fuel + salary.medicalAllowance + salary.otherAllowance
    : 0

  const prorataSalary = daysInMonth > 0
    ? Math.round((daysWorkedInMonth / daysInMonth) * monthlyGross)
    : 0

  const dailyRate = daysInMonth > 0 ? monthlyGross / daysInMonth : 0
  const remainingAnnualLeave = annualBalance?.remaining ?? 0
  const leaveEncashment = Math.round(remainingAnnualLeave * dailyRate)

  const outstandingDeductions = latestPayslip
    ? Math.round(
        (latestPayslip.loanDeduction ?? 0) +
        (latestPayslip.vehicleDeduction ?? 0) +
        (latestPayslip.advanceDeduction ?? 0),
      )
    : 0

  const finalSettlementAmount = prorataSalary + leaveEncashment - outstandingDeductions

  return {
    prorataSalary,
    leaveEncashment,
    outstandingDeductions,
    finalSettlementAmount,
    monthlyGross,
    daysInMonth,
    daysWorkedInMonth,
    remainingAnnualLeave,
    dailyRate,
  }
}
