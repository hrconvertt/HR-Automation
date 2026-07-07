/**
 * Payroll Register + GL — full-company register across ALL runs for a period
 * (regular + off-cycle), one row per employee, every earning + deduction
 * component column, plus a totals row.
 *
 * Access: HR_ADMIN, FINANCE, EXECUTIVE only (server-gated). Salary amounts,
 * so no MANAGER/EMPLOYEE. HR previewing as a non-privileged role is blocked
 * (effectiveRole reflects the preview cookie).
 *
 * ?month=&year= select the period (defaults to current month).
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RegisterClient, type RegisterRow, type RegisterData } from './register-client'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

interface PageProps {
  searchParams: Promise<{ month?: string; year?: string }>
}

export default async function PayrollRegisterPage({ searchParams }: PageProps) {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { userRoles: { select: { role: true } } },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  if (!['HR_ADMIN', 'FINANCE', 'EXECUTIVE'].includes(effectiveRole)) {
    redirect('/dashboard/payroll')
  }

  const sp = await searchParams
  const now = new Date()
  const month = Number(sp.month) || now.getMonth() + 1
  const year = Number(sp.year) || now.getFullYear()

  const runs = await prisma.payrollRun.findMany({
    where: { month, year },
    orderBy: { createdAt: 'asc' },
    include: {
      payslips: {
        include: {
          employee: { select: { fullName: true, employeeCode: true } },
        },
      },
    },
  })

  // Aggregate one row per employee across ALL runs in the period.
  const byEmp = new Map<string, RegisterRow>()
  for (const run of runs) {
    for (const p of run.payslips) {
      const key = p.employeeId
      const row = byEmp.get(key) ?? {
        employeeId: key,
        name: p.employee.fullName,
        employeeCode: p.employee.employeeCode,
        basic: 0, houseRent: 0, utilities: 0, food: 0, fuel: 0,
        medicalAllowance: 0, otherAllowance: 0, overtimePay: 0,
        bonus: 0, arrears: 0, leaveEncashment: 0,
        gross: 0, eobi: 0, incomeTax: 0,
        providentFund: 0, healthcare: 0, loanDeduction: 0,
        advanceDeduction: 0, otherDeductions: 0, lateDeduction: 0,
        net: 0,
      }
      row.basic += p.basic
      row.houseRent += p.houseRent
      row.utilities += p.utilities
      row.food += p.food
      row.fuel += p.fuel
      row.medicalAllowance += p.medicalAllowance
      row.otherAllowance += p.otherAllowance
      row.overtimePay += p.overtimePay
      row.bonus += p.bonus
      row.arrears += p.arrears
      row.leaveEncashment += p.leaveEncashment
      row.gross += p.grossSalary
      row.eobi += p.eobi
      row.incomeTax += p.incomeTax
      row.providentFund += p.providentFund
      row.healthcare += p.healthcare
      row.loanDeduction += p.loanDeduction
      row.advanceDeduction += p.advanceDeduction
      row.otherDeductions += p.otherDeductions
      row.lateDeduction += p.lateDeduction
      row.net += p.netSalary
      byEmp.set(key, row)
    }
  }

  const rows = [...byEmp.values()].sort((a, b) => a.name.localeCompare(b.name))

  const data: RegisterData = {
    month,
    year,
    monthLabel: `${MONTHS[month - 1]} ${year}`,
    rows,
    runSummary: runs.map((r) => ({
      id: r.id,
      runType: r.runType,
      status: r.status,
      count: r.payslips.length,
    })),
  }

  return <RegisterClient data={data} />
}
