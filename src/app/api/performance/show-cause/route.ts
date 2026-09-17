import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import {
  NOTICE_SELECT, DELIVERY_CHANNELS, endOfPkDay, parseInstant, informedPeople, notifyInformed,
} from '@/lib/show-cause'

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      employee: { select: { id: true, fullName: true } },
      userRoles: { select: { role: true } },
    },
  })
  if (!user) return null
  const roles = user.userRoles.length > 0
    ? user.userRoles.map((r) => r.role)
    : [user.role]
  const previewRole = request.cookies.get('hr_preview_role')?.value
  const effectiveRole =
    previewRole && roles.includes(previewRole) ? previewRole : user.role
  return {
    actualRole: user.role,
    roles,
    effectiveRole,
    employeeId: user.employee?.id ?? null,
    userName: user.employee?.fullName ?? user.email,
  }
}

export async function GET(request: NextRequest) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Anyone kept informed of a notice can read it — a lead told about their
  // team member's notice, even when their own account is an employee's.
  const informed = access.employeeId ? [{ informedIds: { has: access.employeeId } }] : []
  let where: object = {}
  if (access.effectiveRole === 'EMPLOYEE') {
    where = { OR: [{ employeeId: access.employeeId ?? '__none__' }, ...informed] }
  } else if (access.effectiveRole === 'MANAGER' && access.employeeId) {
    where = {
      OR: [
        { employeeId: access.employeeId },
        { employee: { reportingManagerId: access.employeeId } },
        ...informed,
      ],
    }
  }

  const rows = await prisma.showCause.findMany({
    where,
    select: NOTICE_SELECT,
    orderBy: [{ issueDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
  })
  const people = await informedPeople(rows)
  const isOwnView = (r: (typeof rows)[number]) => r.employeeId === access.employeeId
  const notices = rows.map((r) => ({
    ...r,
    // The bytes stay out of the list; letterName says whether there is one.
    hasLetter: !!r.letterName,
    // The employee sees their notice; who else was told is for HR, leads and leadership.
    informed: isOwnView(r) && access.effectiveRole === 'EMPLOYEE'
      ? []
      : r.informedIds.map((id) => ({
          ...(people.get(id) ?? { id, fullName: 'Former employee', designation: '' }),
          asLead: id === r.employee.reportingManagerId,
        })),
  }))

  return NextResponse.json({ notices })
}

/**
 * Create a new performance-concern record.
 *
 * Two modes:
 *   MANAGER mode (default) â€” manager flags the pattern, records initial concerns,
 *     and schedules a meeting with the employee. status = MEETING_REQUESTED.
 *
 *   HR mode (if `issueImmediately: true`) â€” HR may skip the meeting stage
 *     and issue a formal Show Cause Notice directly. status = ISSUED.
 */
export async function POST(request: NextRequest) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.roles.includes('HR_ADMIN') && !access.roles.includes('MANAGER')) {
    return NextResponse.json({ error: 'Only HR or Manager can flag performance concerns' }, { status: 403 })
  }
  if (access.effectiveRole !== 'HR_ADMIN' && access.effectiveRole !== 'MANAGER') {
    return NextResponse.json({ error: 'Switch back to HR or Manager view to perform this action' }, { status: 403 })
  }

  const body = await request.json()
  const {
    employeeId, issueType,
    meetingConcerns, meetingScheduledFor,    // manager-flag inputs
    description, deadline,                    // HR-direct-issue inputs
    issueImmediately = false,
  } = body

  if (!employeeId || !issueType) {
    return NextResponse.json({ error: 'employeeId and issueType required' }, { status: 400 })
  }

  // Manager can only act on direct reports
  if (access.effectiveRole === 'MANAGER') {
    const target = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { reportingManagerId: true },
    })
    if (!target || target.reportingManagerId !== access.employeeId) {
      return NextResponse.json({ error: 'Can only flag concerns for your direct reports' }, { status: 403 })
    }
  }

  // Occurrence number across all stages
  const prior = await prisma.showCause.count({ where: { employeeId } })

  // HR records a notice already issued — the notice as it went out, dated as
  // it went out. Issuing it today and recording it tomorrow must not move its
  // dates to tomorrow.
  if (issueImmediately && access.effectiveRole === 'HR_ADMIN') {
    if (!description) {
      return NextResponse.json({ error: 'description required when issuing immediately' }, { status: 400 })
    }
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId }, select: { fullName: true, reportingManagerId: true },
    })
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    const issueDate = parseInstant(body.issueDate) ?? new Date()
    const due = typeof deadline === 'string' ? endOfPkDay(deadline) ?? parseInstant(deadline) : null
    const deliveredAt = parseInstant(body.deliveredAt)
    const deliveredVia = DELIVERY_CHANNELS.includes(body.deliveredVia) ? body.deliveredVia as string : null
    const informedIds = [...new Set<string>(
      (Array.isArray(body.informedIds) ? body.informedIds : []).filter((x: unknown): x is string => typeof x === 'string' && x !== employeeId),
    )]
    const letter = typeof body.letterBase64 === 'string' && body.letterBase64
      ? Buffer.from(body.letterBase64.replace(/^data:[^,]+,/, ''), 'base64')
      : null
    if (letter && letter.length > 8 * 1024 * 1024) {
      return NextResponse.json({ error: 'The signed notice must be 8 MB or smaller' }, { status: 400 })
    }
    const text = (v: unknown, max: number) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

    const notice = await prisma.showCause.create({
      data: {
        employeeId, issueType,
        severity: ['MINOR', 'MODERATE', 'SEVERE'].includes(body.severity) ? body.severity : 'MODERATE',
        description,
        issueDate,
        deadline: due,
        issuedBy: text(body.issuedBy, 120) ?? access.userName ?? 'HR',
        occurrenceNo: prior + 1,
        status: 'ISSUED',
        subject: text(body.subject, 200),
        caseRef: text(body.caseRef, 120),
        deliveredAt,
        deliveredVia,
        directives: text(body.directives, 4000),
        informedIds,
        informedAt: informedIds.length ? new Date() : null,
        ...(letter ? {
          letterBlob: letter,
          letterMime: text(body.letterMime, 100) ?? 'application/pdf',
          letterName: text(body.letterName, 200) ?? 'Show Cause Notice.pdf',
        } : {}),
      },
      select: { id: true },
    })
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' })
    await notify({
      employeeId,
      type: 'SHOW_CAUSE_ISSUED',
      title: 'Show Cause Notice',
      message: `A Show Cause Notice${body.subject ? ` (${String(body.subject).slice(0, 120)})` : ''} was issued to you on ${fmt(issueDate)}. Please respond${due ? ` by ${fmt(due)}` : ''}.`,
      link: '/dashboard/performance?tab=showcause',
    })
    await notifyInformed({
      ids: informedIds, employeeName: employee.fullName, subject: text(body.subject, 200),
      issueDate, deadline: due, leadId: employee.reportingManagerId,
    })
    return NextResponse.json({ notice }, { status: 201 })
  }

  // Default: manager flags + requests meeting (MEETING_REQUESTED)
  if (!meetingConcerns) {
    return NextResponse.json({ error: 'meetingConcerns required to flag a performance concern' }, { status: 400 })
  }

  const record = await prisma.showCause.create({
    data: {
      employeeId, issueType,
      requestedById: access.employeeId,
      requestedByName: access.userName ?? null,
      meetingRequestedAt: new Date(),
      meetingScheduledFor: meetingScheduledFor ? new Date(meetingScheduledFor) : null,
      meetingConcerns,
      occurrenceNo: prior + 1,
      status: 'MEETING_REQUESTED',
    },
  })

  // Notify the employee + HR
  await notify({
    employeeId,
    type: 'SHOW_CAUSE_ISSUED',
    title: 'ðŸ“‹ Performance discussion requested',
    message: `${access.userName ?? 'Your manager'} would like to discuss ${issueType.replace('_', ' ').toLowerCase()} concerns with you${meetingScheduledFor ? ` on ${new Date(meetingScheduledFor).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}.`,
    link: '/dashboard/performance',
  })
  // Also notify HR for awareness
  const hrEmpIds = (
    await prisma.user.findMany({
      where: { role: 'HR_ADMIN' },
      select: { employee: { select: { id: true } } },
    })
  ).map((u) => u.employee?.id).filter((x): x is string => !!x)
  for (const hr of hrEmpIds) {
    await notify({
      employeeId: hr,
      type: 'SHOW_CAUSE_ISSUED',
      title: 'ðŸ‘€ Performance concern flagged',
      message: `${access.userName ?? 'A manager'} flagged a ${issueType.replace('_', ' ').toLowerCase()} concern. Awaiting meeting outcome.`,
      link: '/dashboard/performance',
    })
  }

  return NextResponse.json({ notice: record }, { status: 201 })
}
