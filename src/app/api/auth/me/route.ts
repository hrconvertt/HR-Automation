import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_request: NextRequest) {
  // Clerk is the source of truth — verifyToken reads from auth().
  const payload = await verifyToken()
  if (!payload) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        mustChangePass: true,
        isActive: true,
        userRoles: { select: { role: true } },
        employee: {
          select: {
            id: true,
            fullName: true,
            photoUrl: true,
            designation: true,
            department: { select: { name: true } },
          },
        },
      },
    })

    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // During "View as" the session carries only the previewed role, and client
    // pages that ask who they are must see the same thing the server does.
    const roles = payload.previewOf
      ? payload.roles
      : user.userRoles.length > 0
        ? user.userRoles.map((r) => r.role)
        : [user.role]

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: payload.role,
        roles,
        previewOf: payload.previewOf ?? null,
        mustChangePass: user.mustChangePass,
        isActive: user.isActive,
        employee: user.employee,
      },
    })
  } catch (error) {
    console.error('[ME]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
