/**
 * Manage system roles for an employee's user account.
 * Only HR_ADMIN can modify, and only when not in preview mode.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

const VALID_ROLES = ['HR_ADMIN', 'MANAGER', 'EMPLOYEE', 'EXECUTIVE']

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return null
  return {
    payload,
    previewRole: request.cookies.get('hr_preview_role')?.value,
  }
}

// GET /api/employees/[id]/roles — list current roles
export async function GET(request: NextRequest, { params }: RouteParams) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(access.payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  const { id } = await params
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: { user: { include: { userRoles: { select: { role: true } } } } },
  })
  if (!employee?.user) return NextResponse.json({ error: 'No linked user' }, { status: 404 })

  return NextResponse.json({
    primaryRole: employee.user.role,
    roles: employee.user.userRoles.map((r) => r.role),
  })
}

// PUT /api/employees/[id]/roles — replace the user's role set
// body: { roles: string[], primaryRole?: string }
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(access.payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }
  if (access.previewRole && access.previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to manage roles' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const newRoles: string[] = Array.isArray(body.roles) ? body.roles : []
  const primaryRole: string | undefined = body.primaryRole

  // Validate
  for (const r of newRoles) {
    if (!VALID_ROLES.includes(r)) {
      return NextResponse.json({ error: `Invalid role: ${r}` }, { status: 400 })
    }
  }
  if (newRoles.length === 0) {
    return NextResponse.json({ error: 'Must have at least one role' }, { status: 400 })
  }
  if (primaryRole && !newRoles.includes(primaryRole)) {
    return NextResponse.json({ error: 'Primary role must be in the roles set' }, { status: 400 })
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { userId: true, fullName: true },
  })
  if (!employee?.userId) return NextResponse.json({ error: 'No linked user' }, { status: 404 })

  // Replace roles atomically
  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: employee.userId } }),
    prisma.userRole.createMany({
      data: newRoles.map((role) => ({ userId: employee.userId!, role })),
    }),
    prisma.user.update({
      where: { id: employee.userId },
      data: { role: primaryRole ?? newRoles[0] },
    }),
  ])

  return NextResponse.json({
    success: true,
    employee: employee.fullName,
    roles: newRoles,
    primaryRole: primaryRole ?? newRoles[0],
  })
}
