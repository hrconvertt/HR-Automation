/**
 * Everything the Pay Cycle Command Center draws, in one server-side read.
 *
 * Modelled on Workday's Pay Cycle Command Center — the context bar, period
 * trending, YTD totals, audit summary, period comparison, pending
 * transactions, and the numbered step rail down the right — but built against
 * the data Convertt actually has rather than the data Workday assumes.
 *
 * Nothing here writes. Nothing here touches the existing payroll screens: this
 * is a read-only lens over the same runs, payslips and anomalies those screens
 * already own, and every action on it is a link into one of them.
 *
 * Three of Workday's cards do not survive a straight port, and drawing them
 * anyway would have produced charts that look authoritative and say nothing:
 *
 *   Pay groups — a pay group is who is paid together on what cycle, and
 *     Convertt has exactly one (monthlyPayDay is null on 39 of 40 salary
 *     rows). It stays in the context bar as a single value rather than
 *     becoming an axis.
 *
 *   YTD split by tax and benefit type — income tax, EOBI, provident fund and
 *     healthcare are zero on every 2026 payslip. The donut is split by
 *     earnings component instead, and the deductions that do exist are named
 *     underneath rather than rendered as four invisible slivers.
 *
 *   Overtime cost and hours — overtime hours are recorded nowhere, and
 *     overtime pay is PKR 14.5k across 2026 against PKR 265k of bonus. Bonus,
 *     overtime and arrears travel together as variable pay.
 */
import { prisma } from '@/lib/prisma'
import { getPayrollAnomalies, type PayrollAnomaly } from '@/lib/queries/payroll'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const SHORT = MONTHS.map((m) => m.slice(0, 3))

export interface Slice { name: string; value: number }

export interface PeriodPoint {
  month: number
  year: number
  label: string
  gross: number
  net: number
  slips: number
  status: string
}

export interface ComponentDelta {
  component: string
  prior: number
  selected: number
  difference: number
  pct: number | null
  /** Deductions are shown under their own heading. */
  group: 'Earnings' | 'Deductions' | 'Totals'
}

export interface StepTask {
  label: string
  href: string
  /** A live number worth acting on. Zero renders as nothing, not as "0". */
  count?: number
  /** Amber when this is a blocker rather than a count. */
  warn?: boolean
  note?: string
}

export interface StepGroup {
  step: string
  tasks: StepTask[]
}

export interface CommandCenterData {
  context: {
    country: string
    entity: string
    period: string
    month: number
    year: number
    payGroup: string
    runStatus: string | null
    runId: string | null
  }
  /** Every month that has a run, for the period picker. */
  periods: { month: number; year: number; label: string }[]
  trending: PeriodPoint[]
  ytd: {
    year: number
    gross: number
    net: number
    earnings: Slice[]
    deductions: Slice[]
    deductionTotal: number
    netAboveGross: number
  }
  audit: {
    /** Payslips with something flagged — the length of the anomaly list. */
    exceptions: number
    /** Payslips in the run. */
    payslips: number
    clean: number
    bySeverity: { severity: string; label: string; count: number }[]
    byKind: { kind: string; label: string; count: number }[]
    top: PayrollAnomaly[]
    priorMonth: { month: number; year: number } | null
  }
  compare: {
    priorLabel: string | null
    rows: ComponentDelta[]
  }
  pending: {
    total: number
    slices: Slice[]
  }
  steps: StepGroup[]
}

/** Months that have a payroll run, newest first. */
export async function listCommandCenterPeriods() {
  const runs = await prisma.payrollRun.findMany({
    select: { month: true, year: true },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })
  return runs.map((r) => ({
    month: r.month,
    year: r.year,
    label: `${MONTHS[r.month - 1]} ${r.year}`,
  }))
}

