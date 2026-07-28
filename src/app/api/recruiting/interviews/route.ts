function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  } as Record<string, string>)[c])
}

/**
 * POST /api/recruiting/interviews
 *
 *   Schedule an interview for a candidate. Creates the Interview row,
 *   drafts the candidate's invitation email, and notifies each
 *   interviewer.
 *
 *   Auth: HR_ADMIN, or MANAGER on the requisition that owns the candidate.
 *
 *   body: {
 *     candidateId: string
 *     type: 'PHONE' | 'VIDEO' | 'ONSITE' | 'TECHNICAL' | 'HR'
 *     scheduledAt: ISO string
 *     duration: number (minutes)
 *     interviewerIds?: string[]   // Employee ids
 *     meetingLink?: string         // Zoom / Meet / address
 *     notes?: string
 *   }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import { triggerEmail, candidateVars } from '@/lib/email-triggers'

const VALID_TYPES = ['PHONE', 'VIDEO', 'ONSITE', 'TECHNICAL', 'HR']

const TYPE_LABEL: Record<string, string> = {
  PHONE: 'phone screen',
  VIDEO: 'video interview',
  ONSITE: 'onsite interview',
  TECHNICAL: 'technical interview',
  HR: 'HR conversation',
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  const effectiveRole = (previewRole && me.role === 'HR_ADMIN') ? previewRole : me.role
  if (!['HR_ADMIN', 'MANAGER'].includes(effectiveRole)) {
    return NextResponse.json({ error: 'Only HR or Managers can schedule interviews' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const candidateId = String((body as { candidateId?: unknown }).candidateId ?? '')
  const type = String((body as { type?: unknown }).type ?? '').toUpperCase()
  const scheduledAtRaw = (body as { scheduledAt?: unknown }).scheduledAt
  const duration = Number((body as { duration?: unknown }).duration ?? 45)
  const interviewerIdsRaw = (body as { interviewerIds?: unknown }).interviewerIds
  const interviewerIds = Array.isArray(interviewerIdsRaw)
    ? interviewerIdsRaw.filter((x): x is string => typeof x === 'string')
    : []
  const meetingLink = (body as { meetingLink?: unknown }).meetingLink
    ? String((body as { meetingLink?: unknown }).meetingLink).trim().slice(0, 500)
    : null
  const notes = (body as { notes?: unknown }).notes
    ? String((body as { notes?: unknown }).notes).trim().slice(0, 2000)
    : null

  if (!candidateId) return NextResponse.json({ error: 'candidateId is required' }, { status: 400 })
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }
  const scheduledAt = scheduledAtRaw ? new Date(String(scheduledAtRaw)) : null
  if (!scheduledAt || isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: 'scheduledAt must be a valid ISO datetime' }, { status: 400 })
  }
  if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
    return NextResponse.json({ error: 'duration must be between 5 and 480 minutes' }, { status: 400 })
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: { requisition: { select: { id: true, title: true, requestedById: true } } },
  })
  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })

  // Manager scoping â€” only the hiring manager (or HR) can schedule for this candidate.
  if (effectiveRole === 'MANAGER') {
    if (!me.employee?.id || candidate.requisition.requestedById !== me.employee.id) {
      return NextResponse.json(
        { error: 'You can only schedule interviews for requisitions you raised' },
        { status: 403 },
      )
    }
  }

  // Determine round â€” 1 + existing interviews for this candidate.
  const priorCount = await prisma.interview.count({ where: { candidateId } })
  const round = priorCount + 1

  const interview = await prisma.interview.create({
    data: {
      candidateId,
      round,
      type,
      scheduledAt,
      duration: Math.round(duration),
      interviewerIds: interviewerIds.length ? JSON.stringify(interviewerIds) : null,
      meetingLink,
      notes,
    },
  })

  // Move candidate to INTERVIEW stage if still earlier in the pipeline.
  if (['APPLIED', 'SCREENING'].includes(candidate.stage)) {
    await prisma.candidate.update({ where: { id: candidateId }, data: { stage: 'INTERVIEW' } })
  }

  // Resolve interviewer names for the candidate-facing email.
  const interviewers = interviewerIds.length
    ? await prisma.employee.findMany({
        where: { id: { in: interviewerIds } },
        select: { id: true, fullName: true, email: true, designation: true },
      })
    : []

  // Draft candidate-facing email.
  const slotLine = scheduledAt.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }) + ' at ' + scheduledAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
  const firstName = candidate.fullName.split(' ')[0]
  const subject = `Interview invitation â€” ${TYPE_LABEL[type]} with Convertt for ${candidate.requisition.title}`
  const interviewerLine = interviewers.length
    ? `<p><strong>You'll be meeting:</strong> ${interviewers.map((iv) => escapeHtml(`${iv.fullName}${iv.designation ? ` (${iv.designation})` : ''}`)).join(', ')}</p>`
    : ''
  const linkLine = meetingLink
    ? `<p><strong>Meeting link / location:</strong> ${escapeHtml(meetingLink)}</p>`
    : ''
  const notesLine = notes ? `<p>${escapeHtml(notes)}</p>` : ''
  const bodyHtml = `
<p>Hi ${escapeHtml(firstName)},</p>
<p>Thanks for applying for the <strong>${escapeHtml(candidate.requisition.title)}</strong> role at Convertt. We'd like to invite you to a <strong>${escapeHtml(TYPE_LABEL[type])}</strong>.</p>
<p><strong>When:</strong> ${escapeHtml(slotLine)}<br/>
<strong>Duration:</strong> ~${Math.round(duration)} minutes</p>
${linkLine}
${interviewerLine}
${notesLine}
<p>Please reply to confirm, or let us know if another time works better.</p>
<p>Looking forward,<br/>Convertt HR</p>
`.trim()

  await prisma.emailDraft.create({
    data: {
      toEmail: candidate.email,
      toName: candidate.fullName,
      subject,
      bodyHtml,
      trigger: 'CUSTOM',
      triggerRefId: interview.id,
      status: 'DRAFT',
      createdById: me.id,
    },
  })

  // Notify each interviewer (best-effort).
  await Promise.all(
    interviewers.map((iv) =>
      notify({
        employeeId: iv.id,
        type: 'GENERAL',
        title: 'Interview scheduled',
        message: `${candidate.fullName} â€” ${TYPE_LABEL[type]} on ${slotLine}.`,
        link: `/dashboard/recruiting?tab=schedule`,
      }),
    ),
  )

  // Template-driven email trigger (REC-03)
  await triggerEmail({
    event: 'interview.scheduled',
    candidateId,
    variables: {
      ...candidateVars({ fullName: candidate.fullName, jobTitle: candidate.requisition.title }),
      'Day, Date, Time + Timezone': slotLine + ' PKT',
      '~45 minutes': `~${Math.round(duration)} minutes`,
      'Video call / In-person / Phone': TYPE_LABEL[type],
      'Meeting link / Office address â€” Mega Tower, Lahore': meetingLink || 'Mega Tower, Lahore',
      'Name, Title': interviewers.map((iv) => `${iv.fullName}${iv.designation ? ` (${iv.designation})` : ''}`).join(', ') || 'TBD',
    },
    conditionContext: { round },
    createdById: me.id,
    dedupeSalt: interview.id,
  })

  return NextResponse.json({ ok: true, interview })
}
