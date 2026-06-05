import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
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

  let where: object = {}
  if (access.effectiveRole === 'EMPLOYEE') {
    where = { employeeId: access.employeeId }
  } else if (access.effectiveRole === 'MANAGER' && access.employeeId) {
    where = {
      OR: [
        { employeeId: access.employeeId },
        { employee: { reportingManagerId: access.employeeId } },
      ],
    }
  }

  const notices = await prisma.showCause.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true, employeeCode: true, fullName: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ notices })
}

/**
 * Create a new performance-concern record.
 *
 * Two modes:
 *   MANAGER mode (default) — manager flags the pattern, records initial concerns,
 *     and schedules a meeting with the employee. status = MEETING_REQUESTED.
 *
 *   HR mode (if `issueImmediately: true`) — HR may skip the meeting stage
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

  // HR direct-issue path — skip meeting, jump straight to ISSUED
  if (issueImmediately && access.effectiveRole === 'HR_ADMIN') {
    if (!description) {
      return NextResponse.json({ error: 'description required when issuing immediately' }, { status: 400 })
    }
    const notice = await prisma.showCause.create({
      data: {
        employeeId, issueType,
        description,
        issueDate: new Date(),
        deadline: deadline ? new Date(deadline) : null,
        issuedBy: access.userName ?? 'HR',
        occurrenceNo: prior + 1,
        status: 'ISSUED',
      },
    })
    await notify({
      employeeId,
      type: 'SHOW_CAUSE_ISSUED',
      title: '⚠️ Show Cause Notice',
      message: `You have been issued a ${issueType.replace('_', ' ')} notice. Please respond${deadline ? ` by ${new Date(deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}.`,
      link: '/dashboard/performance',
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
    title: '📋 Performance discussion requested',
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
      title: '👀 Performance concern flagged',
      message: `${access.userName ?? 'A manager'} flagged a ${issueType.replace('_', ' ').toLowerCase()} concern. Awaiting meeting outcome.`,
      link: '/dashboard/performance',
    })
  }

  return NextResponse.json({ notice: record }, { status: 201 })
}
