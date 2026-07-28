/**
 * Shared employee invite helper.
 *
 * Two callers:
 *   1) /api/settings/users/invite — HR manually invites a new hire
 *   2) /api/settings/signup-attempts/[id]/approve — HR approves a rejected
 *      Clerk sign-up attempt (someone tried to sign in with a non-allowlisted
 *      email; HR confirms they're a real employee).
 *
 * Creates Employee + User + UserRoles + OnboardingChecklist (in a single
 * transaction), seeds leave balances (outside the tx), then optionally sends
 * a Clerk invitation email.
 */
import { prisma } from '@/lib/prisma'
import { clerkClient } from '@clerk/nextjs/server'
import { seedInitialLeaveBalances } from '@/lib/seed-leave-balances'

export interface InviteEmployeeInput {
  fullName: string
  email: string
  designation: string
  departmentId: string | null
  reportingManagerId?: string | null
  employeeType?: string
  joiningDate?: string | Date
  primaryRole?: string
  additionalRoles?: string[]
  sendInvite?: boolean
}

export interface InviteEmployeeResult {
  employeeId: string
  userId: string
  employeeCode: string
  clerkInviteSent: boolean
  clerkError: string | null
}

function nextEmployeeCode(deptCode: string, count: number): string {
  return `CON-${deptCode}-${String(count + 1).padStart(3, '0')}`
}

export class InviteEmployeeError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export async function inviteEmployee(input: InviteEmployeeInput): Promise<InviteEmployeeResult> {
  if (!input.fullName || !input.email || !input.designation) {
    throw new InviteEmployeeError('fullName, email, designation required', 400)
  }

  const email = input.email.toLowerCase().trim()

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new InviteEmployeeError('A user with this email already exists', 409)

  let dept: { id: string; code: string } | null = null
  if (input.departmentId) {
    dept = await prisma.department.findUnique({
      where: { id: input.departmentId },
      select: { id: true, code: true },
    })
  }
  const deptCode = dept?.code ?? 'GEN'
  const deptCount = dept
    ? await prisma.employee.count({ where: { departmentId: dept.id } })
    : await prisma.employee.count()
  const employeeCode = nextEmployeeCode(deptCode, deptCount)

  const primaryRole = input.primaryRole ?? 'EMPLOYEE'
  const additionalRoles = (input.additionalRoles ?? []).filter((r) => r !== primaryRole)

  const { employee, userId } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        password: '',
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
        fullName: input.fullName,
        email,
        designation: input.designation,
        departmentId: dept?.id ?? null,
        reportingManagerId: input.reportingManagerId ?? null,
        employeeType: input.employeeType ?? 'PROBATION',
        joiningDate: input.joiningDate ? new Date(input.joiningDate) : new Date(),
        userId: user.id,
      },
    })
    await tx.onboardingChecklist.create({ data: { employeeId: emp.id } })
    return { employee: emp, userId: user.id }
  })

  await seedInitialLeaveBalances(employee.id).catch((e) => {
    console.error('[invite] leave-balance seed failed', e)
  })

  let clerkInviteSent = false
  let clerkError: string | null = null
  if (input.sendInvite !== false) {
    try {
      const client = await clerkClient()
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
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

  return {
    employeeId: employee.id,
    userId,
    employeeCode,
    clerkInviteSent,
    clerkError,
  }
}
