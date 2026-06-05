/**
 * Executive Attendance view — one page, decision-grade.
 *
 * Three questions an exec actually asks:
 *   1. Is the workforce showing up today?  → hero
 *   2. Is it getting better or worse?       → 14-day trend
 *   3. Where are the problems?              → attention list + dept health
 *
 * No duplicated metrics, no dead stat cards.
 */

import { prisma } from '@/lib/prisma'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, TrendingDown, TrendingUp, Minus } from 'lucide-react'

export default async function ExecutiveTimeView() {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0)
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
  const trendStart = new Date(); trendStart.setDate(trendStart.getDate() - 20); trendStart.setHours(0,0,0,0)

  // ─── Data ─────────────────────────────────────────────────────────────────
  const [activeEmployees, todayLogs, monthLogs, trendLogs] = await Promise.all([
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, department: { select: { name: true } } },
    }),
    prisma.attendanceLog.findMany({
      where: { date: { gte: todayStart, lte: todayEnd } },
      include: { employee: { select: { fullName: true, department: { select: { name: true } } } } },
    }),
    prisma.attendanceLog.findMany({
      where: { date: { gte: monthStart, lte: monthEnd } },
      include: { employee: { select: { fullName: true, department: { select: { name: true } } } } },
    }),
    prisma.attendanceLog.findMany({
      where: { date: { gte: trendStart, lte: todayEnd } },
      select: { date: true, status: true, clockIn: true },
    }),
  ])

  const total = activeEmployees.length

  // ─── Today breakdown ──────────────────────────────────────────────────────
  const tdOnsite = todayLogs.filter((l) => l.workType === 'ONSITE' && l.clockIn).length
  const tdWfh    = todayLogs.filter((l) => l.workType === 'WFH' && l.clockIn).length
  const tdLeave  = todayLogs.filter((l) => l.status === 'LEAVE').length
  const tdAbsent = todayLogs.filter((l) => l.status === 'ABSENT').length
  const tdPresent = tdOnsite + tdWfh
  const tdNotIn = Math.max(0, total - tdPresent - tdLeave - tdAbsent)
  const presencePct = total > 0 ? Math.round((tdPresent / total) * 100) : 0

  // ─── 14-day trend (working days only) ─────────────────────────────────────
  const dayBuckets: { date: Date; present: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    const end = new Date(d); end.setHours(23,59,59,999)
    const present = trendLogs.filter((l) => {
      const ld = new Date(l.date)
      return ld >= d && ld <= end && (l.status === 'PRESENT' || l.status === 'LATE') && l.clockIn
    }).length
    dayBuckets.push({ date: d, present })
  }
  const trendData = dayBuckets.map((b) => ({
    date: b.date,
    pct: total > 0 ? Math.round((b.present / total) * 100) : 0,
  }))
  // Trend direction — compare last 3 working days avg vs prior 3
  const lastThree = trendData.slice(-3)
  const priorThree = trendData.slice(-6, -3)
  const avgLast = lastThree.length ? lastThree.reduce((s, d) => s + d.pct, 0) / lastThree.length : 0
  const avgPrior = priorThree.length ? priorThree.reduce((s, d) => s + d.pct, 0) / priorThree.length : 0
  const trendDelta = Math.round(avgLast - avgPrior)

  // ─── Month metrics (compact) ─────────────────────────────────────────────
  const workingDays = countWeekdays(monthStart, monthEnd, todayEnd)
  const expectedPunches = total * workingDays
  const monthPresentCount = monthLogs.filter((l) => (l.status === 'PRESENT' || l.status === 'LATE') && l.clockIn).length
  const monthPct = expectedPunches > 0 ? Math.round((monthPresentCount / expectedPunches) * 100) : 0
  const totalOT = monthLogs.reduce((s, l) => s + (l.overtimeHours ?? 0), 0)
  const approvedOT = monthLogs.filter((l) => l.overtimeApproved).reduce((s, l) => s + (l.overtimeHours ?? 0), 0)
  const pendingOT = totalOT - approvedOT
  const monthAbsentDays = monthLogs.filter((l) => l.status === 'ABSENT').length

  // ─── Attention: top absentees this month ──────────────────────────────────
  const absByEmp = new Map<string, { name: string; dept: string; count: number }>()
  for (const l of monthLogs) {
    if (l.status !== 'ABSENT') continue
    const key = l.employee.fullName
    const cur = absByEmp.get(key) ?? { name: l.employee.fullName, dept: l.employee.department?.name ?? '—', count: 0 }
    cur.count++
    absByEmp.set(key, cur)
  }
  const topAbsentees = [...absByEmp.values()].sort((a, b) => b.count - a.count).slice(0, 3)

  // ─── Department health ──────────────────────────────────────────────────
  const deptStats = (() => {
    const counts = new Map<string, { headcount: number; present: number; ot: number }>()
    for (const e of activeEmployees) {
      const d = e.department?.name ?? '—'
      const cur = counts.get(d) ?? { headcount: 0, present: 0, ot: 0 }
      cur.headcount++
      counts.set(d, cur)
    }
    for (const l of monthLogs) {
      const d = l.employee.department?.name ?? '—'
      const cur = counts.get(d)
      if (!cur) continue
      if ((l.status === 'PRESENT' || l.status === 'LATE') && l.clockIn) cur.present++
      cur.ot += l.overtimeHours ?? 0
    }
    return [...counts.entries()]
      .map(([name, c]) => ({
        name,
        headcount: c.headcount,
        pct: c.headcount * workingDays > 0 ? Math.round((c.present / (c.headcount * workingDays)) * 100) : 0,
        ot: c.ot,
      }))
      .sort((a, b) => a.pct - b.pct) // worst first — actionable
  })()
  const weakestDept = deptStats[0]
  const monthName = monthStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // ─── Verdict line — one sentence summary ─────────────────────────────────
  const verdict = (() => {
    if (presencePct >= 90) return { tone: 'good',  text: `Strong showing — ${presencePct}% of the company is at work.` }
    if (presencePct >= 75) return { tone: 'okay',  text: `${presencePct}% present — within normal range but worth watching.` }
    return                       { tone: 'bad',   text: `Only ${presencePct}% present — investigate why.` }
  })()

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Attendance — Executive View</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ─── Hero — Today's workforce ───────────────────────────────── */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-baseline justify-between flex-wrap gap-3 mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Workforce Today</p>
              <p className={
                'text-sm mt-1 font-medium ' +
                (verdict.tone === 'good' ? 'text-emerald-700' :
                 verdict.tone === 'okay' ? 'text-amber-700' : 'text-rose-700')
              }>
                {verdict.text}
              </p>
            </div>
            <div className="text-right">
              <p className="text-5xl font-bold text-slate-900 tabular-nums leading-none">
                {presencePct}<span className="text-2xl text-slate-400 font-normal">%</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">{tdPresent} of {total} present</p>
            </div>
          </div>

          {/* Composition bar */}
          <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 mb-2">
            {tdOnsite > 0 && <div className="bg-blue-500"    style={{ width: `${(tdOnsite / total) * 100}%` }} title={`Onsite ${tdOnsite}`} />}
            {tdWfh > 0    && <div className="bg-purple-500"  style={{ width: `${(tdWfh / total) * 100}%` }}    title={`WFH ${tdWfh}`} />}
            {tdLeave > 0  && <div className="bg-amber-400"   style={{ width: `${(tdLeave / total) * 100}%` }}  title={`Leave ${tdLeave}`} />}
            {tdAbsent > 0 && <div className="bg-rose-500"    style={{ width: `${(tdAbsent / total) * 100}%` }} title={`Absent ${tdAbsent}`} />}
          </div>
          <div className="flex items-center flex-wrap gap-x-5 gap-y-1 text-xs">
            <LegendChip color="bg-blue-500"   label="Onsite" value={tdOnsite} />
            <LegendChip color="bg-purple-500" label="WFH"    value={tdWfh} />
            <LegendChip color="bg-amber-400"  label="On leave" value={tdLeave} />
            <LegendChip color="bg-rose-500"   label="Absent" value={tdAbsent} />
            <LegendChip color="bg-slate-300"  label="Not in yet" value={tdNotIn} muted />
          </div>
        </CardContent>
      </Card>

      {/* ─── 14-day trend ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Presence — Last 14 Working Days</p>
              <p className="text-xs text-slate-500 mt-0.5">Daily % of headcount present</p>
            </div>
            <div className="flex items-center gap-1.5">
              {trendDelta > 1 && <><TrendingUp className="w-4 h-4 text-emerald-600" /><span className="text-sm font-semibold text-emerald-700">+{trendDelta}%</span></>}
              {trendDelta < -1 && <><TrendingDown className="w-4 h-4 text-rose-600" /><span className="text-sm font-semibold text-rose-700">{trendDelta}%</span></>}
              {Math.abs(trendDelta) <= 1 && <><Minus className="w-4 h-4 text-slate-400" /><span className="text-sm font-semibold text-slate-500">flat</span></>}
              <span className="text-[11px] text-slate-400 ml-1">3-day vs prior</span>
            </div>
          </div>
          <div className="flex items-end gap-1 h-24">
            {trendData.map((d, i) => {
              const isToday = d.date.toDateString() === now.toDateString()
              const h = Math.max(4, (d.pct / 100) * 96)
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
                  <div className={
                    'w-full rounded-t transition-colors ' +
                    (d.pct >= 90 ? 'bg-emerald-400 group-hover:bg-emerald-500' :
                     d.pct >= 75 ? 'bg-amber-400 group-hover:bg-amber-500' :
                                   'bg-rose-400 group-hover:bg-rose-500') +
                    (isToday ? ' ring-2 ring-slate-900' : '')
                  } style={{ height: `${h}px` }} />
                  <span className="absolute -top-5 text-[10px] font-semibold text-slate-700 opacity-0 group-hover:opacity-100 tabular-nums">{d.pct}%</span>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-slate-400">
            <span>{trendData[0]?.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            <span>today</span>
          </div>
        </CardContent>
      </Card>

      {/* ─── Needs Attention ──────────────────────────────────────── */}
      {(topAbsentees.length > 0 || (weakestDept && weakestDept.pct < 80) || pendingOT > 0) && (
        <Card>
          <CardContent className="p-0">
            <div className="px-5 py-3 border-b border-slate-100 bg-amber-50/40 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-900 font-semibold">Needs Attention</p>
            </div>
            <div className="divide-y divide-slate-100">
              {topAbsentees.length > 0 && (
                <div className="px-5 py-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Most absences this month</p>
                  <ul className="space-y-1.5">
                    {topAbsentees.map((a) => (
                      <li key={a.name} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium text-slate-900">{a.name}</span>
                          <span className="text-slate-400 text-xs ml-2">{a.dept}</span>
                        </div>
                        <span className="font-semibold text-rose-700 tabular-nums">{a.count} day{a.count > 1 ? 's' : ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {weakestDept && weakestDept.pct < 80 && (
                <div className="px-5 py-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Weakest department</p>
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-slate-900">{weakestDept.name}</span>
                      <span className="text-slate-400 text-xs ml-2">{weakestDept.headcount} active</span>
                    </div>
                    <span className="font-semibold text-rose-700 tabular-nums">{weakestDept.pct}% presence</span>
                  </div>
                </div>
              )}
              {pendingOT > 0 && (
                <div className="px-5 py-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Overtime awaiting approval</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{pendingOT.toFixed(1)} hours pending sign-off by managers</span>
                    <span className="font-semibold text-amber-700 tabular-nums">{pendingOT.toFixed(1)}h</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Department health ───────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Department Health — {monthName}</p>
            <p className="text-xs text-slate-500 mt-0.5">Presence rate, worst first</p>
          </div>
          {deptStats.length === 0 ? (
            <p className="text-center py-8 text-slate-400 text-sm">No data this month.</p>
          ) : (
            <ul>
              {deptStats.map((d) => (
                <li key={d.name} className="flex items-center gap-4 px-5 py-3 border-b border-slate-50 last:border-b-0">
                  <div className="w-40 shrink-0">
                    <p className="text-sm font-medium text-slate-900">{d.name}</p>
                    <p className="text-[11px] text-slate-400">{d.headcount} active</p>
                  </div>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={
                        d.pct >= 90 ? 'h-full bg-emerald-500' :
                        d.pct >= 75 ? 'h-full bg-amber-400' :
                                      'h-full bg-rose-500'
                      }
                      style={{ width: `${Math.min(d.pct, 100)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm font-semibold tabular-nums text-slate-900">{d.pct}%</span>
                  <span className="w-16 text-right text-xs text-slate-500 tabular-nums">
                    {d.ot > 0 ? `${d.ot.toFixed(0)}h OT` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ─── Month footer summary — one line ──────────────────────── */}
      <p className="text-xs text-slate-500 text-center pt-1">
        Month to date: <strong className="text-slate-700 tabular-nums">{monthPct}%</strong> avg presence
        {' · '}<strong className="text-slate-700 tabular-nums">{monthAbsentDays}</strong> absent-days
        {' · '}<strong className="text-slate-700 tabular-nums">{approvedOT.toFixed(0)}h</strong> OT approved
        {totalOT > approvedOT && <> ({(totalOT - approvedOT).toFixed(0)}h pending)</>}
      </p>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Weekdays from start to min(end, today) — so MTD doesn't count future days. */
function countWeekdays(start: Date, end: Date, today: Date): number {
  const stop = end < today ? end : today
  let count = 0
  const d = new Date(start)
  while (d <= stop) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

function LegendChip({ color, label, value, muted }: {
  color: string; label: string; value: number; muted?: boolean;
}) {
  return (
    <span className={'flex items-center gap-1.5 ' + (muted ? 'text-slate-400' : 'text-slate-600')}>
      <span className={`w-2.5 h-2.5 rounded-sm ${color}`} />
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  )
}
