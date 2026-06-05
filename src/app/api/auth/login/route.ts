import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword, createToken } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        employee: { select: { id: true, fullName: true, photoUrl: true } },
        userRoles: { select: { role: true } },
      },
    })

    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.password)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Build the roles array — fall back to [primary] if join table empty
    const roles = user.userRoles.length > 0
      ? user.userRoles.map((r) => r.role)
      : [user.role]

    const token = createToken({
      userId: user.id,
      role: user.role,
      roles,
      employeeId: user.employee?.id,
    })

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    })

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        employee: user.employee,
      },
    })

    response.cookies.set('hr_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[LOGIN]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
