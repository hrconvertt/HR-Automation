/**
 * Executive Leave view — aggregate-only, read-only.
 * No individual requests. Just strategic KPIs.
 */

import { prisma } from '@/lib/prisma'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, TrendingUp, Users, AlertTriangle } from 'lucide-react'
import { LEAVE_TYPE_LABELS } from '@/lib/leave-types'

export default async function ExecutiveLeaveView() {
  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const [activeEmployees, ytdReqs, monthReqs, onLeaveNow, currentlyPending] = await Promise.all([
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, department: { select: { name: true } } },
    }),
    prisma.leaveRequest.findMany({
      where: { createdAt: { gte: yearStart, lte: yearEnd } },
      include: { employee: { select: { department: { select: { name: true } } } } },
    }),
    prisma.leaveRequest.findMany({
      where: { fromDate: { lte: monthEnd }, toDate: { gte: monthStart } },
    }),
    prisma.leaveRequest.count({
      where: { status: 'APPROVED', fromDate: { lte: today }, toDate: { gte: today } },
    }),
    // Currently awaiting a decision (either manager stage or HR stage) — regardless of when filed
    prisma.leaveRequest.count({ where: { status: { in: ['PENDING', 'PENDING_HR'] } } }),
  ])

  // YTD KPIs
  const ytdApproved = ytdReqs.filter((r) => r.status === 'APPROVED').length
  const ytdRejected = ytdReqs.filter((r) => r.status === 'REJECTED').length
  const ytdDays = ytdReqs
    .filter((r) => r.status === 'APPROVED')
    .reduce((s, r) => s + (r.days ?? 0), 0)
  const avgPerEmployee = activeEmployees.length > 0 ? (ytdDays / activeEmployees.length) : 0
  const totalDecided = ytdApproved + ytdRejected
  const approvalRate = totalDecided > 0
    ? Math.round((ytdApproved / totalDecided) * 100)
    : null // null = no decisions made yet

  // Department breakdown
  const deptDays: Record<string, { headcount: number; days: number }> = {}
  for (const e of activeEmployees) {
    const d = e.department?.name ?? '—'
    if (!deptDays[d]) deptDays[d] = { headcount: 0, days: 0 }
    deptDays[d].headcount++
  }
  for (const r of ytdReqs) {
    if (r.status !== 'APPROVED') continue
    const d = r.employee.department?.name ?? '—'
    if (!deptDays[d]) deptDays[d] = { headcount: 0, days: 0 }
    deptDays[d].days += r.days ?? 0
  }
  const deptStats = Object.entries(deptDays)
    .map(([name, { headcount, days }]) => ({
      name,
      headcount,
      days,
      avg: headcount > 0 ? days / headcount : 0,
    }))
    .sort((a, b) => b.avg - a.avg)

  // Type breakdown
  const typeBreakdown: Record<string, number> = {}
  for (const r of ytdReqs) {
    if (r.status !== 'APPROVED') continue
    typeBreakdown[r.leaveType] = (typeBreakdown[r.leaveType] || 0) + (r.days ?? 0)
  }
  const typeEntries = Object.entries(typeBreakdown).sort((a, b) => b[1] - a[1])
  const typeMax = Math.max(1, ...typeEntries.map(([, n]) => n))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Leave — Executive View</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{' '}
          · YTD utilisation, read-only
        </p>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold mb-3">Today</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile
            label="On Leave Today"
            value={String(onLeaveNow)}
            sub={`${activeEmployees.length} active employees`}
            Icon={Users}
            tone="blue"
          />
          <KpiTile
            label="Awaiting Approval"
            value={String(currentlyPending)}
            sub="Right now, across the org"
            Icon={AlertTriangle}
            tone={currentlyPending > 5 ? 'amber' : 'green'}
          />
          <KpiTile
            label="Days Taken This Month"
            value={String(monthReqs.filter((r) => r.status === 'APPROVED').reduce((s, r) => s + (r.days ?? 0), 0))}
            sub={now.toLocaleDateString('en-GB', { month: 'long' })}
            Icon={Calendar}
            tone="purple"
          />
          <KpiTile
            label="Approval Rate"
            value={approvalRate === null ? '—' : `${approvalRate}%`}
            sub={
              approvalRate === null
                ? 'No decisions yet this year'
                : `${ytdApproved} approved · ${ytdRejected} rejected`
            }
            Icon={TrendingUp}
            tone={approvalRate === null ? 'blue' : approvalRate >= 85 ? 'green' : 'amber'}
          />
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold mb-3">Year to Date — {now.getFullYear()}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile label="Total Leave Days Taken" value={String(ytdDays)} sub="Approved only" Icon={Calendar} tone="blue" />
          <KpiTile label="Avg Days / Employee" value={avgPerEmployee.toFixed(1)} sub="Across active workforce" Icon={Users} tone="purple" />
          <KpiTile
            label="Total Requests"
            value={String(ytdReqs.length)}
            sub={`${ytdApproved} approved · ${ytdRejected} rejected`}
            Icon={TrendingUp}
            tone="green"
          />
          <KpiTile
            label="Rejected"
            value={String(ytdRejected)}
            sub={
              totalDecided === 0
                ? 'No decisions yet'
                : `${Math.round((ytdRejected / totalDecided) * 100)}% of decided`
            }
            Icon={AlertTriangle}
            tone={ytdRejected === 0 ? 'green' : 'amber'}
          />
        </div>
      </div>

      {/* Leave by type */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Leave Days by Type — YTD</p>
              <p className="text-xs text-slate-500 mt-0.5">Approved days only</p>
            </div>
          </div>
          {typeEntries.length === 0 ? (
            <p className="text-center py-6 text-slate-400 text-sm">No approved leave yet this year.</p>
          ) : (
            <ul className="space-y-2.5">
              {typeEntries.map(([type, n]) => (
                <li key={type} className="flex items-center gap-3">
                  <span className="w-28 text-sm text-slate-700">{LEAVE_TYPE_LABELS[type] ?? type}</span>
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-500"
                      style={{ width: `${(n / typeMax) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-sm font-semibold tabular-nums text-slate-900">{n} d</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Department breakdown */}
      <Card>
        <CardContent className="p-0">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Leave Utilisation by Department — YTD</p>
            <span className="text-[11px] text-slate-400">Sorted by avg days / employee</span>
          </div>
          {deptStats.length === 0 ? (
            <p className="text-center py-8 text-slate-400 text-sm">No data this year.</p>
          ) : (
            <ul>
              {deptStats.map((d) => {
                const max = Math.max(1, ...deptStats.map(x => x.avg))
                return (
                  <li key={d.name} className="flex items-center gap-4 px-5 py-3 border-b border-slate-50 last:border-b-0">
                    <div className="w-40 shrink-0">
                      <p className="text-sm font-medium text-slate-900">{d.name}</p>
                      <p className="text-[11px] text-slate-400">{d.headcount} active</p>
                    </div>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-500" style={{ width: `${(d.avg / max) * 100}%` }} />
                    </div>
                    <span className="w-20 text-right text-sm font-semibold tabular-nums text-slate-900">{d.avg.toFixed(1)} d/emp</span>
                    <span className="w-20 text-right text-xs text-slate-500 tabular-nums">{d.days} d total</span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-slate-400 text-center pt-2">
        Executive view shows aggregate data only. For individual requests, ask HR.
      </p>
    </div>
  )
}

const TONE_CLASSES: Record<'green' | 'amber' | 'red' | 'blue' | 'purple', string> = {
  green:  'text-slate-700 bg-slate-50',
  amber:  'text-slate-700 bg-slate-50',
  red:    'text-slate-700 bg-slate-50',
  blue:   'text-slate-700 bg-slate-50',
  purple: 'text-slate-700 bg-slate-50',
}

function KpiTile({ label, value, sub, Icon, tone }: {
  label: string; value: string; sub: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone: 'green' | 'amber' | 'red' | 'blue' | 'purple';
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
          <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
        </div>
        <div className={`p-2 rounded-lg shrink-0 ${TONE_CLASSES[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </CardContent>
    </Card>
  )
}
