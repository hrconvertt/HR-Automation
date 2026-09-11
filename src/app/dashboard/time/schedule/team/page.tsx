/**
 * Team Schedule — everybody's week on one grid.
 *
 * HR and executives see everyone; managers and leads see the people who
 * report to them. One row per person, one column per day, each cell the
 * shift with where it is, or leave, a holiday, or nothing. Across the top,
 * how many are in the office, at home and off each day — the part of
 * Workday's labour-demand view an office with fixed hours can use: not a
 * forecast, just who is where.
 *
 * Each row carries the person's own schedule preferences, because the point
 * of recording a preference is that whoever plans the week can see it.
 */
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  buildSchedule, weekStart, isoDay, utcDay, addDays, todayKeyPK, fmtTime,
  type DayPlan, type PersonSchedule,
} from '@/lib/schedule'
import { DEPARTED_STATUSES } from '@/lib/learning-assign'
import { ChevronLeft, ChevronRight, Building2, Home } from 'lucide-react'

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function resolveWeek(param?: string) {
  const todayKey = todayKeyPK()
  const base = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? utcDay(param) : utcDay(todayKey)
  return { start: weekStart(base), todayKey }
}

function weekLabel(start: Date): string {
  const end = addDays(start, 6)
  const a = `${MONTH[start.getUTCMonth()]} ${start.getUTCDate()}`
  const b = start.getUTCMonth() === end.getUTCMonth() ? `${end.getUTCDate()}` : `${MONTH[end.getUTCMonth()]} ${end.getUTCDate()}`
  return `${a} – ${b}, ${end.getUTCFullYear()}`
}

const PLACE: Record<string, string> = { OFFICE: 'Office', WFH: 'Home', HYBRID: 'Hybrid' }

