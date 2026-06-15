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
import { promoteToEmployee } from '@/lib/hire-candidate'
import { triggerEmail, candidateVars } from '@/lib/email-triggers'

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

  // Stage = HIRED is special: we must FIRST run the promotion (in its own
  // transaction). Only if that succeeds do we flip the stage. This guards
  // against the pipeline showing "HIRED" with no Employee behind it.
  if (stage === 'HIRED') {
    try {
      await promoteToEmployee(id, payload.userId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Promotion failed'
      return NextResponse.json(
        { error: `Could not promote candidate to employee: ${msg}` },
        { status: 400 },
      )
    }
  }

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

  // Fire stage-change emails (REC-02 shortlisted, REC-04 assessment, REC-07 on_hold, etc.)
  const stageMap: Record<string, string> = {
    SCREENING: 'shortlisted',
    INTERVIEW: 'shortlisted',
    OFFER: 'shortlisted',
    REJECTED: 'rejected',
  }
  const mappedStage = stageMap[stage] || stage.toLowerCase()
  const vars = candidateVars({ fullName: c.fullName, jobTitle: c.requisition.title })

  if (stage === 'REJECTED') {
    await triggerEmail({
      event: 'candidate.rejected',
      candidateId: id,
      variables: vars,
      conditionContext: {
        stage: 'rejected',
        'flag.add_to_pool': c.inTalentPool || (c.matchScore ?? 0) >= (c.requisition.scoreThreshold ?? 60),
      },
      createdById: payload.userId,
    })
  } else {
    await triggerEmail({
      event: 'candidate.stage_changed',
      candidateId: id,
      variables: vars,
      conditionContext: { stage: mappedStage },
      createdById: payload.userId,
    })
  }

  return NextResponse.json({ ok: true, stage })
}
