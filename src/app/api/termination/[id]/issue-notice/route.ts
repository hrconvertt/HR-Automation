import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guardHrAction, pushActivity } from '@/lib/termination-helpers'
import { notify } from '@/lib/notifications'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await guardHrAction(request)
  if (!guard.ok) return guard.response
  const { access } = guard

  const termination = await prisma.termination.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          fullName: true, employeeCode: true, designation: true, joiningDate: true, email: true,
          department: { select: { name: true } },
        },
      },
    },
  })
  if (!termination) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (termination.status === 'CANCELLED' || termination.status === 'COMPLETED') {
    return NextResponse.json({ error: 'Termination is closed' }, { status: 400 })
  }

  const now = new Date()
  const emp = termination.employee
  const lwd = termination.lastWorkingDay

  // Generate the notice body snapshot — the /termination-notice/[id]/print
  // page renders the actual printable letter, but we store a text snapshot
  // for auditability + future exports.
  const letterBody = [
    `Termination Notice`,
    ``,
    `To: ${emp.fullName} (${emp.employeeCode})`,
    `${emp.designation}${emp.department?.name ? ` — ${emp.department.name}` : ''}`,
    `Joined: ${new Date(emp.joiningDate).toLocaleDateString('en-GB', { dateStyle: 'long' })}`,
    ``,
    `This notice formally advises you that your employment with Convertt is being terminated on the grounds of ${termination.reasonCategory.replace(/_/g, ' ').toLowerCase()}.`,
    ``,
    `Reason:`,
    termination.reason,
    ``,
    `Your last working day will be: ${new Date(lwd).toLocaleDateString('en-GB', { dateStyle: 'long' })}.`,
    ``,
    `Final settlement will be processed as per company policy and statutory requirements.`,
    ``,
    `Issued by: ${access.actorName}`,
    `Date: ${now.toLocaleDateString('en-GB', { dateStyle: 'long' })}`,
  ].join('\n')

  const activity = pushActivity(termination.activityLog, {
    at: now.toISOString(),
    by: access.actorName,
    action: 'NOTICE_ISSUED',
  })

  const updated = await prisma.termination.update({
    where: { id },
    data: {
      noticeIssuedAt: now,
      noticeLetterBody: letterBody,
      status: 'NOTICE_ISSUED',
      activityLog: activity,
    },
  })

  // Notification + queued email
  await notify({
    employeeId: termination.employeeId,
    type: 'GENERAL',
    title: 'Termination notice issued',
    message: `A formal termination notice has been issued. Your last working day is ${new Date(lwd).toLocaleDateString('en-GB', { dateStyle: 'long' })}. Please review the notice.`,
    link: `/termination-notice/${id}/print`,
  }).catch(() => {})

  try {
    await prisma.emailDraft.create({
      data: {
        employeeId: termination.employeeId,
        toEmail: emp.email,
        toName: emp.fullName,
        subject: `Termination Notice — ${emp.fullName}`,
        bodyHtml: `<p>Dear ${emp.fullName},</p><p>Please find attached the formal Termination Notice from Convertt. Your last working day is <strong>${new Date(lwd).toLocaleDateString('en-GB', { dateStyle: 'long' })}</strong>.</p><p>Final settlement will be processed as per company policy and statutory requirements. HR will be in touch to initiate exit clearance.</p><p>Regards,<br/>Human Resources<br/>Convertt</p>`,
        trigger: 'TERMINATION',
        triggerRefId: id,
        status: 'DRAFT',
        createdById: access.userId,
      },
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({ termination: updated })
}