export async function getCommandCenter(
  month: number,
  year: number,
): Promise<CommandCenterData> {
  const periodStart = new Date(Date.UTC(year, month - 1, 1))
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59))
  const priorMonth = month === 1 ? 12 : month - 1
  const priorYear = month === 1 ? year - 1 : year

  const [
    entity, run, recentRuns, ytdAgg, active, slips,
    pendingAdvances, pendingLeave, periods, attendedIds,
  ] = await Promise.all([
    prisma.legalEntity.findFirst({ where: { isDefault: true } }),
    prisma.payrollRun.findFirst({
      where: { month, year },
      select: { id: true, status: true, totalNet: true, totalGross: true },
    }),
    prisma.payrollRun.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 6,
      select: {
        month: true, year: true, status: true, totalNet: true, totalGross: true,
        _count: { select: { payslips: true } },
      },
    }),
    prisma.payslip.aggregate({
      where: { year },
      _sum: {
        grossSalary: true, netSalary: true, basic: true, houseRent: true,
        utilities: true, food: true, fuel: true, medicalAllowance: true,
        otherAllowance: true, bonus: true, overtimePay: true, arrears: true,
        leaveEncashment: true, incomeTax: true, eobi: true, providentFund: true,
        healthcare: true, loanDeduction: true, vehicleDeduction: true,
        advanceDeduction: true, otherDeductions: true, lateDeduction: true,
        sandwichDeduction: true,
      },
    }),
    prisma.employee.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: {
        id: true, fullName: true, ibanAccount: true, bankAccount: true,
        salary: { select: { basic: true } },
      },
    }),
    prisma.payslip.findMany({
      where: { month, year },
      select: {
        employeeId: true, status: true, sentAt: true,
        employee: { select: { fullName: true, status: true } },
      },
    }),
    prisma.salaryAdvance.count({ where: { status: 'pending' } }),
    prisma.leaveRequest.count({
      where: { status: 'PENDING', fromDate: { lte: periodEnd }, toDate: { gte: periodStart } },
    }),
    listCommandCenterPeriods(),
    prisma.attendanceLog.findMany({
      where: { date: { gte: periodStart, lte: periodEnd } },
      select: { employeeId: true },
      distinct: ['employeeId'],
    }),
  ])

  // ── Context ───────────────────────────────────────────────────────────────
  const context = {
    country: entity?.country === 'AE' ? 'United Arab Emirates' : 'Pakistan',
    entity: entity ? `${entity.legalName} (${entity.code})` : 'Convertt',
    period: `${MONTHS[month - 1]} ${year}`,
    month,
    year,
    // Said plainly rather than dressed up as a group with one member.
    payGroup: 'Monthly · all staff',
    runStatus: run?.status ?? null,
    runId: run?.id ?? null,
  }

  // ── Period trending ───────────────────────────────────────────────────────
  const trending: PeriodPoint[] = recentRuns
    .map((r) => ({
      month: r.month,
      year: r.year,
      label: `${SHORT[r.month - 1]} ${String(r.year).slice(2)}`,
      gross: r.totalGross ?? 0,
      net: r.totalNet ?? 0,
      slips: r._count.payslips,
      status: r.status,
    }))
    .reverse()

  // ── Year to date ──────────────────────────────────────────────────────────
  const y = ytdAgg._sum
  const n = (v: number | null | undefined) => v ?? 0
  const earnings: Slice[] = [
    { name: 'Basic', value: n(y.basic) },
    { name: 'House rent', value: n(y.houseRent) },
    { name: 'Utilities', value: n(y.utilities) },
    { name: 'Allowances', value: n(y.food) + n(y.fuel) + n(y.medicalAllowance) + n(y.otherAllowance) },
    { name: 'Bonus', value: n(y.bonus) },
    { name: 'Overtime', value: n(y.overtimePay) },
    { name: 'Arrears', value: n(y.arrears) },
    { name: 'Leave encashment', value: n(y.leaveEncashment) },
  ].filter((s) => s.value > 0)

  const deductions: Slice[] = [
    { name: 'Income tax', value: n(y.incomeTax) },
    { name: 'EOBI', value: n(y.eobi) },
    { name: 'Provident fund', value: n(y.providentFund) },
    { name: 'Healthcare', value: n(y.healthcare) },
    { name: 'Loan', value: n(y.loanDeduction) },
    { name: 'Vehicle', value: n(y.vehicleDeduction) },
    { name: 'Advance', value: n(y.advanceDeduction) },
    { name: 'Late', value: n(y.lateDeduction) },
    { name: 'Sandwich', value: n(y.sandwichDeduction) },
    { name: 'Other', value: n(y.otherDeductions) },
  ].filter((s) => s.value > 0)

  const netAboveGross = await prisma.payslip.count({
    where: { year, netSalary: { gt: prisma.payslip.fields.grossSalary } },
  })

  // ── Audit summary ─────────────────────────────────────────────────────────
  const payload = run ? await getPayrollAnomalies(run.id) : null
  const anomalies = payload?.anomalies ?? []
  const SEVERITY_LABEL: Record<string, string> = {
    high: 'Critical', medium: 'Warning', low: 'Informational',
  }
  const KIND_LABEL: Record<string, string> = {
    SALARY_CHANGED: 'Salary changed',
    NET_DELTA: 'Net moved sharply',
    HIGH_OT: 'High overtime',
    NEW_EMPLOYEE: 'First payroll',
    NO_PRIOR: 'No prior month',
  }
  const sevCount = new Map<string, number>()
  const kindCount = new Map<string, number>()
  for (const a of anomalies) {
    sevCount.set(a.severity, (sevCount.get(a.severity) ?? 0) + 1)
    kindCount.set(a.kind, (kindCount.get(a.kind) ?? 0) + 1)
  }
  const SEV_ORDER = ['high', 'medium', 'low']
  const audit = {
    exceptions: anomalies.length,
    payslips: payload?.total ?? 0,
    clean: payload?.clean ?? 0,
    bySeverity: SEV_ORDER.map((s) => ({
      severity: s,
      label: SEVERITY_LABEL[s],
      count: sevCount.get(s) ?? 0,
    })),
    byKind: [...kindCount.entries()]
      .map(([kind, count]) => ({ kind, label: KIND_LABEL[kind] ?? kind, count }))
      .sort((a, b) => b.count - a.count),
    top: [...anomalies]
      .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))
      .slice(0, 5),
    priorMonth: payload?.priorMonth ?? null,
  }

  // ── Compare periods ───────────────────────────────────────────────────────
  const compare = await comparePeriods(month, year, priorMonth, priorYear)

  // ── Pending transactions ──────────────────────────────────────────────────
  const draftSlips = slips.filter((s) => s.status === 'DRAFT').length
  const pendingSlices: Slice[] = [
    { name: 'Payslips still in draft', value: draftSlips },
    { name: 'Leave awaiting approval', value: pendingLeave },
    { name: 'Advances awaiting approval', value: pendingAdvances },
  ].filter((s) => s.value > 0)
  const pending = {
    total: pendingSlices.reduce((s, x) => s + x.value, 0),
    slices: pendingSlices,
  }

  // ── The step rail ─────────────────────────────────────────────────────────
  const withSlip = new Set(slips.map((s) => s.employeeId))
  const noSlip = active.filter((e) => !withSlip.has(e.id))
  const noBank = active.filter((e) => !e.ibanAccount && !e.bankAccount)
  const noSalary = active.filter((e) => !e.salary)
  const leaverSlips = slips.filter((s) => s.employee.status !== 'ACTIVE')
  const attended = new Set(attendedIds.map((a) => a.employeeId))
  const noAttendance = active.filter((e) => !attended.has(e.id))
  const unsent = slips.filter((s) => !s.sentAt).length

  const steps: StepGroup[] = [
    {
      step: 'Step 1 · Payroll preparation',
      tasks: [
        {
          label: 'Transactions pending for this period',
          href: '/dashboard/payroll/advances',
          count: pending.total,
        },
        {
          label: 'Attendance not marked this period',
          href: '/dashboard/attendance',
          count: noAttendance.length,
          warn: noAttendance.length > 0,
          note: noAttendance.length > 0 ? noAttendance.map((e) => e.fullName).join(', ') : undefined,
        },
        {
          label: 'Active people with no payslip',
          href: '/dashboard/payroll',
          count: noSlip.length,
          warn: noSlip.length > 0,
          note: noSlip.length > 0 ? noSlip.map((e) => e.fullName).join(', ') : undefined,
        },
        {
          label: 'Payslip for someone no longer active',
          href: '/dashboard/payroll/slips',
          count: leaverSlips.length,
          warn: leaverSlips.length > 0,
          note: leaverSlips.length > 0
            ? leaverSlips.map((s) => `${s.employee.fullName} (${s.employee.status.toLowerCase()})`).join(', ')
            : undefined,
        },
      ],
    },
    {
      step: 'Step 2 · Payroll processing',
      tasks: [
        { label: 'Open the pay cycle', href: '/dashboard/payroll' },
        { label: 'Recalculate payslips', href: '/dashboard/payroll' },
        {
          label: 'Review the payroll audit',
          href: '/dashboard/payroll',
          count: audit.exceptions,
          warn: (sevCount.get('high') ?? 0) > 0,
        },
        { label: 'Payroll configuration', href: '/dashboard/payroll/configuration' },
      ],
    },
    {
      step: 'Step 3 · Post complete',
      tasks: [
        {
          label: run?.status === 'PAID' ? 'Run is paid' : 'Send for CEO approval',
          href: '/dashboard/payroll',
          note: run?.status ? `Currently ${run.status.replace('_', ' ').toLowerCase()}` : 'No run for this period yet',
        },
        { label: 'Slip register — bank payout file', href: '/dashboard/payroll/register' },
        {
          label: 'Payslips not yet sent',
          href: '/dashboard/payroll/slips',
          count: unsent,
          warn: unsent > 0,
        },
      ],
    },
    {
      step: 'Off-cycle payments',
      tasks: [
        { label: 'Loans & advances', href: '/dashboard/payroll/advances', count: pendingAdvances },
        { label: 'Adjust a payslip', href: '/dashboard/payroll/slips' },
      ],
    },
    {
      step: 'Worker data & activities',
      tasks: [
        {
          label: 'No bank account on file',
          href: '/dashboard/people',
          count: noBank.length,
          warn: noBank.length > 0,
          note: noBank.length > 0 ? noBank.map((e) => e.fullName).join(', ') : undefined,
        },
        {
          label: 'No salary record',
          href: '/dashboard/people',
          count: noSalary.length,
          warn: noSalary.length > 0,
          note: noSalary.length > 0 ? noSalary.map((e) => e.fullName).join(', ') : undefined,
        },
        { label: 'Increments', href: '/dashboard/performance/increments' },
      ],
    },
  ]

  return {
    context,
    periods,
    trending,
    ytd: {
      year,
      gross: n(y.grossSalary),
      net: n(y.netSalary),
      earnings,
      deductions,
      deductionTotal: deductions.reduce((s, d) => s + d.value, 0),
      netAboveGross,
    },
    audit,
    compare,
    pending,
    steps,
  }
}

