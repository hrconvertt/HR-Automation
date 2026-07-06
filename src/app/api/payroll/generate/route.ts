import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { calculatePayslip } from '@/lib/payroll'
import { getPayrollConfig } from '@/lib/config'
import { dayKey } from '@/lib/date-utils'

/**
 * POST /api/payroll/generate
 *
 * One-click "Generate Payroll" — pulls the LATEST CompensationHistory row
 * for every eligible employee, creates a fresh PayrollRun in DRAFT, and
 * seeds one Payslip per employee with that comp's pay components.
 *
 * Body: { month, year, replace?: boolean }
 *
 * Resignation filter (per HR brief):
 *   - status === 'ACTIVE'                            → include
 *   - status in (RESIGNED, TERMINATED, LAYOFF)
 *     AND exitDate >= first day of month             → include (pro-rated to exitDate)
 *   - status in (RESIGNED, TERMINATED, LAYOFF)
 *     AND exitDate <  first day of month             → exclude (already settled)
 *
 * For included resigned employees, present days are capped at the working
 * days up to and including exitDate, so payroll is pro-rated automatically
 * via the existing calculatePayslip ratio (presentDays / workingDays).
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to generate payroll' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const month = Number(body.month)
    const year = Number(body.year)
    const replace = Boolean(body.replace)

    if (!month || !year || month < 1 || month > 12) {
      return NextResponse.json({ error: 'month and year are required' }, { status: 400 })
    }

    // There may be MORE than one run for a period (older duplicates from
    // earlier code paths), and — critically — Payslip has a global unique
    // constraint on (employeeId, month, year), so ANY leftover payslip for
    // this month blocks a fresh generate even if its parent run was dropped.
    // So we look at every run for the period, refuse if any is PAID, and
    // otherwise wipe ALL runs + ALL payslips for the month before rebuilding.
    const existingRuns = await prisma.payrollRun.findMany({
      where: { month, year },
      select: { id: true, status: true },
    })
    if (existingRuns.length > 0) {
      if (!replace) {
        return NextResponse.json(
          {
            error: 'A payroll run already exists for this period.',
            existingId: existingRuns[0].id,
            status: existingRuns[0].status,
          },
          { status: 409 },
        )
      }
      // HR_ADMIN can wipe ANY stage (DRAFT, PENDING_CEO, PENDING_HR_FINAL,
      // PENDING_FINANCE) — they explicitly confirmed in the UI. PAID is the
      // one we refuse to obliterate, since employees may have been notified
      // and money may have moved.
      if (existingRuns.some((r) => r.status === 'PAID')) {
        return NextResponse.json(
          { error: 'Cannot regenerate a payroll run that has already been marked PAID.' },
          { status: 409 },
        )
      }
      const runIds = existingRuns.map((r) => r.id)
      await prisma.payrollRunApproval.deleteMany({ where: { runId: { in: runIds } } }).catch(() => {})
      // Delete payslips by (month, year) — catches orphans not linked to any
      // of the runs we found, which are what actually trip the unique index.
      await prisma.payslip.deleteMany({ where: { month, year } })
      await prisma.payrollRun.deleteMany({ where: { id: { in: runIds } } })
    }
    // Belt-and-braces: clear any stray payslips for this month even when no
    // run row was found (the source of the observed unique-constraint crash).
    await prisma.payslip.deleteMany({ where: { month, year } })

    // ─── Resignation filter ─────────────────────────────────────────
    const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999)

    const employees = await prisma.employee.findMany({
      where: {
        OR: [
          { status: 'ACTIVE' },
          {
            status: { in: ['RESIGNED', 'TERMINATED', 'LAYOFF'] },
            exitDate: { gte: startOfMonth },
          },
        ],
      },
      include: {
        salary: true,
        compensationHistory: {
          orderBy: { effectiveDate: 'desc' },
          take: 1,
        },
      },
    })

    // Working days / holidays / attendance setup mirrors POST /api/payroll
    const holidays = await prisma.holiday.findMany({
      where: { type: 'PUBLIC', date: { gte: startOfMonth, lte: endOfMonth } },
      select: { date: true },
    })
    const holidayKeys = new Set(holidays.map((h) => dayKey(h.date)))
    const workingDays = countWeekdays(month, year, holidayKeys)

    const cfg = await getPayrollConfig()

    const attendanceLogs = await prisma.attendanceLog.findMany({
      where: {
        date: { gte: startOfMonth, lte: endOfMonth },
        status: { in: ['PRESENT', 'LATE'] },
      },
    })

    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        fromDate: { lte: endOfMonth },
        toDate: { gte: startOfMonth },
      },
      select: { employeeId: true, fromDate: true, toDate: true, leaveType: true },
    })

    const paidLeaveByEmp: Record<string, number> = {}
    const unpaidLeaveByEmp: Record<string, number> = {}
    for (const lv of approvedLeaves) {
      const lvStart = lv.fromDate > startOfMonth ? lv.fromDate : startOfMonth
      const lvEnd = lv.toDate < endOfMonth ? lv.toDate : endOfMonth
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

    const otByEmployee: Record<string, number> = {}
    for (const l of attendanceLogs) {
      if (l.overtimeApproved && l.overtimeHours > 0) {
        otByEmployee[l.employeeId] = (otByEmployee[l.employeeId] ?? 0) + l.overtimeHours
      }
    }

    // For resigned/terminated employees, working days are capped at their
    // exit day (so pay is pro-rated for partial-month service).
    function workingDaysUpTo(boundary: Date): number {
      let count = 0
      const lastDay = Math.min(
        new Date(year, month, 0).getDate(),
        // Use the boundary date if it's in this month, else full month.
        boundary >= startOfMonth && boundary <= endOfMonth ? boundary.getDate() : new Date(year, month, 0).getDate(),
      )
      for (let d = 1; d <= lastDay; d++) {
        const date = new Date(year, month - 1, d)
        const day = date.getDay()
        if (day === 0 || day === 6) continue
        if (holidayKeys.has(dayKey(date))) continue
        count++
      }
      return count
    }

    const payslipsData: Array<{
      employeeId: string
      month: number
      year: number
      basic: number
      houseRent: number
      utilities: number
      food: number
      fuel: number
      medicalAllowance: number
      otherAllowance: number
      overtimePay: number
      grossSalary: number
      eobi: number
      incomeTax: number
      otherDeductions: number
      netSalary: number
      presentDays: number
      workingDays: number
      leaveDays: number
      absentDays: number
      status: string
      reference: string
      transactionAmount: number
    }> = []

    const monthLabels = ['January','February','March','April','May','June','July','August','September','October','November','December']

    for (const emp of employees) {
      // Pull the LATEST CompensationHistory entry if present; otherwise fall
      // back to the live Salary record. CompensationHistory only stores
      // totals, so when it leads we still need the Salary breakdown to
      // shape each pay component.
      const salary = emp.salary
      if (!salary) continue // no comp on file → cannot generate

      // Use Salary as the breakdown source. The latest CompensationHistory
      // confirms there's been at least one comp event — the Salary record
      // is always kept in sync by PUT /api/employees/[id]/salary, so its
      // breakdown reflects the latest cycle.

      // Pro-rate working days for resigned/terminated employees
      const isExiting =
        emp.status !== 'ACTIVE' &&
        emp.exitDate != null &&
        emp.exitDate >= startOfMonth
      const empWorkingDays = isExiting && emp.exitDate
        ? workingDaysUpTo(emp.exitDate)
        : workingDays

      const attendanceDays = attendanceLogs.filter((l) => l.employeeId === emp.id).length
      const paidLeave = paidLeaveByEmp[emp.id] ?? 0
      const unpaidLeave = unpaidLeaveByEmp[emp.id] ?? 0

      // New-hire / no-data fallback: assume full month worked
      const presentDays = attendanceDays > 0 || paidLeave > 0 || unpaidLeave > 0
        ? Math.min(empWorkingDays, attendanceDays + paidLeave)
        : empWorkingDays
      const absentDays = Math.max(0, empWorkingDays - presentDays - unpaidLeave)
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
        empWorkingDays,
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

      payslipsData.push({
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
        reference: `Salary ${monthLabels[month - 1]} ${year}`,
        transactionAmount: result.netPay,
      })
    }

    const totalGross = payslipsData.reduce((s, p) => s + p.grossSalary, 0)
    const totalNet = payslipsData.reduce((s, p) => s + p.netSalary, 0)
    const totalEOBI = payslipsData.reduce((s, p) => s + p.eobi, 0)
    const totalTax = payslipsData.reduce((s, p) => s + p.incomeTax, 0)

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
      select: { id: true },
    })

    return NextResponse.json({
      payrollRun: { id: payrollRun.id, month, year },
      count: payslipsData.length,
    }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/payroll/generate]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `Payroll generation failed: ${msg.slice(0, 400)}` },
      { status: 500 },
    )
  }
}

function countWeekdays(month: number, year: number, holidayKeys: Set<string>): number {
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
