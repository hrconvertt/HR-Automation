import { prisma } from '@/lib/prisma'

export interface PayrollConfig {
  standardHoursPerDay: number    // default 8
  overtimeMultiplier: number     // default 2 (Pakistan Factories Act — used by legacy hourly calc)
  // ── OT Allowance (Convertt formula) ──
  // OT Allowance = (otHours / otAllowanceTargetHours) × otAllowanceCapPkr
  otAllowanceTargetHours: number // default 48 (monthly target)
  otAllowanceCapPkr: number      // default 10000 (full allowance when target met or exceeded)
  lateThresholdHour: number      // default 10
  lateThresholdMinute: number    // default 15
  endOfDayHour: number           // default 18 — past this, no-show → Absent
  eobiEnabled: boolean
  eobiEmployeeRate: number       // fraction, e.g. 0.01 = 1% of the wage base
  eobiEmployerRate: number       // fraction, e.g. 0.05 = 5% of the wage base
  // The statutory wage base EOBI is calculated on — the provincial minimum
  // wage, not the employee's actual salary. Editable because it is revised, and
  // it differs by province (Balochistan currently differs from the others).
  eobiWageBase: number           // PKR, default 40000
  eobiCap: number                // computed = wageBase × employeeRate; kept for downstream calc
  // Org/branch province. Minimum wage and social-security bodies vary by it.
  province: string               // Punjab | Sindh | KPK | Balochistan | ICT | GB | AJK
  // ── End-of-service benefit ──
  // An employer runs ONE of these, not both: statutory Gratuity (Standing
  // Orders) or a Provident Fund. Mutually exclusive by design.
  endOfServiceScheme: 'gratuity' | 'provident_fund' | 'none'
  // Gratuity = N days' wages per completed year of service. Standing Orders
  // set 30; kept editable because some contracts/provinces are more generous.
  gratuityDaysPerYear: number    // default 30
  gratuityEligibilityMonths: number // min service before any gratuity accrues, default 12
  // Provident Fund — employee and employer each contribute a % of Basic, and
  // the employer's share vests to the employee after a minimum service period.
  pfEmployeeRate: number         // fraction of Basic, default 0.0833 (one-twelfth)
  pfEmployerRate: number         // fraction of Basic, default 0.0833
  pfVestingMonths: number        // employer share forfeited if the employee leaves before this, default 24
  // ── Provincial Social Security ──
  // Each province runs its own institution (PESSI/SESSI/KPESSI/BESSI). Employer
  // pays the larger share; contribution is on a capped "secured" wage, not full
  // salary, and only for workers earning at or below the wage ceiling.
  socialSecurityEnabled: boolean
  socialSecurityInstitution: string // PESSI | SESSI | KPESSI | BESSI | ICT-ESSI
  ssEmployeeRate: number         // fraction of secured wage, default 0.01
  ssEmployerRate: number         // fraction of secured wage, default 0.06
  ssWageCeiling: number          // PKR/month — only employees at/below this are covered, default 25000
  taxEnabled: boolean
  // ── Leave-linked pay ──
  // How a day of leave-without-pay is priced: on gross or basic, divided by
  // calendar days in the month or by working days.
  lwpRateBasis: 'gross' | 'basic'          // default gross
  lwpDayDivisor: 'calendar' | 'working'    // default calendar
  leaveEncashmentEnabled: boolean          // pay out unused leave
  leaveEncashmentBasis: 'gross' | 'basic'  // default basic
  // ── Full & Final settlement (on exit) ──
  fnfNoticeRecovery: boolean       // recover salary for unserved notice period
  fnfEncashUnusedLeave: boolean    // pay out remaining leave balance
  fnfIncludeGratuity: boolean      // include the end-of-service benefit in the settlement
  workingDays: string[]
  // ── Pay cycle ──
  payFrequency: 'monthly' | 'bi_weekly' | 'weekly' // default monthly
  // ── Payroll calendar (day-of-month) ──
  payrollCutoffDay: number       // default 25 — last day to finalise inputs
  payrollReviewDays: number      // default 2  — CEO review window (days)
  payrollDisburseDay: number     // default 28 — day salaries hit accounts
}

