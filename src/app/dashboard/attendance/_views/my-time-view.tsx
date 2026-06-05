'use client'

/**
 * Workday "My Time" worklet.
 *
 *   ┌─────────────────────────────────────────┐
 *   │   🕐 You're clocked in                   │
 *   │   Started 9:42 AM · 3h 18m today        │
 *   │   [🔴 Check Out]   Onsite ▼             │
 *   └─────────────────────────────────────────┘
 *
 *   This Week (Mon–Sun bar)        Total: 25.7 / 40h
 *
 *   Recent Punches (collapsible)
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Clock, LogIn, LogOut, Home, Building2, Coffee, Calendar,
  TrendingUp, ShieldCheck, AlertCircle,
} from 'lucide-react'

type TodayLog = {
  clockIn: string | null
  clockOut: string | null
  status: string
  workType: string
  hoursWorked: number | null
}

type DayLog = {
  date: string
  clockIn: string | null
  clockOut: string | null
  hoursWorked: number | null
  status: string
  workType: string
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function fmtTime(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function fmtElapsed(ms: number): string {
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function startOfWeek(d: Date): Date {
  const day = d.getDay() // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day
  const wk = new Date(d)
  wk.setDate(d.getDate() + diff)
  wk.setHours(0, 0, 0, 0)
  return wk
}

export default function MyTimeView({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const [today, setToday] = useState<TodayLog | null>(null)
  const [week, setWeek] = useState<DayLog[]>([])
  const [history, setHistory] = useState<DayLog[]>([])
  const [loading, setLoading] = useState(true)
  const [workType, setWorkType] = useState<'ONSITE' | 'WFH'>('ONSITE')
  const [actionMsg, setActionMsg] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(new Date())

  const [todayPunches, setTodayPunches] = useState<{ type: string; timestamp: string; workType: string | null }[]>([])
  const [isCurrentlyIn, setIsCurrentlyIn] = useState(false)

  // ─── Fetchers ───────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true)
    const today = new Date()
    const [monthRes, todayRes] = await Promise.all([
      fetch(`/api/attendance?month=${today.getMonth() + 1}&year=${today.getFullYear()}&employeeId=${employeeId}`),
      fetch(`/api/attendance?today=true`),
    ])
    const monthData = await monthRes.json()
    const todayData = await todayRes.json()
    const myToday = (todayData.logs ?? []).find((r: { employeeId: string }) => r.employeeId === employeeId)
    setTodayPunches(myToday?.punches ?? [])
    setIsCurrentlyIn(!!myToday?.isCurrentlyIn)
    const logs: DayLog[] = (monthData.logs ?? []).map((l: { date: string; clockIn: string | null; clockOut: string | null; hoursWorked: number | null; status: string; workType: string }) => ({
      date: l.date,
      clockIn: l.clockIn,
      clockOut: l.clockOut,
      hoursWorked: l.hoursWorked,
      status: l.status,
      workType: l.workType,
    }))

    // Today
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    const todayLog = logs.find((l) => new Date(l.date).toDateString() === t.toDateString())
    setToday(todayLog ?? null)

    // This week (Mon–Sun)
    const weekStart = startOfWeek(new Date())
    const weekArr: DayLog[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      const match = logs.find((l) => new Date(l.date).toDateString() === d.toDateString())
      weekArr.push(match ?? {
        date: d.toISOString(),
        clockIn: null, clockOut: null, hoursWorked: null,
        status: d > new Date() ? 'UPCOMING' : 'ABSENT',
        workType: 'ONSITE',
      })
    }
    setWeek(weekArr)

    // History (last 14 days)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14)
    const hist = logs
      .filter((l) => new Date(l.date) >= cutoff && new Date(l.date) < t)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    setHistory(hist)
    setLoading(false)
  }, [employeeId])

  useEffect(() => { refresh() }, [refresh])

  // Live tick — every second when timer is running (Hubstaff-style stopwatch)
  useEffect(() => {
    if (!isCurrentlyIn) return
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [isCurrentlyIn])

  // ─── Actions ────────────────────────────────────────────────────────────────
  async function clock(action: 'CLOCK_IN' | 'CLOCK_OUT') {
    setBusy(true)
    setActionMsg(null)
    const { getClientContext } = await import('@/lib/client-fingerprint')
    const ctx = await getClientContext()
    const res = await fetch('/api/attendance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, workType, clientContext: ctx }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) {
      setActionMsg({ tone: 'err', text: data.error ?? 'Action failed' })
    } else if (data.decision === 'MANAGER_REVIEW') {
      setActionMsg({ tone: 'warn', text: `${data.message} (trust ${data.trustScore})` })
    } else {
      setActionMsg({ tone: 'ok', text: `${data.message}${typeof data.trustScore === 'number' ? ` · trust ${data.trustScore}` : ''}` })
    }
    setTimeout(() => setActionMsg(null), 6000)
    await refresh()
  }

  // ─── Derived ────────────────────────────────────────────────────────────────
  // Multi-punch aware state — declared first so other derived vars can use them
  const isClockedIn = isCurrentlyIn
  const hasNoClockInToday = todayPunches.length === 0
  const isDoneForDay = todayPunches.length > 0 && !isCurrentlyIn
  const sessionCount = todayPunches.filter((p) => p.type === 'IN').length

  // Elapsed since the latest IN punch (handles multi-punch days correctly)
  const latestIn = [...todayPunches].reverse().find((p) => p.type === 'IN')
  const elapsedMs = isClockedIn && latestIn
    ? now.getTime() - new Date(latestIn.timestamp).getTime()
    : null
  const weekTotalHrs = useMemo(
    () => week.reduce((s, d) => s + (d.hoursWorked ?? 0), 0),
    [week],
  )
  const monthExpectedHrs = 8 * 22 // 8h * ~22 working days (approximation)
  const monthSoFarHrs = history.reduce((s, d) => s + (d.hoursWorked ?? 0), 0) + (today?.hoursWorked ?? 0)

  return (
    <div className="space-y-5">

      {/* ─── Page header ─────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Time</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>


      {/* ─── Hubstaff-style single-timer hero, Workday card chrome ── */}
      {(() => {
        const isWfh = (latestIn?.workType ?? today?.workType) === 'WFH'

        // Live total: completed-session ms + (now - latestIn) if currently in
        let totalMs = 0
        let openIn: Date | null = null
        for (const p of todayPunches) {
          if (p.type === 'IN') openIn = new Date(p.timestamp)
          else if (p.type === 'OUT' && openIn) {
            totalMs += new Date(p.timestamp).getTime() - openIn.getTime()
            openIn = null
          }
        }
        if (openIn) totalMs += now.getTime() - openIn.getTime()
        const liveDisplay = formatHMS(totalMs)

        const primaryAction = isClockedIn ? 'STOP' : 'START'
        const primaryLabel = isClockedIn
          ? (sessionCount > 0 ? 'Stop / Take Break' : 'Stop')
          : (todayPunches.length === 0 ? 'Start Timer' : 'Resume')

        return (
      <Card className="overflow-hidden border border-slate-200">
        <CardContent className="p-0">
          {/* Workday-style header band */}
          <div className="px-6 py-2.5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-600 font-semibold">
              Time Tracker · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
            </p>
            <span className={
              'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ' +
              (isClockedIn
                ? 'bg-emerald-100 text-emerald-800'
                : isDoneForDay
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-amber-100 text-amber-800')
            }>
              <span className={
                'w-1.5 h-1.5 rounded-full ' +
                (isClockedIn ? 'bg-emerald-500 animate-pulse' :
                 isDoneForDay ? 'bg-slate-400' : 'bg-amber-500')
              } />
              {isClockedIn ? 'RUNNING' : isDoneForDay ? 'STOPPED' : 'NOT STARTED'}
            </span>
          </div>

          {/* Main timer body */}
          <div className="px-8 py-8 flex items-center justify-between gap-8 flex-wrap">
            {/* Left — giant HH:MM:SS */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-semibold">
                Total worked today
              </p>
              <p className={
                'text-6xl font-bold tabular-nums tracking-tight mt-2 ' +
                (isClockedIn ? 'text-slate-900' : isDoneForDay ? 'text-slate-700' : 'text-slate-300')
              }>
                {liveDisplay}
              </p>
              {(() => {
                // First IN of day (where the work day started) — distinct from latest IN
                const firstIn = todayPunches.find((p) => p.type === 'IN')
                // Live current-session elapsed (when running)
                const currentSessionMs = isClockedIn && latestIn
                  ? now.getTime() - new Date(latestIn.timestamp).getTime()
                  : 0
                if (todayPunches.length === 0) return null
                return (
                  <p className="text-sm text-slate-500 mt-2">
                    {firstIn && <>Day started at <strong className="text-slate-700">{fmtTime(firstIn.timestamp)}</strong></>}
                    {isClockedIn && (
                      <> · this session <strong className="text-emerald-700 tabular-nums">{formatHMS(currentSessionMs)}</strong></>
                    )}
                    {sessionCount > 1 && <> · {sessionCount} sessions</>}
                  </p>
                )
              })()}
            </div>

            {/* Right — work-type chip + big button */}
            <div className="flex flex-col items-end gap-3 shrink-0">
              {/* Work type toggle (only editable when not currently clocked in) */}
              <div className="flex bg-slate-100 rounded-lg p-1">
                {(['ONSITE', 'WFH'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => !isClockedIn && setWorkType(t)}
                    disabled={isClockedIn}
                    className={
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ' +
                      ((isClockedIn ? isWfh : workType === 'WFH') === (t === 'WFH')
                        ? (t === 'WFH' ? 'bg-purple-600 text-white shadow' : 'bg-blue-600 text-white shadow')
                        : 'text-slate-600 hover:bg-white disabled:cursor-not-allowed')
                    }
                  >
                    {t === 'ONSITE' ? <Building2 className="w-3.5 h-3.5" /> : <Home className="w-3.5 h-3.5" />}
                    {t === 'ONSITE' ? 'Onsite' : 'WFH'}
                  </button>
                ))}
              </div>

              {/* One big timer button */}
              <Button
                size="lg"
                onClick={() => clock(primaryAction === 'START' ? 'CLOCK_IN' : 'CLOCK_OUT')}
                disabled={busy}
                className={
                  'h-14 px-8 text-base font-semibold shadow-md transition-colors ' +
                  (primaryAction === 'START'
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-rose-600 hover:bg-rose-700 text-white')
                }
              >
                {primaryAction === 'START'
                  ? <><LogIn className="w-5 h-5 mr-2" /> {busy ? 'Starting…' : primaryLabel}</>
                  : <><LogOut className="w-5 h-5 mr-2" /> {busy ? 'Stopping…' : primaryLabel}</>}
              </Button>

              {isDoneForDay && (
                <p className="text-[11px] text-slate-500 italic">See you tomorrow.</p>
              )}
            </div>
          </div>

          {/* Notification line */}
          {actionMsg && (
            <div className={
              'px-8 py-2.5 text-xs border-t ' +
              (actionMsg.tone === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
               actionMsg.tone === 'warn' ? 'bg-amber-50 border-amber-100 text-amber-900' :
               'bg-red-50 border-red-100 text-red-800')
            }>
              <span className="inline-flex items-center gap-1.5">
                {actionMsg.tone === 'ok' && <ShieldCheck className="w-3.5 h-3.5" />}
                {actionMsg.tone !== 'ok' && <AlertCircle className="w-3.5 h-3.5" />}
                {actionMsg.text}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
        )
      })()}

      {/* ─── Today's Sessions — clean structured list ─────────────── */}
      {todayPunches.length > 0 && (() => {
        // Build sessions from punches (IN→OUT pairs + breaks between)
        type Row = { kind: 'SESSION' | 'BREAK'; start: Date; end: Date | null; wfh: boolean; live: boolean }
        const rows: Row[] = []
        let openIn: { ts: Date; wfh: boolean } | null = null
        let lastOut: Date | null = null
        const BREAK_MIN_MS = 60_000 // skip "breaks" under 1 minute (test noise / accidental punches)
        for (const p of todayPunches) {
          const ts = new Date(p.timestamp)
          if (p.type === 'IN') {
            // Break = time between lastOut and this IN — only show if meaningful
            if (lastOut && ts.getTime() - lastOut.getTime() >= BREAK_MIN_MS) {
              rows.push({ kind: 'BREAK', start: lastOut, end: ts, wfh: false, live: false })
            }
            openIn = { ts, wfh: p.workType === 'WFH' }
            lastOut = null
          } else if (p.type === 'OUT' && openIn) {
            rows.push({ kind: 'SESSION', start: openIn.ts, end: ts, wfh: openIn.wfh, live: false })
            lastOut = ts
            openIn = null
          }
        }
        if (openIn) {
          rows.push({ kind: 'SESSION', start: openIn.ts, end: null, wfh: openIn.wfh, live: true })
        }

        const sessionsOnly = rows.filter((r) => r.kind === 'SESSION')

        return (
          <Card>
            <CardContent className="p-0">
              <div className="px-5 py-3 border-b border-slate-100 flex items-baseline justify-between">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Today&apos;s Sessions</p>
                <p className="text-[11px] text-slate-500">{sessionsOnly.length} session{sessionsOnly.length > 1 ? 's' : ''}</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100">
                    <th className="text-left px-5 py-2 w-12">#</th>
                    <th className="text-left px-2 py-2">Type</th>
                    <th className="text-left px-2 py-2">Start</th>
                    <th className="text-left px-2 py-2">End</th>
                    <th className="text-left px-2 py-2">Location</th>
                    <th className="text-right px-5 py-2">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const isSession = r.kind === 'SESSION'
                    const sessionNum = isSession ? sessionsOnly.indexOf(r) + 1 : null
                    const endTime = r.end ?? now
                    const ms = endTime.getTime() - r.start.getTime()
                    return (
                      <tr key={i} className={'border-b border-slate-50 last:border-b-0 ' + (isSession ? '' : 'bg-slate-50/40')}>
                        <td className="px-5 py-3 text-slate-400 font-mono text-xs">{isSession ? sessionNum : '—'}</td>
                        <td className="px-2 py-3">
                          {isSession ? (
                            <span className={
                              'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ' +
                              (r.wfh ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800')
                            }>
                              {r.wfh ? <Home className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                              {r.wfh ? 'WFH' : 'Onsite'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700">
                              <Coffee className="w-3 h-3" /> Break
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-3 font-mono tabular-nums text-slate-900">{fmtTime(r.start.toISOString())}</td>
                        <td className="px-2 py-3 font-mono tabular-nums">
                          {r.end ? <span className="text-slate-900">{fmtTime(r.end.toISOString())}</span> :
                            <span className="text-emerald-700 font-semibold">running…</span>}
                        </td>
                        <td className="px-2 py-3 text-xs text-slate-600">
                          {isSession ? (r.wfh ? 'Working from home' : 'At the office') : 'Stepped away'}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-900 tabular-nums">
                          {formatHMS(ms)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50/60">
                    <td colSpan={5} className="px-5 py-3 text-[11px] uppercase tracking-wider text-slate-700 font-semibold">
                      Total worked today
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-base font-bold text-blue-700 tabular-nums">
                        {(() => {
                          let total = 0
                          for (const r of rows) {
                            if (r.kind !== 'SESSION') continue
                            const e = r.end ?? now
                            total += e.getTime() - r.start.getTime()
                          }
                          return formatHMS(total)
                        })()}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        )
      })()}

      {/* ─── This Week ───────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold">This Week</p>
              <p className="text-sm text-slate-700 mt-0.5">
                {startOfWeek(new Date()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                {' – '}
                {(() => { const e = startOfWeek(new Date()); e.setDate(e.getDate() + 6); return e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) })()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{weekTotalHrs.toFixed(1)}<span className="text-base text-slate-400 font-normal"> / 40h</span></p>
              <p className="text-[11px] text-slate-500">Total hours</p>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {week.map((d, i) => {
              const date = new Date(d.date)
              const isToday = date.toDateString() === new Date().toDateString()
              const isFuture = date > new Date()
              const isWeekend = i >= 5
              const hours = d.hoursWorked
              const isWfh = d.workType === 'WFH' && !!d.clockIn
              const isOnsite = d.workType === 'ONSITE' && !!d.clockIn
              return (
                <div
                  key={i}
                  className={
                    'rounded-lg border p-2.5 text-center relative overflow-hidden ' +
                    (isToday
                      ? (isWfh ? 'border-purple-400 bg-purple-50 ring-1 ring-purple-200' : 'border-blue-400 bg-blue-50 ring-1 ring-blue-200')
                      : isFuture
                        ? 'border-dashed border-slate-200 bg-slate-50/50 text-slate-400'
                        : isWeekend
                          ? 'border-slate-100 bg-slate-50/60'
                          : isWfh
                            ? 'border-purple-200 bg-purple-50/50'
                            : isOnsite
                              ? 'border-blue-200 bg-blue-50/40'
                              : d.status === 'LEAVE'
                                ? 'border-amber-200 bg-amber-50/40'
                                : 'border-slate-200 bg-white')
                  }
                >
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{DAYS[i]}</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{date.getDate()}</p>
                  {isFuture ? (
                    <p className="text-[10px] text-slate-400 mt-1">—</p>
                  ) : hours != null && hours > 0 ? (
                    <>
                      <p className={'text-xs font-semibold tabular-nums mt-1 ' + (isWfh ? 'text-purple-700' : 'text-blue-700')}>{hours.toFixed(1)}h</p>
                      <p className={'text-[9px] uppercase tracking-wider font-semibold mt-0.5 ' + (isWfh ? 'text-purple-500' : 'text-blue-500')}>
                        {isWfh ? '🏠 WFH' : '🏢 Onsite'}
                      </p>
                    </>
                  ) : isWeekend ? (
                    <p className="text-[10px] text-slate-400 mt-1">Off</p>
                  ) : d.status === 'LEAVE' ? (
                    <p className="text-[10px] text-amber-700 mt-1 font-semibold">Leave</p>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1">—</p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-200" /> Onsite</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-purple-200" /> WFH</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-200" /> Leave</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border border-dashed border-slate-300" /> Upcoming</span>
          </div>
        </CardContent>
      </Card>

      {/* ─── Month-to-date summary ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryTile
          icon={TrendingUp}
          label="Hours This Month"
          value={`${monthSoFarHrs.toFixed(1)} / ${monthExpectedHrs}h`}
          hint={`${Math.round((monthSoFarHrs / monthExpectedHrs) * 100)}% of expected`}
          tone="text-blue-600 bg-blue-50"
        />
        <SummaryTile
          icon={Coffee}
          label="Days Present"
          value={String(history.filter((d) => d.status === 'PRESENT').length + (isClockedIn || isDoneForDay ? 1 : 0))}
          hint="Including today"
          tone="text-emerald-600 bg-emerald-50"
        />
        <SummaryTile
          icon={Calendar}
          label="WFH Days"
          value={String(history.filter((d) => d.workType === 'WFH' && d.clockIn).length)}
          hint="Last 14 days"
          tone="text-purple-600 bg-purple-50"
        />
      </div>

      {/* Recent Punches removed — historical attendance lives on the Calendar tab. */}
    </div>
  )
}

function SummaryTile({ icon: Icon, label, value, hint, tone }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; hint: string; tone: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
          <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>
        </div>
        <div className={`p-2 rounded-lg ${tone}`}><Icon className="w-4 h-4" /></div>
      </CardContent>
    </Card>
  )
}

function formatHMS(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

