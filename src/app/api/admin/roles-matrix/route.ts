import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      email: true,
      role: true,
      userRoles: { select: { role: true } },
      employee: {
        select: {
          fullName: true,
          designation: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: { email: 'asc' },
  })

  const rows = users.map((u) => {
    const roles = new Set<string>()
    roles.add(u.role)
    for (const r of u.userRoles) roles.add(r.role)
    return {
      id: u.id,
      email: u.email,
      fullName: u.employee?.fullName ?? u.email,
      designation: u.employee?.designation ?? null,
      department: u.employee?.department?.name ?? null,
      primaryRole: u.role,
      roles: Array.from(roles),
    }
  })

  // Stats
  const stats: Record<string, number> = {
    HR_ADMIN: 0,
    MANAGER: 0,
    EMPLOYEE: 0,
    EXECUTIVE: 0,
    FINANCE: 0,
  }
  for (const r of rows) {
    for (const role of r.roles) {
      if (stats[role] !== undefined) stats[role] += 1
    }
  }

  return NextResponse.json({ rows, stats })
}
