import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import { DELIVERY_CHANNELS, endOfPkDay, parseInstant, notifyInformed } from '@/lib/show-cause'

interface RouteParams { params: Promise<{ id: string }> }

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, fullName: true } } },
  })
  if (!user) return null
  const previewRole =
    user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  return {
    actualRole: user.role,
    effectiveRole: previewRole ?? user.role,
    employeeId: user.employee?.id ?? null,
    userName: user.employee?.fullName ?? user.email,
  }
}

/**
 * Stage transitions:
 *   LOG_MEETING_OUTCOME — manager records what was discussed (MEETING_REQUESTED → MEETING_HELD)
 *   ESCALATE_TO_HR      — manager escalates (MEETING_HELD → SHOW_CAUSE_REQUESTED)
 *   ISSUE_FORMAL_NOTICE — HR issues the formal Show Cause (SHOW_CAUSE_REQUESTED → ISSUED)
 *   RESPOND             — employee response (ISSUED → RESPONDED)
 *   RESOLVE             — HR/Manager close out positively (→ RESOLVED)
 *   ESCALATE_TO_PIP     — HR escalates to PIP (→ ESCALATED_TO_PIP)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const action = body.action as
    | 'LOG_MEETING_OUTCOME' | 'ESCALATE_TO_HR' | 'ISSUE_FORMAL_NOTICE'
    | 'RESPOND' | 'RESOLVE' | 'ESCALATE_TO_PIP' | 'UPDATE_RECORD'
    | undefined

  const notice = await prisma.showCause.findUnique({
    where: { id },
    select: {
      id: true, employeeId: true, status: true, meetingConcerns: true, escalationReason: true,
      informedIds: true, subject: true, issueDate: true, deadline: true,
      employee: { select: { id: true, reportingManagerId: true, fullName: true } },
    },
  })
  if (!notice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwn = notice.employeeId === access.employeeId
  const isMyTeamMember = notice.employee.reportingManagerId === access.employeeId
  const isHR = access.effectiveRole === 'HR_ADMIN'

  const data: Record<string, unknown> = {}
  let notification: { type: 'SHOW_CAUSE_ISSUED' | 'SHOW_CAUSE_RESOLVED' | 'SHOW_CAUSE_ESCALATED'; title: string; message: string } | null = null

  switch (action) {

    case 'LOG_MEETING_OUTCOME': {
      if (!isHR && !isMyTeamMember) {
        return NextResponse.json({ error: 'Only the manager or HR can log meeting outcome' }, { status: 403 })
      }
      if (!body.meetingNotes) {
        return NextResponse.json({ error: 'meetingNotes required' }, { status: 400 })
      }
      data.meetingHeldAt = new Date()
      data.meetingNotes = body.meetingNotes
      data.status = 'MEETING_HELD'
      notification = {
        type: 'SHOW_CAUSE_ISSUED',
        title: '📝 Meeting outcome logged',
        message: `Your manager has logged the outcome of your performance discussion.`,
      }
      break
    }

    case 'ESCALATE_TO_HR': {
      if (!isMyTeamMember && !isHR) {
        return NextResponse.json({ error: 'Only the manager or HR can escalate' }, { status: 403 })
      }
      if (!body.escalationReason) {
        return NextResponse.json({ error: 'escalationReason required' }, { status: 400 })
      }
      data.escalationRequestedAt = new Date()
      data.escalationReason = body.escalationReason
      data.status = 'SHOW_CAUSE_REQUESTED'
      // Notify HR
      const hrEmpIds = (
        await prisma.user.findMany({
          where: { role: 'HR_ADMIN' },
          select: { employee: { select: { id: true } } },
        })
      ).map((u) => u.employee?.id).filter((x): x is string => !!x)
      for (const hr of hrEmpIds) {
        await notify({
          employeeId: hr,
          type: 'SHOW_CAUSE_ESCALATED',
          title: '🚩 Manager escalating performance concern',
          message: `${access.userName ?? 'Manager'} is requesting a formal Show Cause for ${notice.employee.fullName}. Please review and issue.`,
          link: '/dashboard/performance',
        })
      }
      break
    }

    case 'ISSUE_FORMAL_NOTICE': {
      if (!isHR) {
        return NextResponse.json({ error: 'Only HR can issue the formal Show Cause' }, { status: 403 })
      }
      data.issueDate = new Date()
      data.deadline = body.deadline ? new Date(body.deadline) : null
      data.description = body.description ?? `${notice.meetingConcerns ?? ''}\n\n${notice.escalationReason ?? ''}`.trim()
      data.issuedBy = access.userName ?? 'HR'
      data.status = 'ISSUED'
      notification = {
        type: 'SHOW_CAUSE_ISSUED',
        title: '⚠️ Show Cause Notice issued',
        message: `A formal Show Cause Notice has been issued. Please respond${body.deadline ? ` by ${new Date(body.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}.`,
      }
      break
    }

    case 'RESPOND': {
      if (!isOwn) {
        return NextResponse.json({ error: 'Only the employee can respond' }, { status: 403 })
      }
      if (!body.employeeResponse) {
        return NextResponse.json({ error: 'response required' }, { status: 400 })
      }
      data.employeeResponse = body.employeeResponse
      data.responseAt = new Date()
      data.status = 'RESPONDED'
      break
    }

    case 'RESOLVE': {
      if (!isHR && !isMyTeamMember) {
        return NextResponse.json({ error: 'Only HR or Manager can resolve' }, { status: 403 })
      }
      if (body.actionPlan) data.actionPlan = body.actionPlan
      if (body.outcome) data.outcome = body.outcome
      if (body.followUpDate) data.followUpDate = new Date(body.followUpDate)
      data.status = 'RESOLVED'
      notification = {
        type: 'SHOW_CAUSE_RESOLVED',
        title: '✓ Concern resolved',
        message: 'Your performance concern has been marked as resolved. Thank you for engaging with the process.',
      }
      break
    }

    case 'ESCALATE_TO_PIP': {
      if (!isHR) {
        return NextResponse.json({ error: 'Only HR can escalate to PIP' }, { status: 403 })
      }
      data.status = 'ESCALATED_TO_PIP'
      if (body.actionPlan) data.actionPlan = body.actionPlan
      notification = {
        type: 'SHOW_CAUSE_ESCALATED',
        title: '🚨 Escalated to PIP',
        message: 'Your concern has been escalated to a Performance Improvement Plan (PIP). HR will be in touch with the plan details.',
      }
      break
    }

    case 'UPDATE_RECORD': {
      if (!isHR) {
        return NextResponse.json({ error: 'Only HR can edit the notice record' }, { status: 403 })
      }
      const text = (v: unknown, max: number) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
      if ('subject' in body) data.subject = text(body.subject, 200)
      if ('caseRef' in body) data.caseRef = text(body.caseRef, 120)
      if ('directives' in body) data.directives = text(body.directives, 4000)
      if ('description' in body && text(body.description, 20000)) data.description = text(body.description, 20000)
      if ('issuedBy' in body && text(body.issuedBy, 120)) data.issuedBy = text(body.issuedBy, 120)
      if ('issueDate' in body) {
        const d = parseInstant(body.issueDate)
        if (!d) return NextResponse.json({ error: 'Issue date is not a date' }, { status: 400 })
        data.issueDate = d
      }
      if ('deadline' in body) {
        data.deadline = typeof body.deadline === 'string' && body.deadline
          ? endOfPkDay(body.deadline) ?? parseInstant(body.deadline)
          : null
      }
      if ('deliveredAt' in body) data.deliveredAt = parseInstant(body.deliveredAt)
      if ('deliveredVia' in body) data.deliveredVia = DELIVERY_CHANNELS.includes(body.deliveredVia) ? body.deliveredVia : null
      if ('severity' in body && ['MINOR', 'MODERATE', 'SEVERE'].includes(body.severity)) data.severity = body.severity
      let added: string[] = []
      if (Array.isArray(body.informedIds)) {
        const next = [...new Set<string>(body.informedIds.filter((x: unknown): x is string => typeof x === 'string' && x !== notice.employeeId))]
        added = next.filter((x) => !notice.informedIds.includes(x))
        data.informedIds = next
        if (added.length) data.informedAt = new Date()
      }
      if (typeof body.letterBase64 === 'string' && body.letterBase64) {
        const bytes = Buffer.from(body.letterBase64.replace(/^data:[^,]+,/, ''), 'base64')
        if (bytes.length > 8 * 1024 * 1024) {
          return NextResponse.json({ error: 'The signed notice must be 8 MB or smaller' }, { status: 400 })
        }
        data.letterBlob = bytes
        data.letterMime = text(body.letterMime, 100) ?? 'application/pdf'
        data.letterName = text(body.letterName, 200) ?? 'Show Cause Notice.pdf'
      }
      if (added.length) {
        await notifyInformed({
          ids: added,
          employeeName: notice.employee.fullName,
          subject: (data.subject as string | null | undefined) ?? notice.subject,
          issueDate: (data.issueDate as Date | undefined) ?? notice.issueDate,
          deadline: (data.deadline as Date | null | undefined) ?? notice.deadline,
          leadId: notice.employee.reportingManagerId,
        })
      }
      break
    }

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Never send the letter's bytes back.
  const updated = await prisma.showCause.update({ where: { id }, data, select: { id: true, status: true } })

  if (notification && !isOwn) {
    await notify({
      employeeId: notice.employeeId,
      ...notification,
      link: '/dashboard/performance?tab=showcause',
    })
  }

  return NextResponse.json({ notice: updated })
}

/**
 * Permanently delete a Show Cause record. HR_ADMIN only — used to clean up
 * test entries or mistaken flags. Linked PIP records (if any) are NOT cascaded:
 * the PIP is independent once created and must be handled separately.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.effectiveRole !== 'HR_ADMIN' || access.actualRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Only HR can delete Show Cause records' }, { status: 403 })
  }

  const { id } = await params
  const notice = await prisma.showCause.findUnique({ where: { id }, select: { id: true } })
  if (!notice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.showCause.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
