/**
 * Invite a new employee: creates Employee + User + UserRoles + LeaveBalance
 * seed + OnboardingChecklist, then sends a Clerk invitation email.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { clerkClient } from '@clerk/nextjs/server'
import { seedInitialLeaveBalances } from '@/lib/seed-leave-balances'

export const runtime = 'nodejs'

interface InviteBody {
  fullName: string
  email: string
  designation: string
  departmentId: string | null
  reportingManagerId?: string | null
  employeeType?: string // PERMANENT | PROBATION | INTERNSHIP
  joiningDate?: string  // ISO
  primaryRole?: string  // HR_ADMIN | MANAGER | LEAD | EMPLOYEE | EXECUTIVE | FINANCE
  additionalRoles?: string[]
  sendInvite?: boolean
}

function nextEmployeeCode(deptCode: string, count: number): string {
  return `CON-${deptCode}-${String(count + 1).padStart(3, '0')}`
}

export async function POST(req: NextRequest) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  const body = (await req.json()) as InviteBody
  if (!body.fullName || !body.email || !body.designation) {
    return NextResponse.json({ error: 'fullName, email, designation required' }, { status: 400 })
  }

  const email = body.email.toLowerCase().trim()

  // Duplicate check
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })

  // Resolve department
  let dept: { id: string; code: string } | null = null
  if (body.departmentId) {
    dept = await prisma.department.findUnique({
      where: { id: body.departmentId },
      select: { id: true, code: true },
    })
  }
  const deptCode = dept?.code ?? 'GEN'
  const deptCount = dept
    ? await prisma.employee.count({ where: { departmentId: dept.id } })
    : await prisma.employee.count()
  const employeeCode = nextEmployeeCode(deptCode, deptCount)

  const primaryRole = body.primaryRole ?? 'EMPLOYEE'
  const additionalRoles = (body.additionalRoles ?? []).filter((r) => r !== primaryRole)

  // Create everything in a single transaction (excl. Clerk call which can't be rolled back)
  const employee = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        password: '', // deprecated — Clerk owns auth
        role: primaryRole,
        isActive: true,
        mustChangePass: false,
      },
    })
    if (additionalRoles.length > 0) {
      await tx.userRole.createMany({
        data: additionalRoles.map((r) => ({ userId: user.id, role: r })),
      })
    }
    const emp = await tx.employee.create({
      data: {
        employeeCode,
        fullName: body.fullName,
        email,
        designation: body.designation,
        departmentId: dept?.id ?? null,
        reportingManagerId: body.reportingManagerId ?? null,
        employeeType: body.employeeType ?? 'PROBATION',
        joiningDate: body.joiningDate ? new Date(body.joiningDate) : new Date(),
        userId: user.id,
      },
    })
    await tx.onboardingChecklist.create({ data: { employeeId: emp.id } })
    return emp
  })

  // Seed leave balances (outside tx — uses its own queries)
  await seedInitialLeaveBalances(employee.id).catch((e) => {
    console.error('[invite] leave-balance seed failed', e)
  })

  // Send Clerk invitation (best-effort — if it fails, return the employee
  // anyway and let HR re-trigger from the panel).
  let clerkInviteSent = false
  let clerkError: string | null = null
  if (body.sendInvite !== false) {
    try {
      const client = await clerkClient()
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000'
      await client.invitations.createInvitation({
        emailAddress: email,
        redirectUrl: `${baseUrl}/dashboard`,
        notify: true,
        ignoreExisting: true,
      })
      clerkInviteSent = true
    } catch (e) {
      clerkError = e instanceof Error ? e.message : 'Clerk invite failed'
      console.error('[invite] Clerk invitation failed', e)
    }
  }

  return NextResponse.json({
    employeeId: employee.id,
    employeeCode,
    clerkInviteSent,
    clerkError,
  })
}