const DEFAULTS: PayrollConfig = {
  standardHoursPerDay: 8,
  overtimeMultiplier: 2,
  otAllowanceTargetHours: 48,
  otAllowanceCapPkr: 10000,
  lateThresholdHour: 10,
  lateThresholdMinute: 15,
  endOfDayHour: 18,
  eobiEnabled: false,
  eobiEmployeeRate: 0.01,
  eobiEmployerRate: 0.05,
  eobiWageBase: 40000,
  eobiCap: 400,          // 40000 × 1%
  province: 'Punjab',
  endOfServiceScheme: 'gratuity',
  gratuityDaysPerYear: 30,
  gratuityEligibilityMonths: 12,
  pfEmployeeRate: 0.0833,
  pfEmployerRate: 0.0833,
  pfVestingMonths: 24,
  socialSecurityEnabled: false,
  socialSecurityInstitution: 'PESSI',
  ssEmployeeRate: 0.01,
  ssEmployerRate: 0.06,
  ssWageCeiling: 25000,
  taxEnabled: false,
  lwpRateBasis: 'gross',
  lwpDayDivisor: 'calendar',
  leaveEncashmentEnabled: false,
  leaveEncashmentBasis: 'basic',
  fnfNoticeRecovery: true,
  fnfEncashUnusedLeave: true,
  fnfIncludeGratuity: true,
  workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  payFrequency: 'monthly',
  payrollCutoffDay: 25,
  payrollReviewDays: 2,
  payrollDisburseDay: 28,
}

