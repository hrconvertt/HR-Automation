import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, verifyPassword, hashPassword } from '@/lib/auth'

/**
 * POST /api/auth/change-password
 * Body: { currentPassword, newPassword }
 *
 * Verifies the current password, hashes the new one, updates the User
 * row, and clears mustChangePass so the force-change banner stops showing.
 * Returns 200 on success, 400 / 401 on validation failures.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { currentPassword, newPassword } = await request.json().catch(() => ({}))
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Both current and new passwords are required' }, { status: 400 })
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const ok = await verifyPassword(currentPassword, user.password)
  if (!ok) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })

  const hashed = await hashPassword(newPassword)
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, mustChangePass: false },
  })

  return NextResponse.json({ success: true })
}
