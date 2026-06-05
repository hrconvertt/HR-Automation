/**
 * GET /api/payroll/[id]/anomalies
 *
 * AutoPilot review surface — instead of an 8-stage approval chain, HR sees
 * only the items that differ meaningfully from the prior month. The rest is
 * assumed-good and rolled up into a single counter.
 *
 * Anomaly types:
 *   - SALARY_CHANGED — employee's basic salary differs from prior month
 *   - NET_DELTA      — net pay differs from prior month by > 10% (configurable)
 *   - HIGH_OT        — OT pay >= 20% of basic in this month
 *   - NEW_EMPLOYEE   — first payroll run for this employee
 *   - NO_PRIOR       — no prior payslip to compare; HR should verify
 *
 * Returns:
 *   { run, anomalies: [{ payslipId, employeeName, code, kind, summary, delta }], clean: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

const NET_DELTA_THRESHOLD_PCT = 10 // anything >10% change vs prior is flagged

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, userRoles: { select: { role: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const allRoles = new Set([me.role, ...me.userRoles.map((r) => r.role)])
  if (!['HR_ADMIN', 'EXECUTIVE'].some((r) => allRoles.has(r))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      payslips: {
        include: {
          employee: { select: { id: true, fullName: true, employeeCode: true, salary: { select: { basic: true } } } },
        },
      },
    },
  })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Compute prior month range for comparison
  const priorMonth = run.month === 1 ? 12 : run.month - 1
  const priorYear  = run.month === 1 ? run.year - 1 : run.year

  const priorRun = await prisma.payrollRun.findFirst({
    where: { month: priorMonth, year: priorYear },
    include: { payslips: true },
  })
  const priorByEmp = new Map(
    (priorRun?.payslips ?? []).map((p) => [p.employeeId, p]),
  )

  type Anomaly = {
    payslipId: string
    employeeId: string
    employeeName: string
    employeeCode: string
    kind: 'SALARY_CHANGED' | 'NET_DELTA' | 'HIGH_OT' | 'NEW_EMPLOYEE' | 'NO_PRIOR'
    summary: string
    delta: number | null
    severity: 'high' | 'medium' | 'low'
  }

  const anomalies: Anomaly[] = []
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

  return NextResponse.json({
    run: { id: run.id, month: run.month, year: run.year, status: run.status },
    anomalies,
    clean: cleanCount,
    total: run.payslips.length,
    priorMonth: priorRun ? { month: priorMonth, year: priorYear } : null,
  })
}
