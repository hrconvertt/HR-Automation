'use client'

/**
 * My Schedule — the web version of Workday's mobile schedule.
 *
 * Same parts, laid out for a screen rather than a phone: the week and its
 * totals across the top with arrows either side, a strip of seven days with a
 * dot under each day you work, then one row per day with the shift, where it
 * is, the lunch hour and how many hours it comes to. Your preferences sit to
 * the right with the button to change them.
 *
 * Workday prints a lunch window ("Meal: 12:00 PM – 12:30 PM"). Here it says
 * "Lunch 1 hour" instead: the agreement gives an hour, not a fixed slot, and
 * inventing a time would be a claim nobody made.
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, Building2, Home, Coffee, Clock, SlidersHorizontal, CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PreferencesDialog, type SchedulePrefs } from './preferences-dialog'
import type { PersonSchedule, DayPlan } from '@/lib/schedule'

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Date maths on YYYY-MM-DD strings — no clock involved, so no hydration drift. */
function shiftKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function parts(key: string) {
  const d = new Date(`${key}T00:00:00.000Z`)
  return { day: d.getUTCDate(), month: MONTH[d.getUTCMonth()], year: d.getUTCFullYear() }
}
function weekLabel(week: string): string {
  const a = parts(week)
  const b = parts(shiftKey(week, 6))
  if (a.month === b.month) return `${a.month} ${a.day} – ${b.day}, ${b.year}`
  if (a.year === b.year) return `${a.month} ${a.day} – ${b.month} ${b.day}, ${b.year}`
  return `${a.month} ${a.day}, ${a.year} – ${b.month} ${b.day}, ${b.year}`
}
function fmtTime(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
const hoursLabel = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, '')} hour${h === 1 ? '' : 's'}`

export function MySchedule({ week, todayKey, person, designation, preference }: {
  week: string
  todayKey: string
  person: PersonSchedule
  designation: string | null
  preference: SchedulePrefs | null
}) {
  const [prefsOpen, setPrefsOpen] = useState(false)
  const thisWeek = (() => {
    const d = new Date(`${todayKey}T00:00:00.000Z`)
    const dow = d.getUTCDay()
    return shiftKey(todayKey, dow === 0 ? -6 : 1 - dow)
  })()

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">My Schedule</h1>
          <p className="text-sm text-slate-500 mt-1">
            {person.pattern}
            {person.assumed ? ' — no hours are on your record, so the office’s are shown' : ''}
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setPrefsOpen(true)}>
          <SlidersHorizontal className="w-4 h-4" /> Change my schedule preferences
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden min-w-0">
          {/* The week */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
            <Link
              href={`/dashboard/time/schedule?week=${shiftKey(week, -7)}`}
              aria-label="Previous week"
              className="w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1 text-center">
              <p className="text-lg font-semibold text-slate-900">{weekLabel(week)}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {person.shifts} shift{person.shifts === 1 ? '' : 's'} · {hoursLabel(person.hours)}
              </p>
            </div>
            <Link
              href={`/dashboard/time/schedule?week=${shiftKey(week, 7)}`}
              aria-label="Next week"
              className="w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
            >
              <ChevronRight className="w-5 h-5" />
            </Link>
            {week !== thisWeek && (
              <Link
                href="/dashboard/time/schedule"
                className="text-xs font-medium px-3 py-1.5 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                This week
              </Link>
            )}
          </div>

          {/* The strip of days */}
          <div className="grid grid-cols-7 border-b border-slate-100">
            {person.days.map((d) => {
              const today = d.date === todayKey
              return (
                <a key={d.date} href={`#day-${d.date}`} className="flex flex-col items-center gap-1.5 py-3 hover:bg-slate-50">
                  <span className="text-[11px] font-medium text-slate-500">{DOW_SHORT[d.dow]}</span>
                  <span
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm ${
                      today ? 'border-2 border-blue-600 text-blue-700 font-semibold' : 'text-slate-800'
                    }`}
                  >
                    {parts(d.date).day}
                  </span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${d.kind === 'SHIFT' ? 'bg-blue-600' : 'bg-transparent'}`}
                    aria-hidden="true"
                  />
                </a>
              )
            })}
          </div>

          {/* One row per day */}
          <ol className="divide-y divide-slate-100">
            {person.days.map((d) => (
              <DayRow key={d.date} day={d} today={d.date === todayKey} />
            ))}
          </ol>
        </div>

        {/* Preferences */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Your preferences</h2>
            <button type="button" onClick={() => setPrefsOpen(true)} className="text-xs font-medium text-blue-700 hover:underline">
              {preference ? 'Change' : 'Set them'}
            </button>
          </div>
          {preference ? (
            <dl className="text-sm space-y-2">
              <Pref k="Weekly hours" v={preference.weeklyHours ? `${preference.weeklyHours} hours` : 'No preference'} />
              <Pref k="Where" v={preference.location === 'WFH' ? 'From home' : preference.location === 'HYBRID' ? 'Hybrid' : preference.location === 'OFFICE' ? 'In the office' : 'No preference'} />
              <Pref k="Days" v={preference.preferredDays.length ? preference.preferredDays.join(', ') : 'No preference'} />
              <Pref k="On call" v={preference.onCall ? 'Available' : 'No'} />
              <Pref k="Standby list" v={preference.standby ? 'Opted in' : 'No'} />
              <Pref k="From" v={(() => { const p = parts(preference.effectiveFrom); return `${p.day} ${p.month} ${p.year}` })()} />
            </dl>
          ) : (
            <p className="text-xs text-slate-500 leading-relaxed">
              Tell whoever builds the schedule how many hours you would like, where, and on which days.
            </p>
          )}
          <p className="text-[11px] text-slate-400 leading-relaxed pt-2 border-t border-slate-100">
            A preference is shown to whoever plans the week. It does not change your shifts on its own.
          </p>
        </aside>
      </div>

      <PreferencesDialog
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        initial={preference}
        designation={designation}
        todayKey={todayKey}
      />
    </div>
  )
}

