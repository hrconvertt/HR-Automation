import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_ROLES = new Set(['HR_ADMIN', 'MANAGER', 'EMPLOYEE', 'EXECUTIVE'])

interface Body {
  role?: string
  action?: 'add' | 'remove' | 'set-primary'
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId } = await context.params
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { role, action } = body
  if (!role || !VALID_ROLES.has(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  if (!action || !['add', 'remove', 'set-primary'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, userRoles: { select: { role: true } } },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (action === 'set-primary') {
    // Ensure they actually hold this role first
    const holds =
      user.role === role || user.userRoles.some((r) => r.role === role)
    if (!holds) {
      // Auto-add it
      await prisma.userRole.upsert({
        where: { userId_role: { userId, role } },
        update: {},
        create: { userId, role, assignedBy: payload.userId },
      })
    }
    await prisma.user.update({ where: { id: userId }, data: { role } })
    return NextResponse.json({ ok: true })
  }

  if (action === 'add') {
    await prisma.userRole.upsert({
      where: { userId_role: { userId, role } },
      update: {},
      create: { userId, role, assignedBy: payload.userId },
    })
    return NextResponse.json({ ok: true })
  }

  // remove
  if (user.role === role) {
    return NextResponse.json(
      { error: 'Cannot remove a user’s primary role. Change the primary first.' },
      { status: 400 },
    )
  }
  // Count remaining roles (primary + userRoles unique) — must keep at least one.
  const remaining = new Set<string>([user.role])
  for (const r of user.userRoles) remaining.add(r.role)
  remaining.delete(role)
  if (remaining.size === 0) {
    return NextResponse.json(
      { error: 'User must have at least one role' },
      { status: 400 },
    )
  }
  await prisma.userRole.deleteMany({ where: { userId, role } })
  return NextResponse.json({ ok: true })
}
