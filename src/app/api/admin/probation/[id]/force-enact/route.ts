import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { enactOutcome } from '@/lib/probation-reconciler'

/**
 * HR-only emergency override.
 *
 * Forces a probation record to skip the normal manager → HR → meeting →
 * outcome flow when the record has stalled past its end date with no
 * decision recorded. Records the override reason in hrNotes for audit.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = await verifyToken(tok)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  if (!user || user.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }
  // Block HR-previewing-as-non-HR
  if (c.get('hr_preview_role')?.value) {
    return NextResponse.json({ error: 'Preview mode cannot perform destructive ops' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const outcome = String(body.outcome || '').toUpperCase()
  const reason = String(body.reason || '').trim()

  if (!['CONFIRM', 'EXTEND', 'WARNING', 'TERMINATE'].includes(outcome)) {
    return NextResponse.json({ error: 'Invalid outcome' }, { status: 400 })
  }
  if (!reason) {
    return NextResponse.json({ error: 'Reason required for HR override' }, { status: 400 })
  }

  const rec = await prisma.probationRecord.findUnique({ where: { id } })
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (rec.outcomeEnactedAt) {
    return NextResponse.json({ error: 'Already enacted' }, { status: 400 })
  }

  const auditPrefix = `[HR OVERRIDE — Force-enact by ${payload.userId} on ${new Date().toISOString()}]`
  const notes = `${auditPrefix} ${reason}${rec.hrNotes ? `\n\n--- prior notes ---\n${rec.hrNotes}` : ''}`

  await prisma.probationRecord.update({
    where: { id },
    data: {
      hrDecision: outcome,
      hrNotes: notes,
      hrDecidedAt: new Date(),
      hrDecidedById: payload.userId,
      status: 'UNDER_REVIEW',
    },
  })

  await enactOutcome(id, payload.userId)
  return NextResponse.json({ ok: true })
}
