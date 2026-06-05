'use client'

/**
 * Team Time — Manager view.
 *
 * A manager is also an employee, so the page has two parts:
 *   1) Compact personal timer strip (their own clock in / out)
 *   2) Team list (Working Now / Done / Not In / On Leave)
 *   + inline pending-OT approvals for their direct reports
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Clock, Home, Building2,
  CheckCircle2, AlertCircle, Users, LogIn, LogOut,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'

type Punch = { type: string; timestamp: string; workType: string | null }

type TodayRecord = {
  employeeId: string
  employeeCode: string
  fullName: string
  department: string
  clockIn: string | null
  clockOut: string | null
  status: string
  workType: string
  hoursWorked: number | null
  punches?: Punch[]
  sessionCount?: number
  isCurrentlyIn?: boolean
}

function fmtTime(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatHMS(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function liveTotalMs(punches: Punch[], now: Date): number {
  let total = 0
  let openIn: Date | null = null
  for (const p of punches) {
    if (p.type === 'IN') openIn = new Date(p.timestamp)
    else if (p.type === 'OUT' && openIn) {
      total += new Date(p.timestamp).getTime() - openIn.getTime()
      openIn = null
    }
  }
  if (openIn) total += now.getTime() - openIn.getTime()
  return total
}


type PendingOT = {
  id: string
  employeeId: string
  fullName: string
  date: string
  hoursWorked: number | null
  overtimeHours: number
}

export default function TeamTimeView({ managerEmployeeId, managerName }: { managerEmployeeId: string; managerName: string }) {
  const [records, setRecords] = useState<TodayRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())

  // Personal timer state
  const [workType, setWorkType] = useState<'ONSITE' | 'WFH'>('ONSITE')
  const [busy, setBusy] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  // Pending OT for direct reports
  const [pendingOT, setPendingOT] = useState<PendingOT[]>([])
  const [otExpanded, setOtExpanded] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const today = new Date()
    const [todayRes, otRes] = await Promise.all([
      fetch('/api/attendance?today=true'),
      fetch(`/api/attendance?overtime=true&month=${today.getMonth() + 1}&year=${today.getFullYear()}`),
    ])
    const todayData = await todayRes.json()
    const otData = await otRes.json()
    setRecords(todayData.logs ?? [])
    setPendingOT(
      ((otData.logs ?? []) as (PendingOT & { overtimeApproved: boolean; employeeId: string })[])
        .filter((l) => !l.overtimeApproved && l.employeeId !== managerEmployeeId),
    )
    setLoading(false)
  }, [managerEmployeeId])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [refresh])

  // ── My own record (manager is also an employee)
  const myRecord = useMemo(
    () => records.find((r) => r.employeeId === managerEmployeeId),
    [records, managerEmployeeId],
  )

  // ── Team list: include the manager themselves at the top (marked "You"),
  //    then their direct reports. Manager sees their own punches alongside.
  const team = useMemo(
    () => records.filter((r) => r.employeeId !== managerEmployeeId),
    [records, managerEmployeeId],
  )
  const teamWithMe = useMemo(() => {
    const me = records.find((r) => r.employeeId === managerEmployeeId)
    return me ? [me, ...team] : team
  }, [records, team, managerEmployeeId])

  // ── Personal clock action
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
    setActionMsg(res.ok ? (data.message ?? 'Done') : (data.error ?? 'Failed'))
    setTimeout(() => setActionMsg(null), 5000)
    await refresh()
  }

  async function approveOT(logId: string, hours: number) {
    await fetch('/api/attendance/overtime', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendanceLogId: logId, overtimeHours: hours, approve: true }),
    })
    await refresh()
  }

  // ── Categorise
  const workingNow = team.filter((r) => r.isCurrentlyIn)
  const done      = team.filter((r) => (r.punches?.length ?? 0) > 0 && !r.isCurrentlyIn && r.clockIn)
  const notInYet  = team.filter((r) => (r.punches?.length ?? 0) === 0 && r.status !== 'LEAVE')
  const onLeave   = team.filter((r) => r.status === 'LEAVE')

  // ── Exceptions — only real anomalies
  const exceptions = useMemo(() => {
    const list: { id: string; severity: 'high' | 'medium' | 'low'; record: TodayRecord; reason: string }[] = []
    for (const r of team) {
      if (r.isCurrentlyIn && r.punches?.length) {
        const total = liveTotalMs(r.punches as Punch[], now)
        if (total / 3_600_000 > 10) {
          list.push({
            id: `long-${r.employeeId}`,
            severity: 'low',
            record: r,
            reason: `Still clocked in (${(total / 3_600_000).toFixed(1)}h) — may have forgotten to check out`,
          })
        }
      }
    }
    return list
  }, [team, now])

  return (
    <div className="space-y-5">

      {/* Header — title + date only. Clock controls live in the hero card below. */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Team Time</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {actionMsg && (
        <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-1.5">
          {actionMsg}
        </div>
      )}

      {/* ─── Hubstaff-style hero: manager's own big timer at the top ─── */}
      {(() => {
        const me = teamWithMe.find((r) => r.employeeId === managerEmployeeId)
        if (!me) return null
        const punches = (me.punches ?? []) as Punch[]
        const isIn = !!me.isCurrentlyIn
        const elapsed = liveTotalMs(punches, now)
        const latestIn = [...punches].reverse().find((p) => p.type === 'IN')
        const isWfh = (latestIn?.workType ?? me.workType) === 'WFH'

        return (
          <div className={
            'rounded-2xl p-6 text-white shadow-lg ' +
            (isIn
              ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
              : 'bg-gradient-to-br from-blue-600 to-blue-800')
          }>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/70 font-semibold">
                  {isIn ? '● Tracking time' : '○ Not tracking'}
                </p>
                <p className="text-5xl font-bold tabular-nums tracking-tight mt-1.5">{formatHMS(elapsed)}</p>
                <p className="text-sm text-white/80 mt-1">
                  {isIn && latestIn
                    ? <>Since {new Date(latestIn.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })} · {isWfh ? 'Working from home' : 'On-site'}</>
                    : punches.length > 0 ? 'Stopped — total today' : 'Click Start when you begin work'}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {!isIn && (
                  <div className="flex bg-white/15 rounded-lg p-0.5 backdrop-blur">
                    {(['ONSITE', 'WFH'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setWorkType(t)}
                        className={
                          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ' +
                          (workType === t ? 'bg-white text-blue-700' : 'text-white/90 hover:bg-white/10')
                        }
                      >
                        {t === 'ONSITE' ? <Building2 className="w-3.5 h-3.5" /> : <Home className="w-3.5 h-3.5" />}
                        {t === 'ONSITE' ? 'On-site' : 'WFH'}
                      </button>
                    ))}
                  </div>
                )}
                <Button
                  size="lg"
                  onClick={() => clock(isIn ? 'CLOCK_OUT' : 'CLOCK_IN')}
                  disabled={busy}
                  className={
                    'h-11 px-6 text-sm font-semibold shadow-md ' +
                    (isIn ? 'bg-white text-rose-600 hover:bg-rose-50' : 'bg-white text-blue-700 hover:bg-blue-50')
                  }
                >
                  {isIn
                    ? <><LogOut className="w-4 h-4 mr-1.5" /> {busy ? '…' : 'Stop'}</>
                    : <><LogIn className="w-4 h-4 mr-1.5" /> {busy ? '…' : punches.length > 0 ? 'Resume' : 'Start tracking'}</>}
                </Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ─── Manager's own sessions today — Hubstaff-style row list, no break rows ─── */}
      {(() => {
        const me = myRecord
        if (!me) return null
        const punches = (me.punches ?? []) as Punch[]
        if (punches.length === 0) return null

        // Build IN→OUT pairs only (no break rows)
        type Session = { start: Date; end: Date | null; wfh: boolean }
        const sessions: Session[] = []
        let openIn: { ts: Date; wfh: boolean } | null = null
        for (const p of punches) {
          const ts = new Date(p.timestamp)
          if (p.type === 'IN') openIn = { ts, wfh: p.workType === 'WFH' }
          else if (p.type === 'OUT' && openIn) {
            sessions.push({ start: openIn.ts, end: ts, wfh: openIn.wfh })
            openIn = null
          }
        }
        if (openIn) sessions.push({ start: openIn.ts, end: null, wfh: openIn.wfh })

        const totalMs = sessions.reduce((s, sess) => s + ((sess.end ?? now).getTime() - sess.start.getTime()), 0)

        return (
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold">My Sessions Today</p>
              <p className="text-[11px] text-slate-500 tabular-nums">
                {sessions.length} session{sessions.length === 1 ? '' : 's'} · {formatHMS(totalMs)} total
              </p>
            </div>
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-100">
                      <th className="text-left px-5 py-2 w-12">#</th>
                      <th className="text-left px-2 py-2">Work mode</th>
                      <th className="text-left px-2 py-2">Start</th>
                      <th className="text-left px-2 py-2">End</th>
                      <th className="text-right px-5 py-2">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s, i) => {
                      const endTime = s.end ?? now
                      const dur = endTime.getTime() - s.start.getTime()
                      return (
                        <tr key={i} className="border-b border-slate-50 last:border-b-0">
                          <td className="px-5 py-2.5 text-slate-400 font-mono text-xs">{i + 1}</td>
                          <td className="px-2 py-2.5">
                            <span className={
                              'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ' +
                              (s.wfh ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800')
                            }>
                              {s.wfh ? <Home className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                              {s.wfh ? 'WFH' : 'Onsite'}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 font-mono tabular-nums text-slate-900">{fmtTime(s.start.toISOString())}</td>
                          <td className="px-2 py-2.5 font-mono tabular-nums">
                            {s.end
                              ? <span className="text-slate-900">{fmtTime(s.end.toISOString())}</span>
                              : <span className="text-emerald-700 font-semibold">running…</span>}
                          </td>
                          <td className="px-5 py-2.5 text-right font-semibold text-slate-900 tabular-nums">{formatHMS(dur)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-50/60">
                      <td colSpan={4} className="px-5 py-3 text-[11px] uppercase tracking-wider text-slate-700 font-semibold">
                        Total worked today
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-base font-bold text-blue-700 tabular-nums">{formatHMS(totalMs)}</span>
                        <span className="text-xs text-slate-500 ml-2 tabular-nums">({(totalMs / 3_600_000).toFixed(2)} h)</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          </div>
        )
      })()}

      {/* OT approvals panel for Manager intentionally hidden — feature code (handlers,
          state, API calls) preserved in this file for future use if manager-OT-approval
          is re-enabled. For now, all OT approvals are HR-only via the Approvals tab. */}

      {/* Exceptions Inbox — only when real anomalies */}
      {exceptions.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 bg-amber-50/50">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-900 font-semibold">Needs Your Attention</p>
              <span className="text-xs font-bold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">{exceptions.length}</span>
            </div>
            <ul>
              {exceptions.map((ex) => (
                <li key={ex.id} className="flex items-center justify-between px-5 py-3 border-b border-slate-50 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">
                      {getInitials(ex.record.fullName)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{ex.record.fullName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{ex.reason}</p>
                    </div>
                  </div>
                  <Link href={`/dashboard/employees/${ex.record.employeeId}`} className="text-xs text-blue-600 hover:underline">View</Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ─── Team activity grid — Hubstaff-style cards ─── */}
      <div>
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold">My Team — Today</p>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="text-emerald-700 font-semibold">{team.filter((r) => r.isCurrentlyIn).length}</span> working now
              {onLeave.length > 0 && <> · <span className="text-blue-700 font-semibold">{onLeave.length}</span> on leave</>}
            </p>
          </div>
          <p className="text-[11px] text-slate-400">As of {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
        </div>

        {loading ? (
          <p className="text-center text-slate-400 py-10 text-sm">Loading…</p>
        ) : team.length === 0 ? (
          <p className="text-center text-slate-500 py-10 text-sm">You have no team members yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {[...team].sort((a, b) => {
              const order: Record<string, number> = { WORKING: 0, ON_LEAVE: 1, NOT_IN: 2, DONE: 3 }
              const sa = a.status === 'LEAVE' ? 'ON_LEAVE' : a.isCurrentlyIn ? 'WORKING' : (a.punches?.length ?? 0) > 0 ? 'DONE' : 'NOT_IN'
              const sb = b.status === 'LEAVE' ? 'ON_LEAVE' : b.isCurrentlyIn ? 'WORKING' : (b.punches?.length ?? 0) > 0 ? 'DONE' : 'NOT_IN'
              const d = order[sa] - order[sb]
              return d !== 0 ? d : a.fullName.localeCompare(b.fullName)
            }).map((r) => (
              <TeamCard key={r.employeeId} record={r} now={now} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Hubstaff-style team card — avatar + live timer + status ─────────────────

function TeamCard({ record, now }: { record: TodayRecord; now: Date }) {
  const punches = (record.punches ?? []) as Punch[]
  const isIn = !!record.isCurrentlyIn
  const isDone = !isIn && punches.length > 0 && !!record.clockIn
  const isLeave = record.status === 'LEAVE'
  const elapsed = liveTotalMs(punches, now)
  const wfh = (punches[punches.length - 1]?.workType ?? record.workType) === 'WFH'

  // Status drives the card's tone
  const tone = isIn      ? { bg: 'bg-emerald-50',  ring: 'ring-emerald-200',  avatar: 'bg-emerald-500',  pill: 'bg-emerald-100 text-emerald-800', dotClr: 'bg-emerald-500 animate-pulse' }
             : isDone    ? { bg: 'bg-slate-50',    ring: 'ring-slate-200',    avatar: 'bg-slate-400',    pill: 'bg-slate-200 text-slate-700',     dotClr: 'bg-slate-400' }
             : isLeave   ? { bg: 'bg-blue-50',     ring: 'ring-blue-200',     avatar: 'bg-blue-500',     pill: 'bg-blue-100 text-blue-800',       dotClr: 'bg-blue-500' }
             :             { bg: 'bg-amber-50/60', ring: 'ring-amber-200',    avatar: 'bg-amber-400',    pill: 'bg-amber-100 text-amber-800',     dotClr: 'bg-amber-500' }

  const statusText = isIn ? 'Working' : isDone ? 'Done' : isLeave ? 'On leave' : 'Not started'

  return (
    <Link href={`/dashboard/employees/${record.employeeId}`} className={`block rounded-xl border border-slate-200 hover:ring-2 hover:${tone.ring} transition-shadow hover:shadow-md ${tone.bg}`}>
      <div className="p-4">
        {/* Top row: avatar + status pill */}
        <div className="flex items-start justify-between">
          <div className="relative">
            <div className={`w-12 h-12 rounded-full ${tone.avatar} text-white flex items-center justify-center text-sm font-bold shadow-sm`}>
              {getInitials(record.fullName)}
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${tone.dotClr}`} />
          </div>
          <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${tone.pill}`}>
            {statusText}
          </span>
        </div>

        {/* Name + dept */}
        <div className="mt-3">
          <p className="text-sm font-semibold text-slate-900 truncate">{record.fullName}</p>
          <p className="text-[11px] text-slate-500 truncate">{record.department}</p>
        </div>

        {/* Live time + meta */}
        <div className="mt-3 flex items-baseline justify-between">
          {isIn || isDone ? (
            <>
              <div>
                <p className="text-2xl font-bold tabular-nums text-slate-900 leading-none">{formatHMS(elapsed)}</p>
                <p className="text-[10px] text-slate-500 tabular-nums mt-0.5">{(elapsed / 3_600_000).toFixed(2)} h</p>
              </div>
              <span className="text-[10px] font-medium text-slate-600 inline-flex items-center gap-1">
                {wfh ? <Home className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                {wfh ? 'WFH' : 'Onsite'}
              </span>
            </>
          ) : isLeave ? (
            <p className="text-xs text-blue-700">Approved leave</p>
          ) : (
            <p className="text-xs text-amber-700">Haven&apos;t clocked in</p>
          )}
        </div>

        {/* Bottom meta line */}
        {(isIn || isDone) && record.clockIn && (
          <p className="text-[10px] text-slate-500 mt-1.5">
            {isIn ? <>Since {fmtTime(record.clockIn)}</> : <>{fmtTime(record.clockIn)} → {fmtTime(record.clockOut)}</>}
          </p>
        )}
      </div>
    </Link>
  )
}
