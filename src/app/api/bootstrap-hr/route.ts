/**
 * GET /api/bootstrap-hr?token=convertt-recover-tahreem-2026
 *
 * ONE-CLICK EMERGENCY RECOVERY for the HR admin account.
 *
 * Path A wasn't enough — HR couldn't run the local reset-password script
 * because they don't have PowerShell access / the DATABASE_URL.
 *
 * This route, when hit with the correct ?token=... query, will:
 *   1. Look up `hr@convertt.co` in the User table
 *   2. Reset its password to a known value (`Convertt2026`)
 *   3. Mark User.isActive = true
 *   4. Issue an `hr_token` JWT cookie
 *   5. 302-redirect to /dashboard
 *
 * The token in the URL is the only security boundary — keep it private.
 * After HR uses it once, they can change the password or delete this
 * route entirely.
 *
 * This route is whitelisted in middleware.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, signEmergencyJwt } from '@/lib/auth'

const BOOTSTRAP_TOKEN = 'convertt-recover-tahreem-2026'
const TARGET_EMAIL = 'hr@convertt.co'
const NEW_PASSWORD = 'Convertt2026'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? ''

  if (token !== BOOTSTRAP_TOKEN) {
    return new NextResponse('Not found', { status: 404 })
  }

  const user = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
    select: { id: true, role: true },
  })
  if (!user) {
    return NextResponse.json(
      { error: `No User row for ${TARGET_EMAIL}. The DB doesn't have an HR admin to recover.` },
      { status: 404 },
    )
  }

  const hash = await hashPassword(NEW_PASSWORD)
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hash, isActive: true },
  })

  // Issue the JWT cookie immediately so the user lands signed-in.
  const jwt = signEmergencyJwt({ userId: user.id, role: user.role })

  const res = NextResponse.redirect(new URL('/dashboard', url.origin), 302)
  res.cookies.set('hr_token', jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })
  return res
}
