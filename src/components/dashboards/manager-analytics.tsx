import { prisma } from '@/lib/prisma'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus, Clock, Calendar, Award, CheckSquare } from 'lucide-react'

async function getAnalytics(managerEmployeeId: string) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day7 = new Date(today); day7.setDate(day7.getDate() - 6)
  const day30 = new Date(today); day30.setDate(day30.getDate() - 29)
  const day60 = new Date(today); day60.setDate(day60.getDate() - 59)
  const weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - today.getDay())
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
  const quarterStart = new Date(now.getFullYear(), quarterStartMonth, 1)

  const team = await prisma.employee.findMany({
    where: { reportingManagerId: managerEmployeeId, status: 'ACTIVE' },
    select: { id: true, fullName: true, designation: true },
  })
  const teamIds = team.map((t) => t.id)
  if (teamIds.length === 0) {
    return null
  }

  const [
    attendance7d,
    attendance30d,
    attendancePrev30d,
    activeProbations,
    pendingSelfAppraisals,
    recentReviews,
    taskAssignments,
    promotionRequests,
    compensationChanges,
  ] = await Promise.all([
    prisma.attendanceLog.findMany({
      where: { employeeId: { in: teamIds }, date: { gte: day7, lte: today } },
      select: { employeeId: true, date: true, status: true, hoursWorked: true, lateMinutes: true, clockIn: true },
    }),
    prisma.attendanceLog.findMany({
      where: { employeeId: { in: teamIds }, date: { gte: day30, lte: today } },
      select: { status: true, hoursWorked: true, lateMinutes: true },
    }),
    prisma.attendanceLog.findMany({
      where: { employeeId: { in: teamIds }, date: { gte: day60, lt: day30 } },
      select: { status: true },
    }),
    prisma.probationRecord.findMany({
      where: { employeeId: { in: teamIds }, status: { in: ['ACTIVE', 'UNDER_REVIEW'] } },
      include: { employee: { select: { fullName: true } } },
    }),
    prisma.performanceReview.findMany({
      where: { employeeId: { in: teamIds }, status: 'PENDING' },
      include: { employee: { select: { fullName: true } } },
      take: 10,
    }),
    prisma.performanceReview.findMany({
      where: {
        employeeId: { in: teamIds },
        overallRating: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { overallRating: true },
    }),
    prisma.taskAssignment.findMany({
      where: { employeeId: { in: teamIds } },
      select: {
        id: true,
        employeeId: true,
        status: true,
        completedAt: true,
        assignedAt: true,
      },
    }),
    prisma.promotionRequest.count({
      where: {
        employeeId: { in: teamIds },
        status: { in: ['PENDING_HR', 'PENDING_CEO', 'INITIATED'] },
      },
    }).catch(() => 0),
    prisma.compensationHistory.findMany({
      where: { employeeId: { in: teamIds }, effectiveDate: { gte: yearStart } },
      orderBy: { effectiveDate: 'desc' },
      select: { employeeId: true, effectiveDate: true, type: true },
    }),
  ])

  // ── Section A: 7-day pulse
  const pulse: { date: Date; presentRate: number; presentCount: number; total: number }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(day7); d.setDate(d.getDate() + i)
    const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const dEnd = new Date(dStart); dEnd.setDate(dEnd.getDate() + 1)
    const dayLogs = attendance7d.filter(
      (l) => new Date(l.date) >= dStart && new Date(l.date) < dEnd,
    )
    const present = dayLogs.filter((l) =>
      l.status === 'PRESENT' || l.status === 'LATE' || l.status === 'HALF_DAY',
    ).length
    pulse.push({
      date: dStart,
      presentRate: teamIds.length ? present / teamIds.length : 0,
      presentCount: present,
      total: teamIds.length,
    })
  }

  // ── Section B: Team Health (30-day metrics)
  const workedDays30 = attendance30d.filter(
    (l) => l.status === 'PRESENT' || l.status === 'LATE' || l.status === 'HALF_DAY',
  )
  const onTimeDays = workedDays30.filter(
    (l) => (l.lateMinutes ?? 0) <= 0,
  ).length
  const punctualityPct = workedDays30.length
    ? Math.round((onTimeDays / workedDays30.length) * 100)
    : 0

  const hoursLogged = workedDays30
    .map((l) => l.hoursWorked ?? 0)
    .filter((h) => h > 0)
  const avgHoursPerDay = hoursLogged.length
    ? hoursLogged.reduce((s, h) => s + h, 0) / hoursLogged.length
    : 0

  const present30 = workedDays30.length
  const possible30 = attendance30d.length || 1
  const attendance30Rate = present30 / possible30
  const presentPrev = attendancePrev30d.filter(
    (l) => l.status === 'PRESENT' || l.status === 'LATE' || l.status === 'HALF_DAY',
  ).length
  const attendancePrevRate = attendancePrev30d.length ? presentPrev / attendancePrev30d.length : 0
  const trendDelta = attendance30Rate - attendancePrevRate
  const trend: 'up' | 'down' | 'flat' =
    trendDelta > 0.02 ? 'up' : trendDelta < -0.02 ? 'down' : 'flat'

  // ── Section D: Workload
  const tasksByEmployee = new Map<string, { open: number; completed: number; overdue: number; completionTimes: number[] }>()
  for (const e of team) {
    tasksByEmployee.set(e.id, { open: 0, completed: 0, overdue: 0, completionTimes: [] })
  }
  let tasksCompletedThisWeek = 0
  let totalOverdue = 0
  for (const t of taskAssignments) {
    const bucket = tasksByEmployee.get(t.employeeId)
    if (!bucket) continue
    const done = t.status === 'COMPLETED' || t.status === 'DONE' || !!t.completedAt
    if (done) {
      bucket.completed += 1
      if (t.completedAt && new Date(t.completedAt) >= weekStart) {
        tasksCompletedThisWeek += 1
      }
      if (t.completedAt && t.assignedAt) {
        const days = (new Date(t.completedAt).getTime() - new Date(t.assignedAt).getTime()) / 86400000
        if (days >= 0) bucket.completionTimes.push(days)
      }
    } else {
      bucket.open += 1
      if (t.status === 'OVERDUE') {
        bucket.overdue += 1
        totalOverdue += 1
      }
    }
  }
  const allCompletionTimes = Array.from(tasksByEmployee.values()).flatMap((b) => b.completionTimes)
  const avgCompletionDays = allCompletionTimes.length
    ? allCompletionTimes.reduce((s, d) => s + d, 0) / allCompletionTimes.length
    : 0

  // ── Section C: Performance metrics
  const avgRating = recentReviews.length
    ? recentReviews.reduce((s, r) => s + (r.overallRating ?? 0), 0) / recentReviews.length
    : 0

  // ── Section E: Compensation (counts only — no salary numbers)
  const promotionsThisQuarter = compensationChanges.filter(
    (c) => c.type === 'PROMOTION' && new Date(c.effectiveDate) >= quarterStart,
  ).length
  const lastIncrementByEmployee = new Map<string, Date>()
  for (const c of compensationChanges) {
    if (c.type === 'INCREMENT' || c.type === 'PROMOTION') {
      const existing = lastIncrementByEmployee.get(c.employeeId)
      const d = new Date(c.effectiveDate)
      if (!existing || d > existing) lastIncrementByEmployee.set(c.employeeId, d)
    }
  }

  return {
    team,
    pulse,
    health: {
      punctualityPct,
      avgHoursPerDay,
      attendanceRate: attendance30Rate,
      trend,
      trendDelta,
    },
    performance: {
      activeProbations,
      pendingSelfAppraisals,
      avgRating,
    },
    workload: {
      tasksByEmployee,
      tasksCompletedThisWeek,
      totalOverdue,
      avgCompletionDays,
    },
    compensation: {
      promotionsThisQuarter,
      pendingPromotions: promotionRequests,
      lastIncrementByEmployee,
    },
  }
}

