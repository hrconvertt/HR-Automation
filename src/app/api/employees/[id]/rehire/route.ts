import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

const REHIRABLE_STATUSES = new Set(['RESIGNED', 'TERMINATED', 'LAYOFF', 'INACTIVE'])

/**
 * POST /api/employees/[id]/rehire — HR_ADMIN only (preview-blocked).
 *
 * Body: { joiningDate, designation, departmentId?, managerId?, monthlySalary? }
 *
 * Reactivates an ex-employee in one transaction:
 *   - Employee → status ACTIVE, joiningDate updated, rehireDate = now,
 *     designation/department/manager applied, exitDate cleared
 *   - ManagerHistory entry ("Rehired", isManual: false)
 *   - If monthlySalary given: Salary upsert (basic = full amount, other
 *     components 0 — same shape the salary API writes) + CompensationHistory
 *     row (type HIRE, per existing changeType conventions).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Only HR can rehire employees' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to rehire employees' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const joiningDate = body.joiningDate ? new Date(body.joiningDate) : null
  const designation = (body.designation ?? '').toString().trim()
  const departmentId = (body.departmentId ?? '').toString().trim() || null
  const managerId = (body.managerId ?? '').toString().trim() || null
  const monthlySalary =
    body.monthlySalary != null && Number.isFinite(Number(body.monthlySalary)) && Number(body.monthlySalary) > 0
      ? Number(body.monthlySalary)
      : null

  if (!joiningDate || Number.isNaN(joiningDate.getTime())) {
    return NextResponse.json({ error: 'Valid joiningDate required' }, { status: 400 })
  }
  if (!designation) {
    return NextResponse.json({ error: 'designation required' }, { status: 400 })
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: {
      id: true, fullName: true, status: true,
      departmentId: true, reportingManagerId: true,
      salary: { select: { id: true, basic: true, houseRent: true, utilities: true, food: true, fuel: true, medicalAllowance: true, otherAllowance: true } },
    },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  if (!REHIRABLE_STATUSES.has(employee.status)) {
    return NextResponse.json(
      { error: `Only resigned, terminated, laid-off or inactive employees can be rehired (this one is ${employee.status})` },
      { status: 400 },
    )
  }

  if (managerId) {
    if (managerId === id) {
      return NextResponse.json({ error: 'An employee cannot be their own manager' }, { status: 400 })
    }
    const mgr = await prisma.employee.findUnique({ where: { id: managerId }, select: { status: true } })
    if (!mgr || mgr.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Target manager not found or inactive' }, { status: 400 })
    }
  }
  if (departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } })
    if (!dept) return NextResponse.json({ error: 'Target department not found' }, { status: 400 })
  }

  const now = new Date()
  const newManagerId = managerId ?? employee.reportingManagerId

  const oldGross = employee.salary
    ? employee.salary.basic + employee.salary.houseRent + employee.salary.utilities +
      employee.salary.food + employee.salary.fuel + employee.salary.medicalAllowance +
      employee.salary.otherAllowance
    : 0

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        joiningDate,
        rehireDate: now,
        designation,
        exitDate: null,
        ...(departmentId ? { departmentId } : {}),
        ...(managerId ? { reportingManagerId: managerId } : {}),
      },
    })
    await tx.managerHistory.create({
      data: {
        employeeId: id,
        oldManagerId: employee.reportingManagerId,
        newManagerId,
        changedById: payload.userId,
        reason: 'Rehired',
        title: designation,
        effectiveDate: joiningDate,
        isManual: false,
      },
    })
    if (monthlySalary != null) {
      // Salary rows carry a component split; a rehire offer lands as a flat
      // basic amount (components can be refined later in Compensation).
      await tx.salary.upsert({
        where: { employeeId: id },
        update: {
          basic: monthlySalary, houseRent: 0, utilities: 0, food: 0, fuel: 0,
          medicalAllowance: 0, otherAllowance: 0,
          effectiveFrom: joiningDate,
        },
        create: {
          employeeId: id,
          basic: monthlySalary, houseRent: 0, utilities: 0, food: 0, fuel: 0,
          medicalAllowance: 0, otherAllowance: 0,
          effectiveFrom: joiningDate,
        },
      })
      await tx.compensationHistory.create({
        data: {
          employeeId: id,
          type: 'HIRE',
          oldSalary: oldGross,
          newSalary: monthlySalary,
          incrementPct: oldGross > 0 ? ((monthlySalary - oldGross) / oldGross) * 100 : null,
          reason: 'Rehire — joining offer',
          effectiveDate: joiningDate,
          approvedById: payload.userId,
        },
      })
    }
  })

  return NextResponse.json({ ok: true })
}
