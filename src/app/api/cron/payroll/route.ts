/**
 * Cron endpoint: POST /api/cron/payroll
 * Called on the 1st of every month.
 * 1. Auto-generates payslips for all active employees
 * 2. Sends notification to HR to review & approve
 *
 * Secure with CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateEOBI, calculateIncomeTax, calculateOvertimePay } from '@/lib/payroll'
import { getPayrollConfig } from '@/lib/config'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cfg = await getPayrollConfig()
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  // Create (or reuse) the REGULAR payroll run for this month.
  // month/year is no longer a unique key (off-cycle runs may coexist), so
  // find-or-create scoped to runType REGULAR.
  const run =
    (await prisma.payrollRun.findFirst({
      where: { month, year, runType: 'REGULAR' },
    })) ??
    (await prisma.payrollRun.create({
      data: { month, year, status: 'DRAFT', runType: 'REGULAR' },
    }))

  // Get all active employees with salary
  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    include: { salary: true },
  })

  let totalGross = 0
  let totalNet = 0
  let totalEOBI = 0
  let totalTax = 0
  let generated = 0

  for (const emp of employees) {
    if (!emp.salary) continue

    // Per-employee working days (some work Sat/Sun)
    const workingDaysInMonth = getWorkingDays(year, month, emp.workDays)

    // Get attendance for this month
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0)
    const attendance = await prisma.attendanceLog.findMany({
      where: {
        employeeId: emp.id,
        date: { gte: startDate, lte: endDate },
        status: { in: ['PRESENT', 'LATE', 'HALF_DAY'] },
      },
    })

    const presentDays = attendance.length || workingDaysInMonth

    // Sum approved overtime hours for this month
    const approvedOT = await prisma.attendanceLog.aggregate({
      where: {
        employeeId: emp.id,
        date: { gte: new Date(year, month - 1, 1), lte: new Date(year, month, 0) },
        overtimeApproved: true,
      },
      _sum: { overtimeHours: true },
    })
    const totalOvertimeHours = approvedOT._sum.overtimeHours ?? 0

    const { basic, houseRent, utilities, food, fuel, medicalAllowance, otherAllowance } = emp.salary

    const overtimePay = calculateOvertimePay(basic, workingDaysInMonth, totalOvertimeHours, cfg.overtimeMultiplier, cfg.standardHoursPerDay)
    const grossSalary = basic + houseRent + utilities + food + fuel + medicalAllowance + otherAllowance + overtimePay
    const eobi = calculateEOBI(basic, cfg.eobiEmployeeRate, cfg.eobiCap)
    const annualGross = grossSalary * 12
    const incomeTax = calculateIncomeTax(annualGross) / 12

    const netSalary = grossSalary - eobi - incomeTax

    await prisma.payslip.upsert({
      where: {
        employeeId_month_year_payrollRunId: {
          employeeId: emp.id, month, year, payrollRunId: run.id,
        },
      },
      create: {
        employeeId: emp.id,
        payrollRunId: run.id,
        month,
        year,
        basic,
        houseRent,
        utilities,
        food,
        fuel,
        medicalAllowance,
        otherAllowance,
        overtimePay,
        grossSalary,
        eobi,
        incomeTax,
        netSalary,
        workingDays: workingDaysInMonth,
        presentDays,
        status: 'DRAFT',
      },
      update: {},
    })

    totalGross += grossSalary
    totalNet += netSalary
    totalEOBI += eobi
    totalTax += incomeTax
    generated++
  }

  // Update run totals
  await prisma.payrollRun.update({
    where: { id: run.id },
    data: { totalGross, totalNet, totalEOBI, totalTax, status: 'PENDING_APPROVAL' },
  })

  // Notify all HR admins
  const hrAdmins = await prisma.user.findMany({ where: { role: 'HR_ADMIN' } })
  for (const admin of hrAdmins) {
    const emp = await prisma.employee.findUnique({ where: { userId: admin.id } })
    if (emp) {
      await prisma.notification.create({
        data: {
          employeeId: emp.id,
          type: 'PAYSLIP_READY',
          title: `Payroll Ready for Approval — ${getMonthName(month)} ${year}`,
          message: `${generated} payslips generated. Total net: PKR ${totalNet.toLocaleString()}. Please review and approve.`,
          link: '/dashboard/payroll',
        },
      })
    }
  }

  return NextResponse.json({
    success: true,
    month,
    year,
    generated,
    totalGross,
    totalNet,
  })
}

// workDays e.g. "Mon,Tue,Wed,Thu,Fri" or "Mon,Tue,Wed,Thu,Fri,Sat"
function getWorkingDays(year: number, month: number, workDays = 'Mon,Tue,Wed,Thu,Fri'): number {
  const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const activeDays = new Set(workDays.split(',').map((d) => DAY_MAP[d.trim()]).filter((n) => n !== undefined))
  const daysInMonth = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= daysInMonth; d++) {
    if (activeDays.has(new Date(year, month - 1, d).getDay())) count++
  }
  return count
}

function getMonthName(month: number): string {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]
}
