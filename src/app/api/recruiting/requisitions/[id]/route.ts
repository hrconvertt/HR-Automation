/**
 * PATCH /api/recruiting/requisitions/[id]
 *
 *   HR_ADMIN only. Approves or rejects a PENDING manager request.
 *     body: { decision: 'APPROVE' | 'REJECT', note?: string }
 *
 *   Approve → status='OPEN', postedDate=now, sends notification to manager.
 *   Reject  → status='REJECTED', decisionNote saved, manager notified.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { generateJD } from '@/lib/jd-generator'

interface RouteParams { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  })
  if (!me || me.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to decide requests' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const note  = body.note ? String(body.note).trim().slice(0, 2000) : null

  const req = await prisma.jobRequisition.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, requestedById: true },
  })
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ─── State machine ───────────────────────────────────────────────
  //   PENDING  → OPEN | REJECTED          (HR decides a manager request)
  //   OPEN     → PAUSED | CLOSED | FILLED (HR manages the live posting)
  //   PAUSED   → OPEN | CLOSED            (resume or abandon)
  //   CLOSED   → OPEN                     (reopen)
  //   FILLED   → OPEN                     (reopen if filled in error)
  //   REJECTED → (terminal)
  const decision = body.decision ? String(body.decision).toUpperCase() : null
  const targetStatus = body.status ? String(body.status).toUpperCase() : null

  // Legacy decision path (PENDING approvals)
  if (decision) {
    if (!['APPROVE', 'REJECT'].includes(decision)) {
      return NextResponse.json({ error: 'decision must be APPROVE or REJECT' }, { status: 400 })
    }
    if (req.status !== 'PENDING') {
      return NextResponse.json({ error: 'This requisition is not pending' }, { status: 409 })
    }
    const newStatus = decision === 'APPROVE' ? 'OPEN' : 'REJECTED'

    // ─── Phase A — auto-generate the JD on approval ─────────────────
    // Fresh JD goes in DRAFT_JD status. HR opens the JD dialog, tweaks,
    // and clicks Approve & Publish to flip jdStatus → JD_APPROVED →
    // POSTED. The role isn't broadcast until POSTED.
    let jdPatch = {}
    if (decision === 'APPROVE') {
      const full = await prisma.jobRequisition.findUnique({ where: { id } })
      const dept = full?.departmentId
        ? await prisma.department.findUnique({ where: { id: full.departmentId }, select: { name: true } })
        : null
      if (full) {
        const draft = generateJD({
          title: full.title,
          departmentName: dept?.name,
          type: full.type,
          vacancies: full.vacancies,
          reason: full.requestReason,
          requestNote: full.requestNote,
        })
        jdPatch = {
          jdContent: draft,
          jdStatus: 'DRAFT_JD',
          jdGeneratedAt: new Date(),
        }
      }
    }

    await prisma.jobRequisition.update({
      where: { id },
      data: {
        status: newStatus,
        decisionNote: note,
        decidedAt: new Date(),
        decidedById: me.id,
        postedDate: decision === 'APPROVE' ? new Date() : undefined,
        ...jdPatch,
      },
    })
    // notification block below handles this path too via `req.requestedById`
  } else if (targetStatus) {
    // Status-transition path (OPEN → PAUSED/CLOSED/FILLED, etc.)
    const ALLOWED: Record<string, string[]> = {
      OPEN:    ['PAUSED', 'CLOSED', 'FILLED'],
      PAUSED:  ['OPEN', 'CLOSED'],
      CLOSED:  ['OPEN'],
      FILLED:  ['OPEN'],
    }
    if (!ALLOWED[req.status]?.includes(targetStatus)) {
      return NextResponse.json({ error: `Cannot transition from ${req.status} to ${targetStatus}` }, { status: 409 })
    }
    await prisma.jobRequisition.update({
      where: { id },
      data: { status: targetStatus, decisionNote: note ?? undefined },
    })
  } else {
    return NextResponse.json({ error: 'Provide either `decision` or `status`' }, { status: 400 })
  }

  // Notify the original requester (when there is one) — only on the
  // decision path. Status transitions (Pause/Close/Fill/Reopen) are
  // HR-internal and don't need to surface as notifications to the
  // requesting manager.
  if (decision && req.requestedById) {
    await prisma.notification.create({
      data: {
        employeeId: req.requestedById,
        type: 'HIRING_REQUEST_DECISION',
        title: decision === 'APPROVE'
          ? `Hiring request approved — ${req.title}`
          : `Hiring request rejected — ${req.title}`,
        message: note ?? (decision === 'APPROVE'
          ? 'HR has approved your request. The role is now open.'
          : 'HR has rejected your request.'),
        link: `/dashboard/recruiting`,
      },
    })
  }

  // Return whichever new status was just written.
  const updated = await prisma.jobRequisition.findUnique({ where: { id }, select: { status: true } })
  return NextResponse.json({ ok: true, status: updated?.status })
}
