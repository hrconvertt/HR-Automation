/**
 * Shared payroll-run query logic used by both:
 *   - GET /api/payroll and GET /api/payroll/[id]/anomalies
 *   - /dashboard/payroll server component (initial render for the HR view)
 *
 * Callers are responsible for auth; role scoping happens here from the
 * caller-supplied effectiveRole/employeeId (derived from the verified session).
 */
import { prisma } from '@/lib/prisma'

export interface GetPayrollRunOpts {
  effectiveRole: string
  /** The requesting user's own employee id (for MANAGER/EMPLOYEE scoping). */
  employeeId: string | null
  month: number
  year: number
  /**
   * Optional: select a specific run (off-cycle runs share month/year with the
   * REGULAR run). When omitted, the REGULAR run is preferred.
   */
  runId?: string | null
}

/**
 * Lightweight list of ALL runs for a month (REGULAR + off-cycle) — used by
 * the HR/Exec/Finance UI to render a run switcher. No payslip amounts.
 */
export async function listPayrollRuns(month: number, year: number) {
  return prisma.payrollRun.findMany({
    where: { month, year },
    select: {
      id: true, month: true, year: true, status: true, runType: true,
      totalGross: true, totalNet: true, createdAt: true,
      _count: { select: { payslips: true } },
    },
    // REGULAR first, then off-cycle in creation order
    orderBy: [{ createdAt: 'asc' }],
  })
}

export async function getPayrollRun(opts: GetPayrollRunOpts) {
  const { effectiveRole, employeeId, month, year, runId } = opts

  // Scope payslip query by role.
  // SALARY VISIBILITY RULE (locked down): Manager + Lead do NOT see team
  // payslip amounts. They only see their OWN payslip here.
  // EMPLOYEE should NEVER see DRAFT payslips — only finalized ones.
  let payslipWhere: {
    employeeId?: string
    status?: { in: string[] }
  } = {}
  const FINALIZED = ['APPROVED', 'RELEASED', 'FINALIZED', 'PAID', 'SENT']
  if (effectiveRole === 'EMPLOYEE' || effectiveRole === 'MANAGER' || effectiveRole === 'LEAD') {
    if (!employeeId) return null
    payslipWhere = { employeeId, status: { in: FINALIZED } }
  }
  // HR_ADMIN, EXECUTIVE, FINANCE: no extra filter (full payroll)

  const payrollRun = await prisma.payrollRun.findFirst({
    where: runId ? { id: runId, month, year } : { month, year, runType: 'REGULAR' },
    include: {
      payslips: {
        where: payslipWhere,
        include: {
          employee: {
            select: {
              fullName: true,
              employeeCode: true,
              designation: true,
              ibanAccount: true,
              bankAccount: true,
              bankName: true,
            },
          },
        },
        orderBy: { employee: { fullName: 'asc' } },
      },
      approvals: { orderBy: { createdAt: 'asc' } },
    },
  })

  return payrollRun
    ? {
        ...payrollRun,
        payslips: payrollRun.payslips.map((p) => ({
          ...p,
          allowances:
            p.houseRent + p.utilities + p.food + p.fuel + p.medicalAllowance + p.otherAllowance,
          grossPay: p.grossSalary,
          netPay: p.netSalary,
        })),
      }
    : null
}

// ─── Anomalies (AutoPilot review surface) ───────────────────────────────────

const NET_DELTA_THRESHOLD_PCT = 10 // anything >10% change vs prior is flagged

export interface PayrollAnomaly {
  payslipId: string
  employeeId: string
  employeeName: string
  employeeCode: string
  kind: 'SALARY_CHANGED' | 'NET_DELTA' | 'HIGH_OT' | 'NEW_EMPLOYEE' | 'NO_PRIOR'
  summary: string
  delta: number | null
  severity: 'high' | 'medium' | 'low'
}

export interface PayrollAnomaliesPayload {
  run: { id: string; month: number; year: number; status: string }
  anomalies: PayrollAnomaly[]
  clean: number
  total: number
  priorMonth: { month: number; year: number } | null
}

/**
 * Compute anomalies for a run vs the prior month. Returns null when the run
 * doesn't exist. Callers MUST gate behind HR_ADMIN / EXECUTIVE.
 */
