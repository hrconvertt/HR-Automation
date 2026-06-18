/**
 * PATCH /api/recruiting/offers/[id]
 *
 *   Resolve a pending JobOffer. HR_ADMIN only.
 *
 *   body: {
 *     status: 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN'
 *     rejectionReason?: string  // required when status=REJECTED
 *   }
 *
 *   Side-effects:
 *     ACCEPTED   → promoteToEmployee() (creates Employee+User+Salary+...),
 *                  candidate.stage = HIRED, notify hiring manager.
 *     REJECTED   → candidate.stage = TALENT_POOL (auto-pool flag) or REJECTED;
 *                  notify HR.
 *     WITHDRAWN  → candidate.stage = REJECTED (we pulled the offer); notify HR.
 *     EXPIRED    → same shape as REJECTED but caller is usually a cron.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { promoteToEmployee } from '@/lib/hire-candidate'
import { notify } from '@/lib/notifications'
import { triggerEmail, candidateVars } from '@/lib/email-triggers'

const VALID = ['ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN']

interface RouteParams { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  const effectiveRole = (previewRole && me.role === 'HR_ADMIN') ? previewRole : me.role
  if (effectiveRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Only HR can change offer status' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const status = String((body as { status?: unknown }).status ?? '').toUpperCase()
  const rejectionReason = (body as { rejectionReason?: unknown }).rejectionReason
    ? String((body as { rejectionReason?: unknown }).rejectionReason).trim().slice(0, 2000)
    : null

  if (!VALID.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${VALID.join(', ')}` }, { status: 400 })
  }
  if (status === 'REJECTED' && !rejectionReason) {
    return NextResponse.json({ error: 'rejectionReason is required when REJECTED' }, { status: 400 })
  }

  const offer = await prisma.jobOffer.findUnique({
    where: { id },
    include: {
      candidate: {
        include: {
          requisition: { select: { id: true, title: true, requestedById: true, scoreThreshold: true } },
        },
      },
    },
  })
  if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })

  await prisma.jobOffer.update({
    where: { id },
    data: {
      status,
      statusChangedAt: new Date(),
      rejectionReason: status === 'REJECTED' ? rejectionReason : offer.rejectionReason,
    },
  })

  let promotedEmployeeId: string | null = null
  if (status === 'ACCEPTED') {
    try {
      const res = await promoteToEmployee(offer.candidateId, me.id)
      promotedEmployeeId = res.employeeId
    } catch (err) {
      // Roll the offer back to PENDING so HR can retry without manual cleanup.
      await prisma.jobOffer.update({
        where: { id },
        data: { status: offer.status, statusChangedAt: offer.statusChangedAt },
      })
      const msg = err instanceof Error ? err.message : 'Promotion failed'
      return NextResponse.json(
        { error: `Could not promote candidate to employee: ${msg}` },
        { status: 400 },
      )
    }
    await prisma.candidate.update({
      where: { id: offer.candidateId },
      data: { stage: 'HIRED' },
    })
    if (offer.candidate.requisition.requestedById) {
      await notify({
        employeeId: offer.candidate.requisition.requestedById,
        type: 'GENERAL',
        title: 'Offer accepted',
        message: `${offer.candidate.fullName} accepted the offer for ${offer.candidate.requisition.title}.`,
        link: promotedEmployeeId ? `/dashboard/employees/${promotedEmployeeId}` : '/dashboard/recruiting/offers',
      })
    }
  } else {
    // REJECTED / WITHDRAWN / EXPIRED — push candidate back to REJECTED,
    // and let the existing auto-pool logic decide whether they're worth
    // keeping around (high match score).
    const score = offer.candidate.matchScore ?? 0
    const threshold = offer.candidate.requisition.scoreThreshold ?? 60
    const autoPool = score >= threshold
    await prisma.candidate.update({
      where: { id: offer.candidateId },
      data: {
        stage: 'REJECTED',
        ...(autoPool && !offer.candidate.inTalentPool
          ? {
              inTalentPool: true,
              poolReason: `Offer ${status.toLowerCase()} for "${offer.candidate.requisition.title}" — strong match score ${Math.round(score)}, kept for future roles.`,
              poolAddedAt: new Date(),
            }
          : {}),
      },
    })
    if (offer.candidate.requisition.requestedById) {
      await notify({
        employeeId: offer.candidate.requisition.requestedById,
        type: 'GENERAL',
        title: `Offer ${status.toLowerCase()}`,
        message: `${offer.candidate.fullName} — offer for ${offer.candidate.requisition.title} is now ${status}.`,
        link: '/dashboard/recruiting/offers',
      })
    }
  }

  // Template-driven email triggers
  const candVars = candidateVars({
    fullName: offer.candidate.fullName,
    jobTitle: offer.candidate.requisition.title,
  })
  if (status === 'ACCEPTED') {
    await triggerEmail({
      event: 'offer.accepted',
      candidateId: offer.candidateId,
      variables: candVars,
      createdById: me.id,
      dedupeSalt: offer.id,
    })
    // Fire downstream onboarding kickoff (ONB-01, ONB-02)
    if (promotedEmployeeId) {
      await triggerEmail({
        event: 'employee.created',
        employeeId: promotedEmployeeId,
        variables: candVars,
        conditionContext: { accounts_provisioned: false },
        createdById: me.id,
        dedupeSalt: promotedEmployeeId,
      })
    }
  }

  return NextResponse.json({ ok: true, status, promotedEmployeeId })
}
