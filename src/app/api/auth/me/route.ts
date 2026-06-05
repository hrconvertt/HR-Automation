import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  if (!token) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const payload = verifyToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
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

    const roles = user.userRoles.length > 0
      ? user.userRoles.map((r) => r.role)
      : [user.role]

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        roles,
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
