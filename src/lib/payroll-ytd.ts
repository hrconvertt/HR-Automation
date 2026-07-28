/**
 * Year-to-date payroll figures — Pakistani fiscal year (July–June).
 *
 * Computed on READ from finalized payslips; no schema needed. A payslip
 * counts toward YTD once it is finalized/paid (same set the employee-facing
 * views use), so DRAFT / in-approval runs never leak into YTD.
 */
import { prisma } from '@/lib/prisma'

/** Payslip statuses that count as "paid out" for YTD purposes. */
export const YTD_FINAL_STATUSES = ['APPROVED', 'RELEASED', 'FINALIZED', 'PAID', 'SENT']

/** The calendar year in which the fiscal year containing (month, year) starts. */
export function fiscalYearStart(month: number, year: number): number {
  return month >= 7 ? year : year - 1
}

/** "FY 2025-26" style label. */
export function fiscalYearLabel(month: number, year: number): string {
  const start = fiscalYearStart(month, year)
  return `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

export interface YtdFigures {
  gross: number
  tax: number
  eobi: number
  net: number
  /** Number of finalized payslips included. */
  slipCount: number
  fyStartYear: number
  fyLabel: string
}

/**
 * Sum finalized payslips for the employee within the fiscal year containing
 * (month, year), up to and INCLUDING that month.
 */
export async function getEmployeeYtd(
  employeeId: string,
  month: number,
  year: number,
): Promise<YtdFigures> {
  const fyStart = fiscalYearStart(month, year)
  const slips = await prisma.payslip.findMany({
    where: {
      employeeId,
      status: { in: YTD_FINAL_STATUSES },
      OR: [
        { year: fyStart, month: { gte: 7 } },
        { year: fyStart + 1, month: { lte: 6 } },
      ],
    },
    select: { month: true, year: true, grossSalary: true, incomeTax: true, eobi: true, netSalary: true },
  })

  const included = slips.filter(
    (p) => p.year < year || (p.year === year && p.month <= month),
  )

  return {
    gross: included.reduce((s, p) => s + p.grossSalary, 0),
    tax: included.reduce((s, p) => s + p.incomeTax, 0),
    eobi: included.reduce((s, p) => s + p.eobi, 0),
    net: included.reduce((s, p) => s + p.netSalary, 0),
    slipCount: included.length,
    fyStartYear: fyStart,
    fyLabel: fiscalYearLabel(month, year),
  }
}
