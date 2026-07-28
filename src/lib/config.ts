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
  eobiEmployeeRate: number
  eobiCap: number
  taxEnabled: boolean
  workingDays: string[]
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
  eobiCap: 470,
  taxEnabled: false,
  workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
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
          'eobiCap',
          'taxEnabled',
          'workingDays',
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
    eobiCap: map.eobiCap ? Number(map.eobiCap) : DEFAULTS.eobiCap,
    taxEnabled: map.taxEnabled ? map.taxEnabled === 'true' : DEFAULTS.taxEnabled,
    workingDays: map.workingDays ? JSON.parse(map.workingDays) : DEFAULTS.workingDays,
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