export async function getPayrollAnomalies(runId: string): Promise<PayrollAnomaliesPayload | null> {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: {
      payslips: {
        include: {
          employee: { select: { id: true, fullName: true, employeeCode: true, salary: { select: { basic: true } } } },
        },
      },
    },
  })
  if (!run) return null

  // Off-cycle runs have no meaningful month-over-month comparison.
  if (run.runType !== 'REGULAR') {
    return {
      run: { id: run.id, month: run.month, year: run.year, status: run.status },
      anomalies: [],
      clean: run.payslips.length,
      total: run.payslips.length,
      priorMonth: null,
    }
  }

  // Compute prior month range for comparison
  const priorMonth = run.month === 1 ? 12 : run.month - 1
  const priorYear  = run.month === 1 ? run.year - 1 : run.year

  const priorRun = await prisma.payrollRun.findFirst({
    where: { month: priorMonth, year: priorYear, runType: 'REGULAR' },
    include: { payslips: true },
  })
  const priorByEmp = new Map(
    (priorRun?.payslips ?? []).map((p) => [p.employeeId, p]),
  )

  const anomalies: PayrollAnomaly[] = []
  let cleanCount = 0

  for (const slip of run.payslips) {
    const prior = priorByEmp.get(slip.employeeId)
    const emp = slip.employee

    // No prior at all → either first run or new joiner
    if (!prior) {
      anomalies.push({
        payslipId: slip.id,
        employeeId: emp.id,
        employeeName: emp.fullName,
        employeeCode: emp.employeeCode,
        kind: priorRun ? 'NEW_EMPLOYEE' : 'NO_PRIOR',
        summary: priorRun
          ? `First payroll for ${emp.fullName} — verify before approving.`
          : `No prior month to compare. Spot-check this payslip.`,
        delta: null,
        severity: 'medium',
      })
      continue
    }

    // Salary base changed
    if (prior.basic !== slip.basic && emp.salary?.basic && prior.basic !== emp.salary.basic) {
      // Note: payslip.basic is PRORATED, so comparing payslip.basic != prior.basic
      // can also mean attendance differs. We additionally check that the
      // configured salary is different, which is the cleaner signal.
      const delta = (emp.salary.basic ?? 0) - prior.basic
      anomalies.push({
        payslipId: slip.id,
        employeeId: emp.id,
        employeeName: emp.fullName,
        employeeCode: emp.employeeCode,
        kind: 'SALARY_CHANGED',
        summary: `Basic salary changed by PKR ${delta.toLocaleString()} since last month.`,
        delta,
        severity: 'high',
      })
      continue
    }

    // Net delta > threshold
    if (prior.netSalary > 0) {
      const pctDelta = ((slip.netSalary - prior.netSalary) / prior.netSalary) * 100
      if (Math.abs(pctDelta) > NET_DELTA_THRESHOLD_PCT) {
        anomalies.push({
          payslipId: slip.id,
          employeeId: emp.id,
          employeeName: emp.fullName,
          employeeCode: emp.employeeCode,
          kind: 'NET_DELTA',
          summary: `Net pay ${pctDelta > 0 ? 'up' : 'down'} ${Math.abs(pctDelta).toFixed(0)}% vs last month (${prior.netSalary.toLocaleString()} → ${slip.netSalary.toLocaleString()}).`,
          delta: slip.netSalary - prior.netSalary,
          severity: Math.abs(pctDelta) > 30 ? 'high' : 'medium',
        })
        continue
      }
    }

    // High OT this month (overtimePay stored on payslip = OT allowance value)
    if (slip.overtimePay > 0 && slip.basic > 0 && slip.overtimePay / slip.basic > 0.2) {
      anomalies.push({
        payslipId: slip.id,
        employeeId: emp.id,
        employeeName: emp.fullName,
        employeeCode: emp.employeeCode,
        kind: 'HIGH_OT',
        summary: `OT allowance is ${((slip.overtimePay / slip.basic) * 100).toFixed(0)}% of basic — review for accuracy.`,
        delta: slip.overtimePay,
        severity: 'medium',
      })
      continue
    }

    cleanCount++
  }

  // Sort: high → medium → low; then alphabetical
  const sevOrder = { high: 0, medium: 1, low: 2 }
  anomalies.sort((a, b) => {
    const s = sevOrder[a.severity] - sevOrder[b.severity]
    return s !== 0 ? s : a.employeeName.localeCompare(b.employeeName)
  })

  return {
    run: { id: run.id, month: run.month, year: run.year, status: run.status },
    anomalies,
    clean: cleanCount,
    total: run.payslips.length,
    priorMonth: priorRun ? { month: priorMonth, year: priorYear } : null,
  }
}
