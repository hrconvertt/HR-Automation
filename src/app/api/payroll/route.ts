import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { calculatePayslip } from '@/lib/payroll'
import { getPayrollConfig } from '@/lib/config'
import { dayKey } from '@/lib/date-utils'

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return { error: 'Unauthorized' as const, status: 401 }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) return { error: 'Unauthorized' as const, status: 401 }

  const previewRole =
    user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role

  return {
    user,
    actualRole: user.role,
    effectiveRole,
    employeeId: user.employee?.id ?? null,
  }
}

export async function GET(request: NextRequest) {
  const access = await resolveAccess(request)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }
  const { effectiveRole, employeeId } = access

  const { searchParams } = new URL(request.url)
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

  // Scope payslip query by role.
  // EMPLOYEE should NEVER see DRAFT payslips — only finalized ones.
  // MANAGER also should not see DRAFT (only HR/EXEC do).
  let payslipWhere: {
    employeeId?: string
    employee?: { reportingManagerId: string }
    status?: { in: string[] }
  } = {}
  const FINALIZED = ['APPROVED', 'RELEASED', 'FINALIZED']
  if (effectiveRole === 'EMPLOYEE') {
    if (!employeeId) return NextResponse.json({ payrollRun: null })
    payslipWhere = { employeeId, status: { in: FINALIZED } }
  } else if (effectiveRole === 'MANAGER') {
    if (!employeeId) return NextResponse.json({ payrollRun: null })
    payslipWhere = { employee: { reportingManagerId: employeeId }, status: { in: FINALIZED } }
  }
  // HR_ADMIN & EXECUTIVE: no extra filter

  const payrollRun = await prisma.payrollRun.findFirst({
    where: { month, year },
    include: {
      payslips: {
        where: payslipWhere,
        include: {
          employee: { select: { fullName: true, employeeCode: true, designation: true } },
        },
        orderBy: { employee: { fullName: 'asc' } },
      },
    },
  })

  const mapped = payrollRun
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

  return NextResponse.json({ payrollRun: mapped })
}

