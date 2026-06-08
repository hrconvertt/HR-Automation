import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole, hashPassword } from '@/lib/auth'

function generateEmployeeCode(deptCode: string, count: number): string {
  return `CON-${deptCode}-${String(count + 1).padStart(3, '0')}`
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Determine effective role (HR can preview as another role via cookie)
  const previewRole = payload.role === 'HR_ADMIN'
    ? request.cookies.get('hr_preview_role')?.value
    : undefined
  const effectiveRole = previewRole ?? payload.role

  // Find the user's employee record for MANAGER/EMPLOYEE scoping
  // (the JWT doesn't include employeeId, so look up via user.id)
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { employee: { select: { id: true } } },
  })
  const me = user?.employee ?? null

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') ?? ''
  const departmentId = searchParams.get('departmentId') ?? ''
  const status = searchParams.get('status') ?? ''
  const employeeType = searchParams.get('employeeType') ?? ''
  const limit = parseInt(searchParams.get('limit') ?? '100')

  // Role-based filters layered onto user filters
  let roleFilter: object = {}
  if (effectiveRole === 'MANAGER' && me) {
    roleFilter = { reportingManagerId: me.id }
  } else if (effectiveRole === 'EMPLOYEE') {
    // Employees see directory of active people, but limited fields (handled in select below)
    roleFilter = { status: 'ACTIVE' }
  }
  // HR_ADMIN and EXECUTIVE see all (no extra filter)

  const employees = await prisma.employee.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { fullName: { contains: search } },
                { email: { contains: search } },
                { employeeCode: { contains: search } },
                { designation: { contains: search } },
              ],
            }
          : {},
        departmentId ? { departmentId } : {},
        status ? { status } : {},
        employeeType ? { employeeType } : {},
        roleFilter,
      ],
    },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      email: true,
      designation: true,
      employeeType: true,
      status: true,
      department: { select: { name: true } },
    },
    orderBy: { fullName: 'asc' },
    take: limit,
  })

  return NextResponse.json({ employees })
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Block HR creating while previewing as another role
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json(
      { error: 'Cannot create employees while previewing as another role. Switch back to HR view.' },
      { status: 403 },
    )
  }

  try {
    const body = await request.json()
    const {
      fullName, email, designation, departmentId, employeeType, joiningDate, phone, cnic,
      // Optional: probation duration in months (1-12). Only honored when
      // employeeType != PERMANENT. Defaults to 3 when omitted.
      probationMonths,
      // Initial Compensation (optional). If `salary` is provided, a Salary
      // record + CompensationHistory row are created in the same transaction
      // so AutoPilot can pick the new hire up immediately.
      // Shape: { basic, houseRent, utilities, food, fuel, medicalAllowance, otherAllowance }
      //   — any missing field defaults to 0
      // Or:    { totalGross, splitPct: { basic: 0.6, houseRent: 0.4, ... } }
      //   — convenience for the simplified "Total Gross" UI
      salary,
    } = body

    if (!fullName || !email || !designation || !joiningDate) {
      return NextResponse.json({ error: 'fullName, email, designation, and joiningDate are required' }, { status: 400 })
    }

    const existing = await prisma.employee.findUnique({ where: { email } })
    if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 409 })

    let deptCode = 'GEN'
    if (departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { code: true } })
      if (dept) deptCode = dept.code
    }

    const count = await prisma.employee.count({ where: departmentId ? { departmentId } : {} })
    const employeeCode = generateEmployeeCode(deptCode, count)
    const empType = employeeType ?? 'PROBATION'

    // ─── Auto-provision login (Step 3a) ─────────────────────────────────────
    // Every new hire gets a User row so they can log into the portal.
    // Self-healing:
    //   • If a User with this email already exists (re-hire, manual seed),
    //     LINK to it instead of failing.
    //   • Otherwise create one with a temp password = employeeCode (lowercased).
    //     mustChangePass=true forces a reset on first login.
    //   • DB role defaults to EMPLOYEE; HR can elevate later.
    // Note: We do the Employee create and the User create/link in a single
    // transaction so a half-provisioned hire is impossible.
    const tempPassword = employeeCode.toLowerCase()
    const hashed = await hashPassword(tempPassword)

    const { employee, userInfo, salaryCreated } = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { email } })

      const emp = await tx.employee.create({
        data: {
          employeeCode,
          fullName,
          email,
          designation,
          // When a nested write on `user` is present, Prisma requires the
          // department relation form rather than the scalar FK.
          ...(departmentId ? { department: { connect: { id: departmentId } } } : {}),
          employeeType: empType,
          joiningDate: new Date(joiningDate),
          phone: phone ?? null,
          cnic: cnic ?? null,
          // Link to existing user if found, else create new.
          user: existingUser
            ? { connect: { id: existingUser.id } }
            : {
                create: {
                  email,
                  password: hashed,
                  role: 'EMPLOYEE',
                  mustChangePass: true,
                  isActive: true,
                  userRoles: { create: { role: 'EMPLOYEE' } },
                },
              },
        },
      })

      // Self-heal: if we linked to an existing user, ensure they have the
      // EMPLOYEE role membership (idempotent via @@unique).
      if (existingUser) {
        await tx.userRole.upsert({
          where: { userId_role: { userId: existingUser.id, role: 'EMPLOYEE' } },
          update: {},
          create: { userId: existingUser.id, role: 'EMPLOYEE' },
        })
      }

      // ─── Initial Compensation (optional) ────────────────────────────
      // Captured at hire-time so HR doesn't have to navigate to the
      // Compensation tab as a separate step. AutoPilot uses these values
      // immediately on the next payroll run.
      const num = (v: unknown): number => {
        const n = typeof v === 'number' ? v : Number(v)
        return Number.isFinite(n) && n >= 0 ? n : 0
      }
      let salaryCreated = false
      if (salary && typeof salary === 'object') {
        let lines = {
          basic: num(salary.basic),
          houseRent: num(salary.houseRent),
          utilities: num(salary.utilities),
          food: num(salary.food),
          fuel: num(salary.fuel),
          medicalAllowance: num(salary.medicalAllowance),
          otherAllowance: num(salary.otherAllowance),
        }
        // If only a totalGross + splitPct is sent, derive the line items.
        if (salary.totalGross && salary.splitPct && typeof salary.splitPct === 'object') {
          const total = num(salary.totalGross)
          const sp = salary.splitPct as Record<string, number>
          for (const k of Object.keys(lines) as (keyof typeof lines)[]) {
            const pct = num(sp[k])
            lines[k] = Math.round(total * pct)
          }
        }
        const totalGross = Object.values(lines).reduce((a, b) => a + b, 0)
        if (totalGross > 0) {
          await tx.salary.create({
            data: {
              employeeId: emp.id,
              ...lines,
              effectiveFrom: new Date(joiningDate),
            },
          })
          // Audit trail: initial-comp row in CompensationHistory.
          await tx.compensationHistory.create({
            data: {
              employeeId: emp.id,
              effectiveDate: new Date(joiningDate),
              type: 'NEW_HIRE',
              oldSalary: 0,
              newSalary: totalGross,
              incrementPct: 0,
              reason: 'Initial compensation at hire',
            },
          }).catch(() => {})
          salaryCreated = true
        }
      }

      return {
        employee: emp,
        userInfo: existingUser
          ? { linked: true as const, tempPassword: null as string | null }
          : { linked: false as const, tempPassword },
        salaryCreated,
      }
    })

    // Create probation record (skip for PERMANENT hires)
    if (empType !== 'PERMANENT') {
      const monthsRaw = Number(probationMonths)
      const months = Number.isFinite(monthsRaw) && monthsRaw >= 1 && monthsRaw <= 12
        ? Math.floor(monthsRaw)
        : 3
      const probEndDate = new Date(joiningDate)
      probEndDate.setMonth(probEndDate.getMonth() + months)
      await prisma.probationRecord.create({
        data: {
          employeeId: employee.id,
          startDate: new Date(joiningDate),
          endDate: probEndDate,
          durationMonths: months,
          status: 'ACTIVE',
        },
      })
    }

    // Create onboarding checklist
    await prisma.onboardingChecklist.create({
      data: { employeeId: employee.id },
    })

    // Initialize leave balances
    const policies = await prisma.leavePolicy.findMany({
      where: { employeeType: empType },
    })

    for (const policy of policies) {
      await prisma.leaveBalance.upsert({
        where: {
          employeeId_year_leaveType: {
            employeeId: employee.id,
            year: new Date().getFullYear(),
            leaveType: policy.leaveType,
          },
        },
        update: {},
        create: {
          employeeId: employee.id,
          year: new Date().getFullYear(),
          leaveType: policy.leaveType,
          allocated: policy.daysPerYear,
          used: 0,
          pending: 0,
          remaining: policy.daysPerYear,
        },
      })
    }

    return NextResponse.json(
      {
        employee,
        salaryCreated,
        login: {
          email,
          // Only returned on fresh account creation. Null for re-link.
          tempPassword: userInfo.tempPassword,
          linkedExisting: userInfo.linked,
          message: userInfo.linked
            ? 'Linked to existing user account. They use their current password.'
            : 'Share this temporary password with the employee. They must change it on first login.',
        },
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[POST /api/employees]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
