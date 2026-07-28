'use client'

/**
 * HR "Today" board — the operational landing view for /dashboard/attendance.
 *
 * Every active employee grouped by their CURRENT state today:
 *   Present / WFH / On Leave / On LOA / Not marked yet
 * with one-click marking (P / WFH / HD / L) on unmarked rows and inline
 * late-arrival flags (clock-in after shift start + grace).
 *
 * Data: GET /api/attendance?today=true (server-scoped by role); marking uses
 * PATCH /api/attendance/[employeeId]/[date] (HR-only, preview-role blocked,
 * AuditLog-backed). Auto-refreshes every 60s.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, Clock, UserCheck, Home, CalendarOff, Moon, CircleDashed } from 'lucide-react'
import { getInitials } from '@/lib/utils'

interface TodayRecord {
  employeeId: string
  fullName: string
  department: string
  clockIn: string | null
  clockOut: string | null
  status: string
  workType: string
  hoursWorked: number | null
  isLate: boolean
  lateMinutes: number
  loaType: string | null
}

interface TodayMeta {
  date: string
  isWeekend: boolean
  holidayName: string | null
  afterEndOfDay: boolean
}

interface TodayResponse {
  todayStats: { present: number; late: number; wfh: number; leave: number; loa: number; notYetIn: number; absent: number; total: number }
  logs: TodayRecord[]
  meta?: TodayMeta
}

const MARK_OPTIONS: { value: 'PRESENT' | 'WFH' | 'HALF_DAY' | 'LEAVE'; label: string }[] = [
  { value: 'PRESENT', label: 'P' },
  { value: 'WFH', label: 'WFH' },
  { value: 'HALF_DAY', label: 'HD' },
  { value: 'LEAVE', label: 'L' },
]

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
}

export function TodayBoard({ canMark }: { canMark: boolean }) {
  const [data, setData] = useState<TodayResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [marking, setMarking] = useState<string | null>(null) // `${empId}|${status}`
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchToday = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance?today=true')
      if (!res.ok) throw new Error('Failed to load today’s attendance')
      setData(await res.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchToday()
    timer.current = setInterval(fetchToday, 60_000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [fetchToday])

  async function mark(employeeId: string, status: typeof MARK_OPTIONS[number]['value']) {
    if (!canMark || !data?.meta?.date) return
    const key = `${employeeId}|${status}`
    setMarking(key)
    try {
      const res = await fetch(`/api/attendance/${employeeId}/${data.meta.date}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: 'Marked from Today board' }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Mark failed')
      }
      await fetchToday()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mark failed')
    } finally {
      setMarking(null)
    }
  }

  if (loading && !data) return <div className="text-sm text-slate-500 px-3 py-6">Loading today’s attendance…</div>

  const logs = data?.logs ?? []
  const present = logs.filter((r) => (r.status === 'PRESENT' || r.status === 'LATE') && r.workType !== 'WFH')
  const wfh = logs.filter((r) => (r.status === 'PRESENT' || r.status === 'LATE') && r.workType === 'WFH')
  const onLeave = logs.filter((r) => r.status === 'LEAVE' || r.status === 'HALF_DAY')
  const onLoa = logs.filter((r) => r.status === 'LOA')
  // Policy: no "Absent" — an ABSENT effective status just means nobody marked
  // the day yet, so it lands in "Not marked yet" alongside NOT_IN.
  const unmarked = logs.filter((r) => r.status === 'NOT_IN' || r.status === 'ABSENT')

  const stats: { icon: React.ElementType; label: string; value: number }[] = [
    { icon: UserCheck, label: 'Present', value: present.length },
    { icon: Home, label: 'WFH', value: wfh.length },
    { icon: Clock, label: 'Late arrivals', value: data?.todayStats.late ?? 0 },
    { icon: CalendarOff, label: 'On Leave', value: onLeave.length },
    { icon: Moon, label: 'On LOA', value: onLoa.length },
    { icon: CircleDashed, label: 'Not marked', value: unmarked.length },
  ]

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-md px-3 py-2">{error}</div>
      )}

      {data?.meta?.isWeekend && (
        <div className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-md px-3 py-2">
          Today is a weekend — attendance marking is optional (on-call work only).
        </div>
      )}
      {data?.meta?.holidayName && (
        <div className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-md px-3 py-2">
          Today is a public holiday: <span className="font-semibold">{data.meta.holidayName}</span>.
        </div>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 flex items-center gap-2.5">
            <s.icon className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-semibold text-slate-900 leading-tight">{s.value}</div>
              <div className="text-[11px] text-slate-500 truncate">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Not marked yet — the actionable group, listed first */}
      {unmarked.length > 0 && (
        <Section title={`Not marked yet (${unmarked.length})`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {unmarked.map((r) => (
              <div key={r.employeeId} className="flex items-center gap-3 px-3 py-2 bg-white border border-slate-200 border-dashed rounded-lg">
                <Avatar name={r.fullName} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{r.fullName}</p>
                  <p className="text-[11px] text-slate-400 truncate">{r.department}</p>
                </div>
                {canMark && (
                  <div className="flex items-center gap-1 shrink-0">
                    {MARK_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        onClick={() => mark(r.employeeId, o.value)}
                        disabled={marking !== null}
                        title={`Mark ${o.value.replace('_', ' ').toLowerCase()}`}
                        className="px-2 py-1 text-[10px] font-bold rounded border border-slate-300 text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 disabled:opacity-40 transition"
                      >
                        {marking === `${r.employeeId}|${o.value}` ? '…' : o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {present.length > 0 && (
        <Section title={`Present (${present.length})`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {present.map((r) => <PersonCard key={r.employeeId} r={r} />)}
          </div>
        </Section>
      )}

      {wfh.length > 0 && (
        <Section title={`Working from home (${wfh.length})`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {wfh.map((r) => <PersonCard key={r.employeeId} r={r} />)}
          </div>
        </Section>
      )}

      {onLeave.length > 0 && (
        <Section title={`On leave (${onLeave.length})`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
            {onLeave.map((r) => (
              <div key={r.employeeId} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg">
                <Avatar name={r.fullName} small />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{r.fullName}</p>
                  <p className="text-[10px] text-slate-500 truncate">{r.status === 'HALF_DAY' ? 'Half day' : 'Leave approved'}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {onLoa.length > 0 && (
        <Section title={`On leave of absence (${onLoa.length})`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
            {onLoa.map((r) => (
              <div key={r.employeeId} className="flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg">
                <Avatar name={r.fullName} small />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{r.fullName}</p>
                  <p className="text-[10px] text-slate-500 truncate">{(r.loaType ?? 'LOA').replace(/_/g, ' ').toLowerCase()}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {logs.length === 0 && !loading && (
        <p className="text-sm text-slate-400 text-center py-10">No active employees in your view.</p>
      )}

      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <RefreshCw className="w-3 h-3" /> Auto-refreshes every 60 seconds · marks are logged to the audit trail
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 mb-2">{title}</h2>
      {children}
    </div>
  )
}

function Avatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <div className={`${small ? 'w-8 h-8 text-[10px]' : 'w-9 h-9 text-xs'} rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0`}>
      {getInitials(name)}
    </div>
  )
}

function PersonCard({ r }: { r: TodayRecord }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-white border border-slate-200 rounded-lg">
      <Avatar name={r.fullName} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate flex items-center gap-1.5">
          {r.fullName}
          {r.isLate && (
            <span
              title={`Clocked in ${r.lateMinutes} min after shift start + grace`}
              className="px-1.5 py-0.5 rounded bg-slate-900 text-white text-[9px] font-bold uppercase tracking-wide"
            >
              Late
            </span>
          )}
        </p>
        <p className="text-[11px] text-slate-400 truncate">{r.department}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-medium text-slate-700">{fmtTime(r.clockIn)}</p>
        <p className="text-[10px] text-slate-400">{r.clockOut ? `out ${fmtTime(r.clockOut)}` : r.clockIn ? 'working' : 'marked'}</p>
      </div>
    </div>
  )
}
