/**
 * Shared employee-list query logic used by both:
 *   - GET /api/employees (client refetches on filter change)
 *   - /dashboard/employees server component (initial render, no fetch waterfall)
 *
 * Role gating matches the API route exactly. Salary/bank fields are never
 * selected here — the list select is deliberately minimal per role.
 */
import { prisma } from '@/lib/prisma'

export interface ListEmployeesOpts {
  effectiveRole: string
  /** The requesting user's own employee id (for MANAGER scoping). */
  meEmployeeId: string | null
  search?: string
  departmentId?: string
  status?: string
  employeeType?: string
  limit?: number
}

export async function listEmployees(opts: ListEmployeesOpts) {
  const {
    effectiveRole, meEmployeeId,
    search = '', departmentId = '', status = '', employeeType = '',
    limit = 100,
  } = opts

  // Role-based filters layered onto user filters
  let roleFilter: object = {}
  if (effectiveRole === 'MANAGER' && meEmployeeId) {
    roleFilter = { reportingManagerId: meEmployeeId }
  } else if (effectiveRole === 'EMPLOYEE') {
    // Employees see directory of active people, but limited fields
    roleFilter = { status: 'ACTIVE' }
  }
  // HR_ADMIN and EXECUTIVE see all (no extra filter)

  return prisma.employee.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { employeeCode: { contains: search, mode: 'insensitive' } },
                { designation: { contains: search, mode: 'insensitive' } },
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
}

export type EmployeeListRow = Awaited<ReturnType<typeof listEmployees>>[number]

export interface InviteStatus {
  status: 'ACTIVE' | 'INVITED' | 'NONE'
  invitedAt?: Date
  sentTo?: string | null
}

/**
 * HR-only enrichment: login/invite status per employee so the People list
 * can show "Never invited / Invited (pending) / Active" + invite actions.
 * Callers MUST gate this behind effectiveRole === 'HR_ADMIN'.
 */
export async function enrichWithInviteStatus<T extends { id: string }>(
  employees: T[],
): Promise<(T & { personalEmail: string | null; invite: InviteStatus })[]> {
  if (employees.length === 0) return []
  const extras = await prisma.employee.findMany({
    where: { id: { in: employees.map((e) => e.id) } },
    select: {
      id: true,
      personalEmail: true,
      user: { select: { password: true, clerkUserId: true } },
      inviteTokens: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true, usedAt: true, expiresAt: true, sentTo: true },
      },
    },
  })
  const byId = new Map(extras.map((x) => [x.id, x]))
  const now = Date.now()
  return employees.map((e) => {
    const x = byId.get(e.id)
    const hasLogin = !!x?.user && (!!x.user.password || !!x.user.clerkUserId)
    const t = x?.inviteTokens[0]
    const invite: InviteStatus = hasLogin
      ? { status: 'ACTIVE' }
      : t && !t.usedAt && t.expiresAt.getTime() > now
        ? { status: 'INVITED', invitedAt: t.createdAt, sentTo: t.sentTo }
        : { status: 'NONE' }
    return { ...e, personalEmail: x?.personalEmail ?? null, invite }
  })
}