export async function POST(request: NextRequest) {
  // `resolveAccess` already folds in the preview cookie, so an HR user
  // previewing as MANAGER/EMPLOYEE/EXECUTIVE has effectiveRole !==
  // 'HR_ADMIN' and the check below correctly returns 403. Defense in
  // depth: we ALSO read the cookie explicitly so future refactors of
  // `resolveAccess` can't silently weaken this guard.
  const access = await resolveAccess(request)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }
  if (access.effectiveRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to create payroll runs' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { month, year } = body

    if (!month || !year) {
      return NextResponse.json({ error: 'month and year are required' }, { status: 400 })
    }

    const existing = await prisma.payrollRun.findFirst({ where: { month, year } })
    if (existing) {
      return NextResponse.json({ error: 'Payroll for this month already exists' }, { status: 409 })
    }

    const employees = await prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      include: {
        salary: true,
      },
    })

    // TZ-safe month range — explicit local midnight start to local end of last day.
    const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999)

    // Working days: weekdays MINUS any PUBLIC holiday in this month
    const holidays = await prisma.holiday.findMany({
      where: { type: 'PUBLIC', date: { gte: startOfMonth, lte: endOfMonth } },
      select: { date: true },
    })
    const holidayKeys = new Set(holidays.map((h) => dayKey(h.date)))
    const workingDays = getWorkingDaysInMonth(month, year, holidayKeys)

    const cfg = await getPayrollConfig()

    const attendanceLogs = await prisma.attendanceLog.findMany({
      where: {
        date: { gte: startOfMonth, lte: endOfMonth },
        status: { in: ['PRESENT', 'LATE'] },
      },
    })

    // Approved leave for the month — needed to count paid leave as PRESENT
    // (CASUAL / SICK / etc. are paid; only UNPAID leave reduces pay).
    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        fromDate: { lte: endOfMonth },
        toDate: { gte: startOfMonth },
      },
      select: { employeeId: true, fromDate: true, toDate: true, days: true, leaveType: true },
    })

    // Per-employee: paid-leave days vs unpaid-leave days that intersect this month
    const paidLeaveByEmp: Record<string, number> = {}
    const unpaidLeaveByEmp: Record<string, number> = {}
    for (const lv of approvedLeaves) {
      // Clip the leave to the month range
      const lvStart = lv.fromDate > startOfMonth ? lv.fromDate : startOfMonth
      const lvEnd = lv.toDate < endOfMonth ? lv.toDate : endOfMonth
      // Count weekday days in the clipped range
      let days = 0
      const cur = new Date(lvStart); cur.setHours(0, 0, 0, 0)
      const stop = new Date(lvEnd); stop.setHours(0, 0, 0, 0)
      while (cur <= stop) {
        const dow = cur.getDay()
        if (dow !== 0 && dow !== 6 && !holidayKeys.has(dayKey(cur))) days++
        cur.setDate(cur.getDate() + 1)
      }
      const bucket = lv.leaveType === 'UNPAID' ? unpaidLeaveByEmp : paidLeaveByEmp
      bucket[lv.employeeId] = (bucket[lv.employeeId] ?? 0) + days
    }

    // Sum approved overtime hours per employee for the month
    const otByEmployee: Record<string, number> = {}
    for (const l of attendanceLogs) {
      if (l.overtimeApproved && l.overtimeHours > 0) {
        otByEmployee[l.employeeId] = (otByEmployee[l.employeeId] ?? 0) + l.overtimeHours
      }
    }

    const payslipsData = employees
      .filter((emp) => emp.salary != null)
      .map((emp) => {
        const salary = emp.salary!
        // Paid days = actual attendance + paid leave (CASUAL/SICK/etc.).
        // Unpaid leave is excluded from paid days but tracked separately on the payslip.
        const attendanceDays = attendanceLogs.filter((l) => l.employeeId === emp.id).length
        const paidLeave = paidLeaveByEmp[emp.id] ?? 0
        const unpaidLeave = unpaidLeaveByEmp[emp.id] ?? 0
        // New-hire fallback: if no attendance and no leave records, assume full month.
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
          presentDays,
          workingDays,
          approvedOtHours,
          cfg.overtimeMultiplier,
          cfg.standardHoursPerDay,
          cfg.eobiEmployeeRate,
          cfg.eobiCap,
          cfg.eobiEnabled,
          cfg.taxEnabled,
          cfg.otAllowanceTargetHours,
          cfg.otAllowanceCapPkr,
        )
        return {
          employeeId: emp.id,
          month,
          year,
          basic: result.basic,
          houseRent: result.hra,
          utilities: result.utilities,
          food: result.food,
          fuel: result.fuelAllowance,
          medicalAllowance: result.medical,
          otherAllowance: result.otherAllowances,
          // Store the OT allowance in the existing overtimePay field on Payslip
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

    const totalGross = payslipsData.reduce((sum, p) => sum + p.grossSalary, 0)
    const totalNet = payslipsData.reduce((sum, p) => sum + p.netSalary, 0)
    const totalEOBI = payslipsData.reduce((sum, p) => sum + p.eobi, 0)
    const totalTax = payslipsData.reduce((sum, p) => sum + p.incomeTax, 0)

    const payrollRun = await prisma.payrollRun.create({
      data: {
        month,
        year,
        status: 'DRAFT',
        totalGross,
        totalNet,
        totalEOBI,
        totalTax,
        payslips: { create: payslipsData },
      },
      include: {
        payslips: {
          include: {
            employee: { select: { fullName: true, employeeCode: true, designation: true } },
          },
        },
      },
    })

    return NextResponse.json({ payrollRun }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/payroll]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function getWorkingDaysInMonth(month: number, year: number, holidayKeys?: Set<string>): number {
  const daysInMonth = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    const day = date.getDay()
    if (day === 0 || day === 6) continue
    if (holidayKeys && holidayKeys.has(dayKey(date))) continue
    count++
  }
  return count
}
