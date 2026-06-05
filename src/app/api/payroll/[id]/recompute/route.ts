/**
 * POST /api/payroll/[id]/recompute
 *
 * Re-runs the payslip math for an existing DRAFT payroll run. Used when HR
 * edits salaries / OT formula / attendance after generating but before approval.
 * Overwrites all payslips in-place; preserves the run ID and any history.
 *
 * Only valid for DRAFT runs. Locked / Approved runs require unlock first.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { calculatePayslip } from '@/lib/payroll'
import { getPayrollConfig } from '@/lib/config'
import { dayKey } from '@/lib/date-utils'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  if (!me || me.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'HR Admin only' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view' }, { status: 403 })
  }

  const { id } = await params
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    select: { id: true, month: true, year: true, status: true },
  })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (run.status !== 'DRAFT') {
    return NextResponse.json({
      error: `Cannot recompute a ${run.status} run. Reopen first.`,
    }, { status: 400 })
  }

  const { month, year } = run
  const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999)

  const [employees, holidays, attendanceLogs, approvedLeaves] = await Promise.all([
    prisma.employee.findMany({ where: { status: 'ACTIVE' }, include: { salary: true } }),
    prisma.holiday.findMany({
      where: { type: 'PUBLIC', date: { gte: startOfMonth, lte: endOfMonth } },
      select: { date: true },
    }),
    prisma.attendanceLog.findMany({
      where: { date: { gte: startOfMonth, lte: endOfMonth }, status: { in: ['PRESENT', 'LATE'] } },
    }),
    prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', fromDate: { lte: endOfMonth }, toDate: { gte: startOfMonth } },
      select: { employeeId: true, fromDate: true, toDate: true, leaveType: true },
    }),
  ])

  const holidayKeys = new Set(holidays.map((h) => dayKey(h.date)))
  const workingDays = countWeekdaysExcludingHolidays(month, year, holidayKeys)

  // Per-employee paid vs unpaid leave days
  const paidLeaveByEmp: Record<string, number> = {}
  const unpaidLeaveByEmp: Record<string, number> = {}
  for (const lv of approvedLeaves) {
    const lvStart = lv.fromDate > startOfMonth ? lv.fromDate : startOfMonth
    const lvEnd = lv.toDate < endOfMonth ? lv.toDate : endOfMonth
    let days = 0
    const cur = new Date(lvStart); cur.setHours(0,0,0,0)
    const stop = new Date(lvEnd); stop.setHours(0,0,0,0)
    while (cur <= stop) {
      const dow = cur.getDay()
      if (dow !== 0 && dow !== 6 && !holidayKeys.has(dayKey(cur))) days++
      cur.setDate(cur.getDate() + 1)
    }
    const bucket = lv.leaveType === 'UNPAID' ? unpaidLeaveByEmp : paidLeaveByEmp
    bucket[lv.employeeId] = (bucket[lv.employeeId] ?? 0) + days
  }

  const otByEmployee: Record<string, number> = {}
  for (const l of attendanceLogs) {
    if (l.overtimeApproved && l.overtimeHours > 0) {
      otByEmployee[l.employeeId] = (otByEmployee[l.employeeId] ?? 0) + l.overtimeHours
    }
  }

  const cfg = await getPayrollConfig()

  // Build fresh payslip data
  const freshPayslips = employees
    .filter((emp) => emp.salary != null)
    .map((emp) => {
      const salary = emp.salary!
      const attendanceDays = attendanceLogs.filter((l) => l.employeeId === emp.id).length
      const paidLeave = paidLeaveByEmp[emp.id] ?? 0
      const unpaidLeave = unpaidLeaveByEmp[emp.id] ?? 0
      const presentDays = attendanceDays > 0 || paidLeave > 0 || unpaidLeave > 0
        ? Math.min(workingDays, attendanceDays + paidLeave)
        : workingDays
      const absentDays = Math.max(0, workingDays - presentDays - unpaidLeave)
      const approvedOtHours = otByEmployee[emp.id] ?? 0
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
        presentDays, workingDays, approvedOtHours,
        cfg.overtimeMultiplier, cfg.standardHoursPerDay,
        cfg.eobiEmployeeRate, cfg.eobiCap, cfg.eobiEnabled, cfg.taxEnabled,
        cfg.otAllowanceTargetHours, cfg.otAllowanceCapPkr,
      )
      return {
        employeeId: emp.id,
        basic: result.basic,
        houseRent: result.hra,
        utilities: result.utilities,
        food: result.food,
        fuel: result.fuelAllowance,
        medicalAllowance: result.medical,
        otherAllowance: result.otherAllowances,
        overtimePay: result.overtimeAllowance,
        grossSalary: result.grossPay,
        eobi: result.eobi,
        incomeTax: result.incomeTax,
        otherDeductions: 0,
        netSalary: result.netPay,
        presentDays: result.presentDays,
        workingDays: result.workingDays,
        leaveDays: paidLeave + unpaidLeave,
        absentDays,
        status: 'DRAFT',
      }
    })

  // Preserve any HR-adjusted payslips — they hold overrides (bonus,
  // leave encashment, PF, etc.) that AutoPilot doesn't know about.
  const adjustedRows = await prisma.payslip.findMany({
    where: { payrollRunId: id, isAdjusted: true },
  })
  const adjustedByEmp = new Map(adjustedRows.map((r) => [r.employeeId, r]))

  // Replace payslips for this run atomically — but skip employees with
  // an active adjustment.
  await prisma.$transaction(async (tx) => {
    await tx.payslip.deleteMany({ where: { payrollRunId: id, isAdjusted: false } })
    const toCreate = freshPayslips.filter((p) => !adjustedByEmp.has(p.employeeId))
    if (toCreate.length > 0) {
      await tx.payslip.createMany({
        data: toCreate.map((p) => ({ ...p, payrollRunId: id, month, year })),
      })
    }
  })

  // Recompute run totals using fresh + preserved adjusted rows.
  const finalRows = await prisma.payslip.findMany({
    where: { payrollRunId: id },
    select: { grossSalary: true, netSalary: true, eobi: true, incomeTax: true },
  })
  const totalGross = finalRows.reduce((s, p) => s + p.grossSalary, 0)
  const totalNet   = finalRows.reduce((s, p) => s + p.netSalary, 0)
  const totalEOBI  = finalRows.reduce((s, p) => s + p.eobi, 0)
  const totalTax   = finalRows.reduce((s, p) => s + p.incomeTax, 0)
  await prisma.payrollRun.update({
    where: { id }, data: { totalGross, totalNet, totalEOBI, totalTax },
  })

  return NextResponse.json({
    ok: true,
    recomputed: freshPayslips.length - adjustedRows.length,
    preserved: adjustedRows.length,
  })
}

function countWeekdaysExcludingHolidays(month: number, year: number, holidayKeys: Set<string>): number {
  const daysInMonth = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    const day = date.getDay()
    if (day === 0 || day === 6) continue
    if (holidayKeys.has(dayKey(date))) continue
    count++
  }
  return count
}
