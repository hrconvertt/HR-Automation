/**
 * DELETE /api/verification/[id]/emails/[emailId] — remove one logged exchange.
 *
 * Logging is manual — someone pastes a thread in — so a wrong paste, a
 * duplicate, or an email filed against the wrong check all happen. Without a
 * way to remove one, the correspondence record stops being a record and
 * becomes a pile.
 *
 * The email id is checked against the verification in the URL, so a stale tab
 * cannot delete an exchange belonging to a different check.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string; emailId: string }> }

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = request.cookies.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN') return NextResponse.json({ error: 'HR only' }, { status: 403 })

  const { id, emailId } = await params

  const { count } = await prisma.verificationEmail.deleteMany({
    where: { id: emailId, verificationId: id },
  })
  if (count === 0) {
    return NextResponse.json({ error: 'That email is not on this check' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
