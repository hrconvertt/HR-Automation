/**
 * PATCH /api/recruiting/interviews/[id]
 *
 *   Submit feedback for an interview. HR_ADMIN or MANAGER.
 *   When `result=PASS`, automatically drafts an onsite-interview invite
 *   email in the existing EmailQueue (status=DRAFT so HR reviews before
 *   sending), and advances the candidate to INTERVIEW or OFFER stage
 *   depending on round.
 *
 *   body: { feedback?: string, rating?: number, result?: 'PASS'|'FAIL'|'HOLD' }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

const TYPE_LABEL: Record<string, string> = {
  PHONE: 'phone screen', VIDEO: 'video interview',
  ONSITE: 'onsite interview', TECHNICAL: 'technical interview', HR: 'HR conversation',
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  const effectiveRole = (previewRole && me.role === 'HR_ADMIN') ? previewRole : me.role
  if (!['HR_ADMIN', 'MANAGER'].includes(effectiveRole)) {
    return NextResponse.json({ error: 'Only HR or Managers can submit feedback' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const feedback = body.feedback ? String(body.feedback).trim().slice(0, 5000) : null
  const ratingRaw = body.rating != null ? Number(body.rating) : null
  const rating   = ratingRaw != null && Number.isFinite(ratingRaw) && ratingRaw >= 0 && ratingRaw <= 5 ? ratingRaw : null
  const result   = body.result ? String(body.result).toUpperCase() : null
  if (result && !['PASS', 'FAIL', 'HOLD'].includes(result)) {
    return NextResponse.json({ error: 'result must be PASS | FAIL | HOLD' }, { status: 400 })
  }

  const interview = await prisma.interview.findUnique({
    where: { id },
    include: {
      candidate: { include: { requisition: { select: { title: true } } } },
    },
  })
  if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })

  await prisma.interview.update({
    where: { id },
    data: { feedback, rating, ...(result ? { result } : {}) },
  })

  // ─── Side-effects on PASS ───────────────────────────────────────
  let inviteDrafted = false
  if (result === 'PASS') {
    // Advance the candidate stage if appropriate. Phone/video → INTERVIEW.
    // Onsite → OFFER stage (offer-letter workflow lives separately).
    const candidate = interview.candidate
    const isFinal = interview.type === 'ONSITE'
    const nextStage = isFinal ? 'OFFER' : 'INTERVIEW'
    if (candidate.stage !== nextStage && candidate.stage !== 'HIRED' && candidate.stage !== 'REJECTED') {
      await prisma.candidate.update({ where: { id: candidate.id }, data: { stage: nextStage } })
    }

    // Draft the next-step email — onsite invite for non-final rounds,
    // offer-prep ping for the final round.
    if (!isFinal) {
      // Find next likely day at 14:00 local — HR can adjust before sending.
      const slot = nextWorkingAfternoon()
      const slotLine = slot.toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      }) + ' at 2:00 PM'

      const subject = `Next round — onsite interview with Convertt for ${candidate.requisition?.title ?? 'the role'}`
      const bodyHtml = `
<p>Hi ${escapeHtml(candidate.fullName.split(' ')[0])},</p>
<p>Thanks for your time on the <strong>${TYPE_LABEL[interview.type] ?? interview.type.toLowerCase()}</strong>. We'd like to invite you for an <strong>onsite interview</strong> at our Lahore office.</p>
<p><strong>Proposed slot:</strong> ${slotLine}<br/>
<strong>Location:</strong> Mega Tower, Main Boulevard Gulberg, Lahore<br/>
<strong>Duration:</strong> ~90 minutes<br/>
<strong>What to bring:</strong> A device (laptop/tablet) for a short live design / code task, and 3 questions you'd love to ask us.</p>
<p>Just reply with a confirmation or a better window in the next 48 hours. If you have any access needs, let us know and we'll make it work.</p>
<p>Looking forward,<br/>Convertt HR</p>
`.trim()

      await prisma.emailDraft.create({
        data: {
          toEmail: candidate.email,
          toName: candidate.fullName,
          subject,
          bodyHtml,
          trigger: 'ONSITE_INVITE',
          triggerRefId: candidate.id,
          status: 'DRAFT',
          createdById: me.id,
        },
      })
      inviteDrafted = true
    }
  }

  if (result === 'FAIL') {
    // Move the candidate to REJECTED — single source of truth for the
    // pipeline. HR can override later.
    const candidate = interview.candidate
    if (candidate.stage !== 'REJECTED') {
      await prisma.candidate.update({ where: { id: candidate.id }, data: { stage: 'REJECTED' } })
    }
  }

  return NextResponse.json({ ok: true, inviteDrafted })
}

/** Next business day (Mon-Fri) at midnight local. */
function nextWorkingAfternoon(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  // Skip Sat (6) / Sun (0). Pakistan workweek is Mon-Fri at Convertt.
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  d.setHours(14, 0, 0, 0)
  return d
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  } as Record<string, string>)[c])
}
