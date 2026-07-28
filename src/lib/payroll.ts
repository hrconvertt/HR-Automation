export function calculateEOBI(basic: number, rate = 0.01, cap = 470): number {
  return Math.min(Math.round(basic * rate), cap)
}

/**
 * Pakistan FBR Income Tax Slabs 2025-26
 * Applied on monthly gross × 12 (annual gross)
 */
export function calculateIncomeTax(grossAnnual: number): number {
  if (grossAnnual <= 600000) return 0
  if (grossAnnual <= 1200000) {
    return (grossAnnual - 600000) * 0.025
  }
  if (grossAnnual <= 2400000) {
    return 15000 + (grossAnnual - 1200000) * 0.125
  }
  if (grossAnnual <= 3600000) {
    return 165000 + (grossAnnual - 2400000) * 0.2
  }
  if (grossAnnual <= 6000000) {
    return 405000 + (grossAnnual - 3600000) * 0.25
  }
  if (grossAnnual <= 12000000) {
    return 1005000 + (grossAnnual - 6000000) * 0.3
  }
  return 2805000 + (grossAnnual - 12000000) * 0.35
}

interface SalaryInput {
  basic: number
  hra?: number
  medical?: number
  conveyance?: number
  fuelAllowance?: number
  otherAllowances?: number
  // Distinct line items kept separately so the payslip line-items match what's
  // stored — preventing display-side double-counts when the payslip page sums
  // the individual fields.
  food?: number
  utilities?: number
}

export function calculateOvertimePay(
  basicSalary: number,
  workingDaysInMonth: number,
  overtimeHours: number,
  multiplier: number,
  standardHoursPerDay: number
): number {
  if (overtimeHours <= 0 || workingDaysInMonth <= 0) return 0
  const monthlyHours = workingDaysInMonth * standardHoursPerDay
  const hourlyRate = basicSalary / monthlyHours
  return Math.round(overtimeHours * hourlyRate * multiplier)
}

/**
 * Convertt OT Allowance formula:
 *   allowance = (otHours / targetHours) × capPkr
 * Capped at capPkr — going over targetHours doesn't earn extra.
 *
 * Defaults: targetHours=48, capPkr=10,000 → each OT hour earns PKR 208.33.
 */
export function calculateOvertimeAllowance(
  overtimeHours: number,
  targetHours = 48,
  capPkr = 10_000,
): number {
  if (overtimeHours <= 0 || targetHours <= 0) return 0
  const ratio = Math.min(1, overtimeHours / targetHours)
  return Math.round(ratio * capPkr)
}

interface PayslipResult {
  basic: number
  hra: number
  medical: number
  conveyance: number
  fuelAllowance: number
  otherAllowances: number
  food: number
  utilities: number
  allowances: number
  overtimePay: number
  overtimeAllowance: number
  grossPay: number
  eobi: number
  incomeTax: number
  totalDeductions: number
  netPay: number
  presentDays: number
  workingDays: number
  overtimeHours: number
  perDayRate: number
  hourlyRate: number
}

export function calculatePayslip(
  salary: SalaryInput,
  presentDays: number,
  workingDays: number,
  overtimeHours = 0,
  overtimeMultiplier = 2,
  standardHoursPerDay = 8,
  eobiRate = 0.01,
  eobiCap = 470,
  eobiEnabled = false,
  taxEnabled = false,
  otAllowanceTargetHours = 48,
  otAllowanceCapPkr = 10_000,
): PayslipResult {
  const basic = salary.basic ?? 0
  const hra = salary.hra ?? 0
  const medical = salary.medical ?? 0
  const conveyance = salary.conveyance ?? 0
  const fuelAllowance = salary.fuelAllowance ?? 0
  const otherAllowances = salary.otherAllowances ?? 0
  const food = salary.food ?? 0
  const utilities = salary.utilities ?? 0

  // Pro-rate if absent
  const effectiveDays = workingDays > 0 ? Math.min(presentDays, workingDays) : workingDays
  const ratio = workingDays > 0 ? effectiveDays / workingDays : 1

  const proratedBasic = Math.round(basic * ratio)
  const allowances = hra + medical + conveyance + fuelAllowance + otherAllowances + food + utilities
  const overtimePay = calculateOvertimePay(basic, workingDays, overtimeHours, overtimeMultiplier, standardHoursPerDay)
  const overtimeAllowance = calculateOvertimeAllowance(overtimeHours, otAllowanceTargetHours, otAllowanceCapPkr)
  const grossPay = proratedBasic + allowances + overtimePay + overtimeAllowance

  const eobi = eobiEnabled ? calculateEOBI(basic, eobiRate, eobiCap) : 0
  const annualGross = grossPay * 12
  const annualTax = taxEnabled ? calculateIncomeTax(annualGross) : 0
  const monthlyTax = Math.round(annualTax / 12)

  const totalDeductions = eobi + monthlyTax
  const netPay = Math.max(0, grossPay - totalDeductions)
  const perDayRate = workingDays > 0 ? Math.round(basic / workingDays) : 0
  const hourlyRate = workingDays > 0 ? Math.round(basic / (workingDays * standardHoursPerDay)) : 0

  return {
    basic: proratedBasic,
    hra,
    medical,
    conveyance,
    fuelAllowance,
    otherAllowances,
    food,
    utilities,
    allowances,
    overtimePay,
    overtimeAllowance,
    grossPay,
    eobi,
    incomeTax: monthlyTax,
    totalDeductions,
    netPay,
    presentDays: effectiveDays,
    workingDays,
    overtimeHours,
    perDayRate,
    hourlyRate,
  }
}