/**
 * Component-by-component against the previous period — Workday's Compare
 * Periods. Percentages are omitted rather than shown as ∞ where the prior
 * period was zero, because "new this period" is the honest reading.
 */
async function comparePeriods(
  month: number, year: number, priorMonth: number, priorYear: number,
): Promise<CommandCenterData['compare']> {
  const sums = {
    basic: true, houseRent: true, utilities: true, food: true, fuel: true,
    medicalAllowance: true, otherAllowance: true, bonus: true, overtimePay: true,
    arrears: true, leaveEncashment: true, grossSalary: true, netSalary: true,
    incomeTax: true, eobi: true, providentFund: true, healthcare: true,
    loanDeduction: true, vehicleDeduction: true, advanceDeduction: true,
    otherDeductions: true, lateDeduction: true, sandwichDeduction: true,
  } as const

  const [cur, prev, prevCount] = await Promise.all([
    prisma.payslip.aggregate({ where: { month, year }, _sum: sums }),
    prisma.payslip.aggregate({ where: { month: priorMonth, year: priorYear }, _sum: sums }),
    prisma.payslip.count({ where: { month: priorMonth, year: priorYear } }),
  ])
  if (prevCount === 0) return { priorLabel: null, rows: [] }

  const n = (v: number | null | undefined) => v ?? 0
  const c = cur._sum
  const p = prev._sum

  const defs: { component: string; group: ComponentDelta['group']; pick: (s: typeof c) => number }[] = [
    { component: 'Basic', group: 'Earnings', pick: (s) => n(s.basic) },
    { component: 'House rent', group: 'Earnings', pick: (s) => n(s.houseRent) },
    { component: 'Utilities', group: 'Earnings', pick: (s) => n(s.utilities) },
    { component: 'Allowances', group: 'Earnings', pick: (s) => n(s.food) + n(s.fuel) + n(s.medicalAllowance) + n(s.otherAllowance) },
    { component: 'Bonus', group: 'Earnings', pick: (s) => n(s.bonus) },
    { component: 'Overtime', group: 'Earnings', pick: (s) => n(s.overtimePay) },
    { component: 'Arrears', group: 'Earnings', pick: (s) => n(s.arrears) },
    { component: 'Leave encashment', group: 'Earnings', pick: (s) => n(s.leaveEncashment) },
    { component: 'Income tax', group: 'Deductions', pick: (s) => n(s.incomeTax) },
    { component: 'EOBI', group: 'Deductions', pick: (s) => n(s.eobi) },
    { component: 'Provident fund', group: 'Deductions', pick: (s) => n(s.providentFund) },
    { component: 'Healthcare', group: 'Deductions', pick: (s) => n(s.healthcare) },
    { component: 'Loan & vehicle', group: 'Deductions', pick: (s) => n(s.loanDeduction) + n(s.vehicleDeduction) },
    { component: 'Advance', group: 'Deductions', pick: (s) => n(s.advanceDeduction) },
    { component: 'Late', group: 'Deductions', pick: (s) => n(s.lateDeduction) },
    { component: 'Sandwich', group: 'Deductions', pick: (s) => n(s.sandwichDeduction) },
    { component: 'Other', group: 'Deductions', pick: (s) => n(s.otherDeductions) },
    { component: 'Gross', group: 'Totals', pick: (s) => n(s.grossSalary) },
    { component: 'Net', group: 'Totals', pick: (s) => n(s.netSalary) },
  ]

  const rows = defs
    .map((d) => {
      const prior = d.pick(p)
      const selected = d.pick(c)
      return {
        component: d.component,
        group: d.group,
        prior,
        selected,
        difference: selected - prior,
        pct: prior === 0 ? null : ((selected - prior) / prior) * 100,
      }
    })
    // A component that was zero in both periods is noise, not information.
    .filter((r) => r.prior !== 0 || r.selected !== 0)

  return { priorLabel: `${MONTHS[priorMonth - 1]} ${priorYear}`, rows }
}
