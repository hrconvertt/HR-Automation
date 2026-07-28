/**
 * POST /api/recruiting/candidates/[id]/override-knockout
 *
 *   HR-only. Body: { reason: string }
 *   Flips a FAILED candidate to OVERRIDDEN, logs who/why, and triggers the
 *   AI scoring that was skipped at intake.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { scoreCandidate } from '@/lib/candidate-scoring'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, role: true } })
  if (!me || me.role !== 'HR_ADMIN') return NextResponse.json({ error: 'HR only' }, { status: 403 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to override knockouts' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const reason = String(body?.reason || '').trim().slice(0, 500)
  if (!reason || reason.length < 3) {
    return NextResponse.json({ error: 'A reason is required to override a knockout' }, { status: 400 })
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: { requisition: { select: { title: true, type: true, jdContent: true } } },
  })
  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  if (candidate.knockoutStatus !== 'FAILED') {
    return NextResponse.json({ error: 'Only FAILED candidates can be overridden' }, { status: 409 })
  }

  // Run the scoring that was skipped at intake.
  const { score, reason: scoreReason } = scoreCandidate(
    {
      experience: candidate.experience,
      currentCompany: candidate.currentCompany,
      currentRole: candidate.currentRole,
      source: candidate.source,
      notes: candidate.notes,
      cvUrl: candidate.cvUrl,
      fullName: candidate.fullName,
    },
    {
      title: candidate.requisition.title,
      type: candidate.requisition.type,
      jdContent: candidate.requisition.jdContent,
    },
  )

  await prisma.candidate.update({
    where: { id },
    data: {
      knockoutStatus: 'OVERRIDDEN',
      knockoutOverrideBy: me.id,
      knockoutOverrideReason: reason,
      knockoutOverrideAt: new Date(),
      matchScore: score,
      scoreReason,
    },
  })

  // Audit trail
  await prisma.auditLog.create({
    data: {
      userId: me.id,
      action: 'APPROVE',
      entity: 'Candidate',
      entityId: id,
      newValue: JSON.stringify({ knockoutStatus: 'OVERRIDDEN', reason, score }),
    },
  }).catch(() => { /* non-fatal */ })

  return NextResponse.json({ ok: true, score })
}
