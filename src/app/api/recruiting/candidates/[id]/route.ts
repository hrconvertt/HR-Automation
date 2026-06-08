/**
 * PATCH /api/recruiting/candidates/[id]
 *
 *   Move a candidate between pipeline stages.
 *   HR_ADMIN or MANAGER only.
 *     body: { stage: 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED' }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { autoTags, shouldAutoPool } from '@/lib/talent-pool'

const VALID = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']

interface RouteParams { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  const effectiveRole = (previewRole && me.role === 'HR_ADMIN') ? previewRole : me.role
  if (!['HR_ADMIN', 'MANAGER'].includes(effectiveRole)) {
    return NextResponse.json({ error: 'Only Managers or HR can move candidates' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const stage = String(body.stage || '').toUpperCase()
  if (!VALID.includes(stage)) {
    return NextResponse.json({ error: `Invalid stage. Must be one of ${VALID.join(', ')}` }, { status: 400 })
  }

  const c = await prisma.candidate.findUnique({
    where: { id },
    include: { requisition: { select: { title: true, type: true, scoreThreshold: true } } },
  })
  if (!c) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })

  await prisma.candidate.update({ where: { id }, data: { stage } })

  // Auto-pool on rejection if score is strong enough — keeps the
  // candidate around for future requisitions instead of disappearing.
  if (stage === 'REJECTED' && !c.inTalentPool && shouldAutoPool(c, c.requisition.scoreThreshold ?? 60)) {
    const tags = autoTags(c, c.requisition)
    await prisma.candidate.update({
      where: { id },
      data: {
        inTalentPool: true,
        poolTags: tags.join(','),
        poolReason: `Rejected for "${c.requisition.title}" but match score was ${Math.round(c.matchScore ?? 0)} — kept for future roles.`,
        poolAddedAt: new Date(),
      },
    })
  }

  return NextResponse.json({ ok: true, stage })
}