export async function getPayrollConfig(): Promise<PayrollConfig> {
  const rows = await prisma.config.findMany({
    where: {
      key: {
        in: [
          'standardHoursPerDay',
          'overtimeMultiplier',
          'otAllowanceTargetHours',
          'otAllowanceCapPkr',
          'lateThresholdHour',
          'lateThresholdMinute',
          'endOfDayHour',
          'eobiEnabled',
          'eobiEmployeeRate',
          'eobiEmployerRate',
          'eobiWageBase',
          'eobiCap',
          'province',
          'endOfServiceScheme',
          'gratuityDaysPerYear',
          'gratuityEligibilityMonths',
          'pfEmployeeRate',
          'pfEmployerRate',
          'pfVestingMonths',
          'socialSecurityEnabled',
          'socialSecurityInstitution',
          'ssEmployeeRate',
          'ssEmployerRate',
          'ssWageCeiling',
          'taxEnabled',
          'lwpRateBasis',
          'lwpDayDivisor',
          'leaveEncashmentEnabled',
          'leaveEncashmentBasis',
          'fnfNoticeRecovery',
          'fnfEncashUnusedLeave',
          'fnfIncludeGratuity',
          'workingDays',
          'payFrequency',
          'payrollCutoffDay',
          'payrollReviewDays',
          'payrollDisburseDay',
        ],
      },
    },
  })

  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))

  return {
    standardHoursPerDay: map.standardHoursPerDay ? Number(map.standardHoursPerDay) : DEFAULTS.standardHoursPerDay,
    overtimeMultiplier: map.overtimeMultiplier ? Number(map.overtimeMultiplier) : DEFAULTS.overtimeMultiplier,
    otAllowanceTargetHours: map.otAllowanceTargetHours ? Number(map.otAllowanceTargetHours) : DEFAULTS.otAllowanceTargetHours,
    otAllowanceCapPkr: map.otAllowanceCapPkr ? Number(map.otAllowanceCapPkr) : DEFAULTS.otAllowanceCapPkr,
    lateThresholdHour: map.lateThresholdHour ? Number(map.lateThresholdHour) : DEFAULTS.lateThresholdHour,
    lateThresholdMinute: map.lateThresholdMinute ? Number(map.lateThresholdMinute) : DEFAULTS.lateThresholdMinute,
    endOfDayHour: map.endOfDayHour ? Number(map.endOfDayHour) : DEFAULTS.endOfDayHour,
    eobiEnabled: map.eobiEnabled ? map.eobiEnabled === 'true' : DEFAULTS.eobiEnabled,
    eobiEmployeeRate: map.eobiEmployeeRate ? Number(map.eobiEmployeeRate) : DEFAULTS.eobiEmployeeRate,
    eobiEmployerRate: map.eobiEmployerRate ? Number(map.eobiEmployerRate) : DEFAULTS.eobiEmployerRate,
    eobiWageBase: map.eobiWageBase ? Number(map.eobiWageBase) : DEFAULTS.eobiWageBase,
    eobiCap: map.eobiCap ? Number(map.eobiCap) : DEFAULTS.eobiCap,
    province: map.province ? map.province : DEFAULTS.province,
    endOfServiceScheme: (map.endOfServiceScheme as PayrollConfig['endOfServiceScheme']) || DEFAULTS.endOfServiceScheme,
    gratuityDaysPerYear: map.gratuityDaysPerYear ? Number(map.gratuityDaysPerYear) : DEFAULTS.gratuityDaysPerYear,
    gratuityEligibilityMonths: map.gratuityEligibilityMonths ? Number(map.gratuityEligibilityMonths) : DEFAULTS.gratuityEligibilityMonths,
    pfEmployeeRate: map.pfEmployeeRate ? Number(map.pfEmployeeRate) : DEFAULTS.pfEmployeeRate,
    pfEmployerRate: map.pfEmployerRate ? Number(map.pfEmployerRate) : DEFAULTS.pfEmployerRate,
    pfVestingMonths: map.pfVestingMonths ? Number(map.pfVestingMonths) : DEFAULTS.pfVestingMonths,
    socialSecurityEnabled: map.socialSecurityEnabled ? map.socialSecurityEnabled === 'true' : DEFAULTS.socialSecurityEnabled,
    socialSecurityInstitution: map.socialSecurityInstitution || DEFAULTS.socialSecurityInstitution,
    ssEmployeeRate: map.ssEmployeeRate ? Number(map.ssEmployeeRate) : DEFAULTS.ssEmployeeRate,
    ssEmployerRate: map.ssEmployerRate ? Number(map.ssEmployerRate) : DEFAULTS.ssEmployerRate,
    ssWageCeiling: map.ssWageCeiling ? Number(map.ssWageCeiling) : DEFAULTS.ssWageCeiling,
    taxEnabled: map.taxEnabled ? map.taxEnabled === 'true' : DEFAULTS.taxEnabled,
    lwpRateBasis: (map.lwpRateBasis as PayrollConfig['lwpRateBasis']) || DEFAULTS.lwpRateBasis,
    lwpDayDivisor: (map.lwpDayDivisor as PayrollConfig['lwpDayDivisor']) || DEFAULTS.lwpDayDivisor,
    leaveEncashmentEnabled: map.leaveEncashmentEnabled ? map.leaveEncashmentEnabled === 'true' : DEFAULTS.leaveEncashmentEnabled,
    leaveEncashmentBasis: (map.leaveEncashmentBasis as PayrollConfig['leaveEncashmentBasis']) || DEFAULTS.leaveEncashmentBasis,
    fnfNoticeRecovery: map.fnfNoticeRecovery ? map.fnfNoticeRecovery === 'true' : DEFAULTS.fnfNoticeRecovery,
    fnfEncashUnusedLeave: map.fnfEncashUnusedLeave ? map.fnfEncashUnusedLeave === 'true' : DEFAULTS.fnfEncashUnusedLeave,
    fnfIncludeGratuity: map.fnfIncludeGratuity ? map.fnfIncludeGratuity === 'true' : DEFAULTS.fnfIncludeGratuity,
    workingDays: map.workingDays ? JSON.parse(map.workingDays) : DEFAULTS.workingDays,
    payFrequency: (map.payFrequency as PayrollConfig['payFrequency']) || DEFAULTS.payFrequency,
    payrollCutoffDay: map.payrollCutoffDay ? Number(map.payrollCutoffDay) : DEFAULTS.payrollCutoffDay,
    payrollReviewDays: map.payrollReviewDays ? Number(map.payrollReviewDays) : DEFAULTS.payrollReviewDays,
    payrollDisburseDay: map.payrollDisburseDay ? Number(map.payrollDisburseDay) : DEFAULTS.payrollDisburseDay,
  }
}

export async function savePayrollConfig(updates: Partial<PayrollConfig>): Promise<void> {
  const entries = Object.entries(updates).map(([key, value]) => ({
    key,
    value: Array.isArray(value) ? JSON.stringify(value) : String(value),
  }))

  await Promise.all(
    entries.map((e) =>
      prisma.config.upsert({
        where: { key: e.key },
        create: { key: e.key, value: e.value },
        update: { value: e.value },
      })
    )
  )
}

// Seed defaults into DB if not present
export async function ensureConfigDefaults(): Promise<void> {
  const entries = Object.entries(DEFAULTS).map(([key, value]) => ({
    key,
    value: Array.isArray(value) ? JSON.stringify(value) : String(value),
  }))

  await Promise.all(
    entries.map((e) =>
      prisma.config.upsert({
        where: { key: e.key },
        create: { key: e.key, value: e.value },
        update: {},  // never overwrite existing
      })
    )
  )
}
