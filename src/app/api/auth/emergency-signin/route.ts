/**
 * POST /api/auth/emergency-signin
 *
 * The Path A bypass — accepts email + password, validates against the
 * existing User.password bcrypt hash, sets the `hr_token` cookie that
 * verifyToken's fallback branch will accept.
 *
 * Works independently of Clerk. If Clerk is broken or HR can't sign in
 * through it, this gets them back in.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword, signEmergencyJwt } from '@/lib/auth'

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, password: true, role: true, isActive: true },
  })
  if (!user) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }
  if (!user.isActive) {
    return NextResponse.json({ error: 'Account is inactive. Contact HR.' }, { status: 403 })
  }
  if (!user.password) {
    return NextResponse.json(
      { error: 'No password on file. Ask HR to run scripts/reset-password.cjs for your email.' },
      { status: 400 },
    )
  }

  const ok = await verifyPassword(password, user.password)
  if (!ok) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  const token = signEmergencyJwt({ userId: user.id, role: user.role })

  const res = NextResponse.json({ ok: true, redirectTo: '/dashboard' })
  res.cookies.set('hr_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  })
  return res
}