export default async function TeamSchedulePage({
  searchParams,
}: {
  searchParams?: Promise<{ week?: string }>
}) {
  const sp = (await searchParams) ?? {}
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!user) redirect('/login')
  const preview = user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const role = preview ?? user.role
  const everyone = role === 'HR_ADMIN' || role === 'EXECUTIVE'
  if (!everyone && role !== 'MANAGER' && role !== 'LEAD') redirect('/dashboard/time/schedule')

  const people = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      status: { notIn: DEPARTED_STATUSES },
      ...(everyone ? {} : { reportingManagerId: user.employee?.id ?? '__none__' }),
    },
    select: { id: true },
  })

  const { start, todayKey } = resolveWeek(sp.week)
  const [schedule, prefs] = await Promise.all([
    buildSchedule(people.map((p) => p.id), start, 7),
    prisma.schedulePreference.findMany({
      where: { employeeId: { in: people.map((p) => p.id) } },
      select: { employeeId: true, weeklyHours: true, location: true, preferredDays: true, onCall: true, standby: true },
    }),
  ])
  const prefOf = new Map(prefs.map((p) => [p.employeeId, p]))
  const days = Array.from({ length: 7 }, (_, i) => isoDay(addDays(start, i)))
  const prev = isoDay(addDays(start, -7))
  const next = isoDay(addDays(start, 7))

  // Who is where, each day.
  const cover = days.map((key, i) => {
    let office = 0, home = 0, off = 0
    for (const s of schedule) {
      const d = s.days[i]
      if (d.kind === 'SHIFT') { if (d.location === 'WFH') home++; else office++ }
      else off++
    }
    return { key, office, home, off }
  })
  const totalHours = schedule.reduce((sum, s) => sum + s.hours, 0)

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Team Schedule</h1>
          <p className="text-sm text-slate-500 mt-1">
            {everyone ? 'Everyone' : 'The people who report to you'} · {schedule.length} {schedule.length === 1 ? 'person' : 'people'} · {totalHours} scheduled hours this week
          </p>
        </div>
        <Link href="/dashboard/time/schedule" className="text-sm font-medium text-blue-700 hover:underline">My Schedule</Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
          <Link href={`/dashboard/time/schedule/team?week=${prev}`} aria-label="Previous week" className="w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <p className="text-base font-semibold text-slate-900">{weekLabel(start)}</p>
          <Link href={`/dashboard/time/schedule/team?week=${next}`} aria-label="Next week" className="w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100">
            <ChevronRight className="w-5 h-5" />
          </Link>
          <Link href="/dashboard/time/schedule/team" className="ml-auto text-xs font-medium px-3 py-1.5 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50">
            This week
          </Link>
        </div>

        {schedule.length === 0 ? (
          <p className="text-sm text-slate-400 py-12 text-center">Nobody reports to you, so there is no team to show.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="sticky left-0 z-10 bg-white px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide min-w-[200px]">Person</th>
                  {days.map((key, i) => {
                    const d = utcDay(key)
                    const today = key === todayKey
                    return (
                      <th key={key} className={`px-2 py-2.5 text-center min-w-[128px] ${today ? 'bg-blue-50/70' : ''}`}>
                        <span className={`block text-[10px] font-semibold uppercase tracking-wide ${today ? 'text-blue-700' : ''}`}>{DOW_SHORT[d.getUTCDay()]}</span>
                        <span className={`block text-base font-semibold ${today ? 'text-blue-700' : 'text-slate-900'}`}>{d.getUTCDate()}</span>
                        <span className="block text-[10px] font-normal text-slate-400 mt-0.5">
                          {cover[i].office} office · {cover[i].home} home · {cover[i].off} off
                        </span>
                      </th>
                    )
                  })}
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide">Hours</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide min-w-[160px]">Prefers</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((s) => (
                  <PersonRow key={s.employeeId} s={s} todayKey={todayKey} pref={prefOf.get(s.employeeId) ?? null} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400">
        Worked out from each person&apos;s standing hours, holidays HR has applied, and approved leave and work-from-home.
        A dashed cell marks hours assumed because none are on the person&apos;s record.
      </p>
    </div>
  )
}

function PersonRow({ s, todayKey, pref }: {
  s: PersonSchedule
  todayKey: string
  pref: { weeklyHours: number | null; location: string | null; preferredDays: string | null; onCall: boolean; standby: boolean } | null
}) {
  const prefBits = pref
    ? [
      pref.weeklyHours ? `${pref.weeklyHours} h/week` : null,
      pref.location ? PLACE[pref.location] ?? pref.location : null,
      pref.preferredDays ? pref.preferredDays.split(',').join(' ') : null,
      pref.onCall ? 'on call' : null,
      pref.standby ? 'standby' : null,
    ].filter(Boolean).join(' · ')
    : ''
  return (
    <tr className="border-b border-slate-50 align-top">
      <td className="sticky left-0 z-10 bg-white px-4 py-3">
        <Link href={`/dashboard/employees/${s.employeeId}`} className="font-medium text-blue-700 hover:underline">{s.name}</Link>
        <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[200px]">{s.department ?? s.designation ?? '—'}</p>
      </td>
      {s.days.map((d) => (
        <td key={d.date} className={`px-2 py-2.5 ${d.date === todayKey ? 'bg-blue-50/40' : ''}`}>
          <Cell d={d} assumed={s.assumed} />
        </td>
      ))}
      <td className="px-3 py-3 text-right font-medium text-slate-900">{s.hours}</td>
      <td className="px-3 py-3 text-xs text-slate-500">{prefBits || <span className="text-slate-300">—</span>}</td>
    </tr>
  )
}

function Cell({ d, assumed }: { d: DayPlan; assumed: boolean }) {
  if (d.kind === 'SHIFT' && d.startMin != null && d.endMin != null) {
    const extra = d.shiftKind === 'EXTRA'
    return (
      <div
        className={`rounded-lg border px-2 py-1.5 ${assumed ? 'border-dashed' : ''} ${
          extra ? 'bg-blue-50 border-blue-200' : d.location === 'WFH' ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
        }`}
        title={d.tags.join(' · ') || undefined}
      >
        <p className="text-[11px] font-semibold text-slate-900 whitespace-nowrap">
          {fmtTime(d.startMin).replace(':00', '')} – {fmtTime(d.endMin).replace(':00', '')}
        </p>
        <p className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
          {d.location === 'WFH' ? <Home className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
          {d.location === 'WFH' ? 'Home' : 'Office'}
          {extra ? ' · extra' : d.shiftKind === 'CHANGED' ? ' · changed' : d.half ? ' · half day' : ''}
        </p>
      </div>
    )
  }
  if (d.kind === 'LEAVE') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5" title={d.tags.join(' · ')}>
        <p className="text-[11px] font-semibold text-amber-800">Leave</p>
        <p className="text-[10px] text-amber-700 truncate">{d.tags[0] ?? ''}</p>
      </div>
    )
  }
  if (d.kind === 'HOLIDAY') {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5" title={d.tags.join(' · ')}>
        <p className="text-[11px] font-semibold text-slate-700">Holiday</p>
        <p className="text-[10px] text-slate-500 truncate">{d.tags[0] ?? ''}</p>
      </div>
    )
  }
  return <p className="text-center text-slate-300 text-xs py-2">—</p>
}
