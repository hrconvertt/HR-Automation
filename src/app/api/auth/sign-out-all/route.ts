import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

/**
 * POST /api/auth/sign-out-all
 *
 * Invalidates ALL Session rows for the current user (Workday-style
 * "sign out from every device"). Also clears the current request's
 * hr_token cookie so the active browser is signed out too.
 *
 * Note: our JWT tokens are stateless â€” there's no in-DB session table
 * to invalidate the JWT itself, so this endpoint serves two purposes:
 *   1. Wipe any future Session rows (we keep the model for completeness)
 *   2. Clear the cookie on the requesting browser
 * Other browsers' tokens will keep working until they expire (7d max).
 * Rotating the JWT_SECRET on the server is the only way to forcibly
 * invalidate every active JWT â€” documented for future hardening.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  // Best-effort: wipe DB sessions if any exist for this user
  try {
    await prisma.session.deleteMany({ where: { userId: payload.userId } })
  } catch { /* ignore */ }

  const response = NextResponse.json({ success: true })
  response.cookies.set('hr_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}
