import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { StatCard } from '@/components/stat-card'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, CalendarDays, Clock, Timer, ArrowUpRight, Cake } from 'lucide-react'
import { formatDate, getInitials } from '@/lib/utils'
import { ManagerAnalytics } from './manager-analytics'

async function getManagerData(managerEmployeeId: string) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const team = await prisma.employee.findMany({
    where: { reportingManagerId: managerEmployeeId, status: 'ACTIVE' },
    select: {
      id: true,
      fullName: true,
      designation: true,
      dob: true,
    },
  })
  const teamIds = team.map((t) => t.id)

  const [
    teamOnLeaveToday,
    pendingApprovals,
    pendingApprovalsList,
    teamOTLogs,
    todayAttendance,
    approvedLeavesToday,
    upcomingReviews,
  ] = await Promise.all([
    prisma.leaveRequest.count({
      where: {
        employeeId: { in: teamIds },
        status: 'APPROVED',
        fromDate: { lte: today },
        toDate: { gte: today },
      },
    }),
    prisma.leaveRequest.count({
      where: { employeeId: { in: teamIds }, status: 'PENDING' },
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId: { in: teamIds }, status: 'PENDING' },
      include: { employee: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.attendanceLog.findMany({
      where: {
        employeeId: { in: teamIds },
        date: { gte: monthStart, lt: monthEnd },
      },
      select: { overtimeHours: true },
    }),
    prisma.attendanceLog.findMany({
      where: {
        employeeId: { in: teamIds },
        date: { gte: today, lt: tomorrow },
      },
      select: {
        employeeId: true,
        clockIn: true,
        workType: true,
        status: true,
      },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: teamIds },
        status: 'APPROVED',
        fromDate: { lte: today },
        toDate: { gte: today },
      },
      select: { employeeId: true },
    }),
    prisma.performanceReview.findMany({
      where: { employeeId: { in: teamIds }, status: 'PENDING' },
      include: { employee: { select: { fullName: true } } },
      take: 5,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  // Probation decisions needed: settling check-ins due + UNDER_REVIEW awaiting manager
  const day30 = new Date(today); day30.setDate(day30.getDate() - 30)
  const probationItems = await prisma.probationRecord.findMany({
    where: {
      employeeId: { in: teamIds },
      OR: [
        { settlingCheckInAt: null, startDate: { lte: day30 } },
        { status: 'UNDER_REVIEW', managerSubmittedAt: null },
      ],
    },
    include: { employee: { select: { id: true, fullName: true } } },
    take: 10,
  })

  const totalOT = teamOTLogs.reduce((s, l) => s + (l.overtimeHours ?? 0), 0)
  const attendanceMap = new Map<string, (typeof todayAttendance)[number]>()
  for (const a of todayAttendance) attendanceMap.set(a.employeeId, a)
  const onLeaveSet = new Set(approvedLeavesToday.map((l) => l.employeeId))

  const currentMonth = now.getMonth()
  const birthdays = team
    .filter((t) => t.dob && new Date(t.dob).getMonth() === currentMonth)
    .map((t) => ({
      id: t.id,
      fullName: t.fullName,
      day: new Date(t.dob as Date).getDate(),
      dob: t.dob as Date,
    }))
    .sort((a, b) => a.day - b.day)

  return {
    team,
    teamSize: team.length,
    teamOnLeaveToday,
    pendingApprovals,
    pendingApprovalsList,
    totalOT,
    attendanceMap,
    onLeaveSet,
    upcomingReviews,
    birthdays,
    probationItems,
  }
}

function formatTime(d: Date | null | undefined) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export async function ManagerDashboard({
  managerEmployeeId,
  userName,
}: {
  managerEmployeeId: string
  userName: string
}) {
  const data = await getManagerData(managerEmployeeId)
  const firstName = userName.split(' ')[0]
  const today = new Date()

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-8">
        <h1 className="text-3xl font-bold text-gray-900">Hi, {firstName}!</h1>
        <p className="text-sm text-gray-600 mt-2">
          Manager view · {data.teamSize} direct{' '}
          {data.teamSize === 1 ? 'report' : 'reports'} ·{' '}
          {today.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="My Team Size"
          value={data.teamSize}
          icon={Users}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <StatCard
          label="Team On Leave Today"
          value={data.teamOnLeaveToday}
          icon={CalendarDays}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <StatCard
          label="Pending My Approvals"
          value={data.pendingApprovals}
          icon={Clock}
          iconColor="text-purple-600"
          iconBg="bg-purple-50"
        />
        <StatCard
          label="Team OT This Month"
          value={`${data.totalOT.toFixed(1)} hrs`}
          icon={Timer}
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
      </div>

      {/* Richer analytics — Team Pulse / Health / Performance / Workload / Compensation */}
      <ManagerAnalytics managerEmployeeId={managerEmployeeId} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My Team — Today */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>My Team — Today</CardTitle>
            </CardHeader>
            <CardContent>
              {data.team.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No direct reports.</p>
              ) : (
                <div className="space-y-3">
                  {data.team.map((m) => {
                    const att = data.attendanceMap.get(m.id)
                    const onLeave = data.onLeaveSet.has(m.id)
                    let pillBg = 'bg-gray-100 text-gray-700'
                    let dotColor = 'bg-gray-400'
                    let pillLabel = 'Not Yet In'
                    if (onLeave) {
                      pillBg = 'bg-blue-100 text-blue-700'
                      dotColor = 'bg-blue-500'
                      pillLabel = 'On Leave'
                    } else if (att?.clockIn) {
                      if (att.workType === 'WFH') {
                        pillBg = 'bg-blue-100 text-blue-700'
                        dotColor = 'bg-blue-500'
                        pillLabel = 'WFH'
                      } else {
                        pillBg = 'bg-green-100 text-green-700'
                        dotColor = 'bg-green-500'
                        pillLabel = 'In Office'
                      }
                    }
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0"
                      >
                        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold">
                          {getInitials(m.fullName)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {m.fullName}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{m.designation}</p>
                        </div>
                        {att?.clockIn && !onLeave && (
                          <span className="text-xs text-gray-500">
                            {formatTime(att.clockIn)}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${pillBg}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                          {pillLabel}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pending Approvals */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Pending Approvals</CardTitle>
            </CardHeader>
            <CardContent>
              {data.pendingApprovalsList.length === 0 ? (
                <p className="text-sm text-gray-400">No pending leave approvals.</p>
              ) : (
                <div className="space-y-3">
                  {data.pendingApprovalsList.map((r) => (
                    <Link
                      key={r.id}
                      href="/dashboard/leave"
                      className="block py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 rounded -mx-2 px-2"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {r.employee.fullName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {r.leaveType} · {formatDate(r.fromDate)} – {formatDate(r.toDate)} ·{' '}
                        {r.days}d
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Probation Decisions Needed */}
      {data.probationItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Probation Decisions Needed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.probationItems.map((p) => {
                const needsCheckIn = p.settlingCheckInAt == null
                const needsDecision = p.status === 'UNDER_REVIEW' && p.managerSubmittedAt == null
                const label = needsCheckIn ? 'Settling check-in due' : needsDecision ? 'Decision needed' : 'Review'
                return (
                  <Link
                    key={p.id}
                    href={`/dashboard/probation/${p.id}`}
                    className="flex items-center justify-between gap-3 py-2 px-3 -mx-2 rounded-lg hover:bg-amber-50 transition border border-amber-100 bg-amber-50/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.employee.fullName}</p>
                      <p className="text-xs text-amber-700">{label}</p>
                    </div>
                    <span className="text-xs font-semibold text-amber-700 flex-shrink-0">Submit →</span>
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Team Reviews */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Team Reviews</CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcomingReviews.length === 0 ? (
              <p className="text-sm text-gray-400">No pending reviews.</p>
            ) : (
              <div className="space-y-3">
                {data.upcomingReviews.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0"
                  >
                    <p className="text-sm font-medium text-gray-900">{r.employee.fullName}</p>
                    <Badge variant="warning">{r.reviewType}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Birthdays */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cake className="w-4 h-4 text-pink-500" />
              <CardTitle>Team Birthdays This Month</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {data.birthdays.length === 0 ? (
              <p className="text-sm text-gray-400">No birthdays this month.</p>
            ) : (
              <div className="space-y-3">
                {data.birthdays.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0"
                  >
                    <p className="text-sm font-medium text-gray-900">{b.fullName}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(b.dob).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/dashboard/leave"
          className="relative rounded-xl bg-purple-50 hover:bg-purple-100 transition-colors p-4 border border-purple-100"
        >
          <Clock className="w-5 h-5 text-purple-600" />
          <p className="mt-3 text-sm font-semibold text-purple-900">Approve Leaves</p>
          <ArrowUpRight className="w-4 h-4 text-purple-600 absolute top-3 right-3" />
        </Link>
        <Link
          href="/dashboard/performance"
          className="relative rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors p-4 border border-blue-100"
        >
          <Users className="w-5 h-5 text-blue-600" />
          <p className="mt-3 text-sm font-semibold text-blue-900">Team Performance</p>
          <ArrowUpRight className="w-4 h-4 text-blue-600 absolute top-3 right-3" />
        </Link>
        <Link
          href="/dashboard/attendance"
          className="relative rounded-xl bg-green-50 hover:bg-green-100 transition-colors p-4 border border-green-100"
        >
          <CalendarDays className="w-5 h-5 text-green-600" />
          <p className="mt-3 text-sm font-semibold text-green-900">Team Schedule</p>
          <ArrowUpRight className="w-4 h-4 text-green-600 absolute top-3 right-3" />
        </Link>
      </div>
    </div>
  )
}