function DayRow({ day, today }: { day: DayPlan; today: boolean }) {
  const p = parts(day.date)
  return (
    <li id={`day-${day.date}`} className={`flex gap-5 px-5 py-4 scroll-mt-4 ${today ? 'bg-blue-50/70' : ''}`}>
      <div className="w-12 flex-shrink-0 text-center">
        <p className={`text-[11px] font-medium ${today ? 'text-blue-700' : 'text-slate-500'}`}>{DOW_SHORT[day.dow]}</p>
        <p className={`text-2xl font-semibold leading-tight ${today ? 'text-blue-700' : 'text-slate-900'}`}>{p.day}</p>
      </div>

      <div className="min-w-0 flex-1">
        {day.kind === 'SHIFT' && day.startMin != null && day.endMin != null ? (
          <>
            <p className="text-base font-semibold text-slate-900">
              {fmtTime(day.startMin)} – {fmtTime(day.endMin)}
            </p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
              <span className="inline-flex items-center gap-1">
                {day.location === 'WFH' ? <Home className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                {day.location === 'WFH' ? 'From home' : 'Office'}
              </span>
              {day.breakMin > 0 && (
                <span className="inline-flex items-center gap-1"><Coffee className="w-3.5 h-3.5" /> Lunch {day.breakMin === 60 ? '1 hour' : `${day.breakMin} minutes`}</span>
              )}
              <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {hoursLabel(day.hours)}</span>
            </p>
          </>
        ) : (
          <p className={`text-sm ${day.kind === 'LEAVE' ? 'text-amber-800 font-medium' : day.kind === 'HOLIDAY' ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
            {day.kind === 'LEAVE' ? 'On leave' : day.kind === 'HOLIDAY' ? 'Holiday' : 'No assigned shift'}
          </p>
        )}

        {day.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {day.tags.map((t) => (
              <span
                key={t}
                className={`text-[11px] px-2 py-0.5 rounded-full border ${
                  day.kind === 'LEAVE' ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : t === 'Extra shift' ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {today && (
        <span className="self-start inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
          <CalendarDays className="w-3 h-3" /> Today
        </span>
      )}
    </li>
  )
}

function Pref({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className="text-slate-900 text-right">{v}</dd>
    </div>
  )
}
