import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') ?? 'employee_list'
  const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined
  const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : undefined

  let data: Record<string, string | number>[] = []
  let columns: string[] = []

  switch (type) {
    case 'employee_list': {
      const employees = await prisma.employee.findMany({
        where: { status: 'ACTIVE' },
        include: { department: { select: { name: true } } },
        orderBy: { fullName: 'asc' },
      })
      columns = ['employee_code', 'full_name', 'designation', 'department', 'employee_type', 'joining_date', 'status']
      data = employees.map((e) => ({
        employee_code: e.employeeCode,
        full_name: e.fullName,
        designation: e.designation,
        department: e.department?.name ?? '',
        employee_type: e.employeeType,
        joining_date: e.joiningDate.toLocaleDateString('en-GB'),
        status: e.status,
      }))
      break
    }

    case 'headcount': {
      const depts = await prisma.department.findMany({
        include: {
          employees: {
            where: { status: 'ACTIVE' },
            select: { id: true, employeeType: true },
          },
        },
      })
      columns = ['department', 'total', 'permanent', 'probation', 'internship']
      data = depts.map((d) => ({
        department: d.name,
        total: d.employees.length,
        permanent: d.employees.filter((e) => e.employeeType === 'PERMANENT').length,
        probation: d.employees.filter((e) => e.employeeType === 'PROBATION').length,
        internship: d.employees.filter((e) => e.employeeType === 'INTERNSHIP').length,
      }))
      break
    }

    case 'leave_summary': {
      const requests = await prisma.leaveRequest.findMany({
        where: {
          ...(from ? { fromDate: { gte: from } } : {}),
          ...(to ? { toDate: { lte: to } } : {}),
        },
        include: { employee: { select: { fullName: true, employeeCode: true } } },
        orderBy: { fromDate: 'desc' },
      })
      columns = ['employee_code', 'employee_name', 'leave_type', 'from_date', 'to_date', 'days', 'status']
      data = requests.map((r) => ({
        employee_code: r.employee.employeeCode,
        employee_name: r.employee.fullName,
        leave_type: r.leaveType,
        from_date: r.fromDate.toLocaleDateString('en-GB'),
        to_date: r.toDate.toLocaleDateString('en-GB'),
        days: r.days,
        status: r.status,
      }))
      break
    }

    case 'payroll_summary': {
      const payslips = await prisma.payslip.findMany({
        where: {
          payrollRun: {
            ...(from ? { year: { gte: from.getFullYear() } } : {}),
          },
        },
        include: {
          employee: { select: { fullName: true, employeeCode: true } },
          payrollRun: { select: { month: true, year: true } },
        },
        orderBy: { payrollRun: { year: 'desc' } },
        take: 200,
      })
      columns = ['employee_code', 'employee_name', 'month_year', 'gross', 'eobi', 'tax', 'net_pay', 'status']
      data = payslips.map((p) => ({
        employee_code: p.employee.employeeCode,
        employee_name: p.employee.fullName,
        month_year: p.payrollRun ? `${p.payrollRun.month}/${p.payrollRun.year}` : `${p.month}/${p.year}`,
        gross: p.grossSalary,
        eobi: p.eobi,
        tax: p.incomeTax,
        net_pay: p.netSalary,
        status: p.status,
      }))
      break
    }

    case 'attendance_summary': {
      const logs = await prisma.attendanceLog.findMany({
        where: {
          ...(from ? { date: { gte: from } } : {}),
          ...(to ? { date: { lte: to } } : {}),
        },
        include: { employee: { select: { fullName: true, employeeCode: true } } },
        orderBy: { date: 'desc' },
        take: 500,
      })
      columns = ['employee_code', 'employee_name', 'date', 'status', 'clock_in', 'clock_out']
      data = logs.map((l) => ({
        employee_code: l.employee.employeeCode,
        employee_name: l.employee.fullName,
        date: l.date.toLocaleDateString('en-GB'),
        status: l.status,
        clock_in: l.clockIn ? l.clockIn.toLocaleTimeString() : '',
        clock_out: l.clockOut ? l.clockOut.toLocaleTimeString() : '',
      }))
      break
    }
  }

  return NextResponse.json({ data, columns })
}
