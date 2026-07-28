/**
 * Dismiss a sign-up attempt. HR_ADMIN only.
 * Doesn't invite the user — just marks the record DISMISSED so it falls off
 * the Pending list.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { notes?: string }

  const attempt = await prisma.signupAttempt.findUnique({ where: { id } })
  if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  if (attempt.status !== 'PENDING') {
    return NextResponse.json({ error: `Attempt is already ${attempt.status}` }, { status: 409 })
  }

  await prisma.signupAttempt.update({
    where: { id },
    data: {
      status: 'DISMISSED',
      reviewedAt: new Date(),
      reviewedById: payload.userId,
      reviewNotes: body.notes ?? null,
    },
  })

  return NextResponse.json({ ok: true })
}