function dayShort(d: Date) {
  return d.toLocaleDateString('en-GB', { weekday: 'short' })
}

function dayPulseClass(rate: number) {
  if (rate >= 0.9) return 'bg-slate-500'
  if (rate >= 0.7) return 'bg-slate-300'
  return 'bg-slate-500'
}

export async function ManagerAnalytics({ managerEmployeeId }: { managerEmployeeId: string }) {
  const data = await getAnalytics(managerEmployeeId)
  if (!data) return null

  return (
    <div className="space-y-6">
      {/* Section A: Team Pulse */}
      <Card>
        <CardHeader>
          <CardTitle>This Week — Team Pulse</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 h-32">
            {data.pulse.map((p, i) => {
              const heightPct = Math.max(8, Math.round(p.presentRate * 100))
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="text-[10px] text-gray-500 font-medium">
                    {Math.round(p.presentRate * 100)}%
                  </div>
                  <div className="w-full bg-gray-100 rounded-md overflow-hidden flex flex-col-reverse" style={{ height: 70 }}>
                    <div
                      className={`${dayPulseClass(p.presentRate)} transition-all`}
                      style={{ height: `${heightPct}%` }}
                      title={`${p.presentCount}/${p.total} present`}
                    />
                  </div>
                  <div className="text-[10px] text-gray-400">{dayShort(p.date)}</div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-4 mt-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500" /> ≥90%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> 70–90%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500" /> &lt;70%</span>
          </div>
        </CardContent>
      </Card>

      {/* Section B: Team Health */}
      <Card>
        <CardHeader>
          <CardTitle>Team Health · 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Metric
              icon={<Clock className="w-4 h-4 text-slate-700" />}
              label="Avg Punctuality"
              value={`${data.health.punctualityPct}%`}
              sub="clocked in on time"
            />
            <Metric
              icon={<Clock className="w-4 h-4 text-slate-700" />}
              label="Avg Hours / Day"
              value={data.health.avgHoursPerDay.toFixed(1)}
              sub="worked per day"
            />
            <Metric
              icon={
                data.health.trend === 'up' ? <TrendingUp className="w-4 h-4 text-slate-700" /> :
                data.health.trend === 'down' ? <TrendingDown className="w-4 h-4 text-slate-700" /> :
                <Minus className="w-4 h-4 text-gray-500" />
              }
              label="Attendance Trend"
              value={
                data.health.trend === 'up' ? 'Improving' :
                data.health.trend === 'down' ? 'Declining' : 'Stable'
              }
              sub={`${(data.health.trendDelta * 100 >= 0 ? '+' : '')}${(data.health.trendDelta * 100).toFixed(1)} pp vs prior 30d`}
            />
            <Metric
              icon={<Calendar className="w-4 h-4 text-slate-700" />}
              label="Attendance Rate"
              value={`${Math.round(data.health.attendanceRate * 100)}%`}
              sub="last 30 days"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section C: Performance & Probation */}
        <Card>
          <CardHeader>
            <CardTitle>Performance &amp; Probation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <span className="text-sm text-gray-600">Active probations</span>
                <span className="text-sm font-semibold text-gray-900">
                  {data.performance.activeProbations.length}
                </span>
              </div>
              {data.performance.activeProbations.slice(0, 3).map((p) => {
                const daysLeft = Math.ceil(
                  (new Date(p.endDate).getTime() - Date.now()) / 86400000,
                )
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-slate-50"
                  >
                    <span className="text-gray-700 truncate">{p.employee.fullName}</span>
                    <span className="text-slate-700 font-medium flex-shrink-0">
                      {daysLeft > 0 ? `${daysLeft}d left` : 'Overdue'}
                    </span>
                  </div>
                )
              })}
              <div className="flex items-center justify-between border-b border-gray-100 pb-2 pt-2">
                <span className="text-sm text-gray-600">Pending self-appraisals</span>
                <span className="text-sm font-semibold text-gray-900">
                  {data.performance.pendingSelfAppraisals.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-slate-500" /> Avg team rating
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {data.performance.avgRating > 0
                    ? `${data.performance.avgRating.toFixed(2)} / 5`
                    : '—'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section D: Workload */}
        <Card>
          <CardHeader>
            <CardTitle>Workload</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <MiniStat label="Done this week" value={data.workload.tasksCompletedThisWeek} tone="emerald" />
              <MiniStat label="Overdue" value={data.workload.totalOverdue} tone={data.workload.totalOverdue > 0 ? 'rose' : 'slate'} />
              <MiniStat
                label="Avg days/task"
                value={data.workload.avgCompletionDays > 0 ? data.workload.avgCompletionDays.toFixed(1) : '—'}
                tone="slate"
              />
            </div>
            <div className="space-y-2">
              {data.team.slice(0, 6).map((m) => {
                const b = data.workload.tasksByEmployee.get(m.id)
                const open = b?.open ?? 0
                const max = Math.max(
                  1,
                  ...Array.from(data.workload.tasksByEmployee.values()).map((v) => v.open),
                )
                const pct = (open / max) * 100
                return (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className="text-xs text-gray-700 w-28 truncate">{m.fullName}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-slate-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-8 text-right">{open}</span>
                  </div>
                )
              })}
              {data.team.length === 0 && (
                <p className="text-sm text-gray-400">No direct reports.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section E: Compensation overview */}
      <Card>
        <CardHeader>
          <CardTitle>Compensation Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <Metric
              icon={<CheckSquare className="w-4 h-4 text-slate-700" />}
              label="Promotions this quarter"
              value={data.compensation.promotionsThisQuarter}
              sub="Probation → permanent + promotions"
            />
            <Metric
              icon={<Clock className="w-4 h-4 text-slate-700" />}
              label="Pending promotion requests"
              value={data.compensation.pendingPromotions}
              sub="awaiting HR / CEO approval"
            />
            <Metric
              icon={<Award className="w-4 h-4 text-slate-700" />}
              label="Team members"
              value={data.team.length}
              sub="active reports"
            />
          </div>
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-500 mb-2">Last increment / promotion date</p>
            <div className="space-y-1">
              {data.team.map((m) => {
                const d = data.compensation.lastIncrementByEmployee.get(m.id)
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-gray-50 last:border-0"
                  >
                    <span className="text-gray-700 truncate">{m.fullName}</span>
                    <span className="text-gray-500">
                      {d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No record this year'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 uppercase tracking-wide font-medium">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  )
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone: 'emerald' | 'rose' | 'slate'
}) {
  const cls =
    tone === 'emerald' ? 'bg-slate-50 text-slate-700 border-slate-100' :
    tone === 'rose' ? 'bg-slate-50 text-slate-700 border-slate-100' :
    'bg-slate-50 text-slate-700 border-slate-100'
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wide font-medium opacity-70">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  )
}
