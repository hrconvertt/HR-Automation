import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guardHrAction, pushActivity } from '@/lib/termination-helpers'
import { notify } from '@/lib/notifications'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await guardHrAction(request)
  if (!guard.ok) return guard.response
  const { access } = guard

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const scheduledAtRaw = body.scheduledAt ? String(body.scheduledAt) : ''
  if (!scheduledAtRaw) return NextResponse.json({ error: 'scheduledAt required' }, { status: 400 })
  const scheduledAt = new Date(scheduledAtRaw)
  if (Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: 'invalid scheduledAt' }, { status: 400 })
  }
  const location = body.location ? String(body.location) : null
  const notes = body.notes ? String(body.notes) : null

  const termination = await prisma.termination.findUnique({
    where: { id },
    include: { employee: { select: { fullName: true, reportingManagerId: true } } },
  })
  if (!termination) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (termination.status === 'CANCELLED' || termination.status === 'COMPLETED') {
    return NextResponse.json({ error: 'Termination is closed' }, { status: 400 })
  }

  const activity = pushActivity(termination.activityLog, {
    at: new Date().toISOString(),
    by: access.actorName,
    action: 'MEETING_SCHEDULED',
    note: `Meeting scheduled for ${scheduledAt.toISOString()}${location ? ` at ${location}` : ''}`,
  })

  const updated = await prisma.termination.update({
    where: { id },
    data: {
      meetingScheduledAt: scheduledAt,
      meetingLocation: location,
      meetingAgenda: notes,
      status: 'MEETING_SCHEDULED',
      activityLog: activity,
    },
  })

  // Notify employee — first formal notification
  await notify({
    employeeId: termination.employeeId,
    type: 'GENERAL',
    title: 'Meeting requested by HR',
    message: `You are required to attend a meeting on ${scheduledAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}${location ? ` at ${location}` : ''}. Details will follow via email.`,
    link: `/dashboard/lifecycle/termination/${id}`,
  }).catch(() => {})

  // Queue email — TERMINATION_MEETING_SCHEDULED (best-effort via EmailDraft for HR review)
  try {
    await prisma.emailDraft.create({
      data: {
        employeeId: termination.employeeId,
        toEmail: (await prisma.employee.findUnique({ where: { id: termination.employeeId }, select: { email: true } }))?.email ?? '',
        toName: termination.employee.fullName,
        subject: `Meeting Requested — ${scheduledAt.toLocaleDateString('en-GB', { dateStyle: 'long' })}`,
        bodyHtml: `<p>Dear ${termination.employee.fullName},</p><p>You are formally requested to attend a meeting scheduled for <strong>${scheduledAt.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}</strong>${location ? ` at <strong>${location}</strong>` : ''}.</p>${notes ? `<p>Agenda: ${notes}</p>` : ''}<p>Please confirm your attendance.</p><p>Regards,<br/>Human Resources<br/>Convertt</p>`,
        trigger: 'TERMINATION',
        triggerRefId: id,
        status: 'DRAFT',
        createdById: access.userId,
      },
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({ termination: updated })
}
