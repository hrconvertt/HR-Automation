'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Cake, Trophy, Star, ShieldCheck, Plane } from 'lucide-react'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type ChipKind = 'holiday' | 'birthday' | 'anniversary' | 'event' | 'probation' | 'leave'

interface Chip {
  kind: ChipKind
  label: string
  detail?: string
}

interface Props {
  year: number
  month: number
  isHR: boolean
  employees: { id: string; fullName: string; dob: string | null; joiningDate: string }[]
  companyEvents: { id: string; title: string; eventDate: string; category: string; location: string | null }[]
  probationEnds: { id: string; endDate: string; employeeName: string }[]
  leaves: { id: string; fromDate: string; toDate: string; leaveType: string; employeeName: string }[]
  dbHolidays: { id: string; name: string; date: string; type: string }[]
  pkHolidays: { date: string; name: string; type: 'PUBLIC' | 'OPTIONAL' }[]
}

const CHIP_TONE: Record<ChipKind, string> = {
  holiday: 'bg-rose-100 text-rose-800 border-rose-200',
  birthday: 'bg-pink-100 text-pink-800 border-pink-200',
  anniversary: 'bg-amber-100 text-amber-800 border-amber-200',
  event: 'bg-blue-100 text-blue-800 border-blue-200',
  probation: 'bg-violet-100 text-violet-800 border-violet-200',
  leave: 'bg-slate-100 text-slate-700 border-slate-200',
}

const FILTER_LABELS: Record<ChipKind, string> = {
  holiday: 'Holidays',
  birthday: 'Birthdays',
  anniversary: 'Anniversaries',
  event: 'Events',
  probation: 'Probation Ends',
  leave: 'Leaves',
}

export function CalendarGrid({
  year, month, isHR,
  employees, companyEvents, probationEnds, leaves, dbHolidays, pkHolidays,
}: Props) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [activeFilters, setActiveFilters] = useState<Set<ChipKind>>(
    new Set<ChipKind>(['holiday', 'birthday', 'anniversary', 'event', 'probation', 'leave']),
  )

  // Compute chips per date (YYYY-MM-DD key)
  const chipsByDate = useMemo(() => {
    const map = new Map<string, Chip[]>()
    const push = (key: string, chip: Chip) => {
      const arr = map.get(key) ?? []
      arr.push(chip)
      map.set(key, arr)
    }

    // Holidays — merge PK + DB
    const allHolidays = [
      ...pkHolidays.map((h) => ({ date: h.date.slice(0, 10), name: h.name })),
      ...dbHolidays.map((h) => ({ date: h.date.slice(0, 10), name: h.name })),
    ]
    for (const h of allHolidays) push(h.date, { kind: 'holiday', label: h.name })

    // Birthdays (anyone whose dob month/day falls in the viewed month/year)
    for (const e of employees) {
      if (!e.dob) continue
      const d = new Date(e.dob)
      if (d.getMonth() === month) {
        const key = ymd(year, month, d.getDate())
        push(key, { kind: 'birthday', label: e.fullName, detail: 'Birthday' })
      }
    }

    // Anniversaries (years > 0)
    for (const e of employees) {
      const d = new Date(e.joiningDate)
      if (d.getMonth() === month) {
        const years = year - d.getFullYear()
        if (years > 0) {
          const key = ymd(year, month, d.getDate())
          push(key, { kind: 'anniversary', label: e.fullName, detail: `${years}-year anniversary` })
        }
      }
    }

    // Company events
    for (const e of companyEvents) {
      const key = e.eventDate.slice(0, 10)
      push(key, { kind: 'event', label: e.title, detail: e.location ?? undefined })
    }

    // Probation ends (HR only)
    if (isHR) {
      for (const p of probationEnds) {
        const key = p.endDate.slice(0, 10)
        push(key, { kind: 'probation', label: p.employeeName, detail: 'Probation ends' })
      }
    }

    // Leaves — paint every day in [fromDate, toDate] that falls in this month
    for (const l of leaves) {
      const start = new Date(l.fromDate)
      const end = new Date(l.toDate)
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getMonth() !== month || d.getFullYear() !== year) continue
        const key = ymd(year, month, d.getDate())
        push(key, { kind: 'leave', label: l.employeeName, detail: l.leaveType })
      }
    }

    return map
  }, [year, month, isHR, employees, companyEvents, probationEnds, leaves, dbHolidays, pkHolidays])

  function ymd(y: number, m: number, d: number) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  function goto(deltaMonths: number) {
    const d = new Date(year, month + deltaMonths, 1)
    router.push(`/dashboard/calendar?year=${d.getFullYear()}&month=${d.getMonth()}`)
  }

  function toggleFilter(k: ChipKind) {
    const next = new Set(activeFilters)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    setActiveFilters(next)
  }

  function chipsFor(dateKey: string): Chip[] {
    const chips = chipsByDate.get(dateKey) ?? []
    return chips.filter((c) => activeFilters.has(c.kind))
  }

  // Build month grid: leading blanks + days + trailing blanks (6 rows total)
  const firstOfMonth = new Date(year, month, 1)
  const startWeekday = firstOfMonth.getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: ({ day: number; key: string } | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, key: ymd(year, month, d) })
  while (cells.length < 42) cells.push(null)

  const todayStr = ymd(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
  const selectedChips = selectedDate ? (chipsByDate.get(selectedDate) ?? []).filter((c) => activeFilters.has(c.kind)) : []

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
            <p className="text-white/85 text-sm mt-1">Holidays, birthdays, anniversaries, events, probation milestones, and team leaves in one view.</p>
          </div>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => goto(-1)}><ChevronLeft className="w-4 h-4" /></Button>
            <h2 className="text-lg font-semibold text-slate-900 min-w-[180px] text-center">{MONTH_NAMES[month]} {year}</h2>
            <Button variant="outline" size="sm" onClick={() => goto(1)}><ChevronRight className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => {
              const d = new Date()
              router.push(`/dashboard/calendar?year=${d.getFullYear()}&month=${d.getMonth()}`)
            }}>Today</Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['holiday', 'birthday', 'anniversary', 'event', 'probation', 'leave'] as const).map((k) => {
              if (k === 'probation' && !isHR) return null
              const active = activeFilters.has(k)
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleFilter(k)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${active ? CHIP_TONE[k] : 'bg-white text-slate-400 border-slate-200'}`}
                >
                  {FILTER_LABELS[k]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wider py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            if (!cell) return <div key={i} className="bg-slate-50/60 rounded min-h-[88px]" />
            const chips = chipsFor(cell.key)
            const isToday = cell.key === todayStr
            const isSelected = cell.key === selectedDate
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => setSelectedDate(cell.key)}
                className={`text-left rounded border bg-white p-1.5 min-h-[88px] hover:border-blue-300 transition-colors ${isToday ? 'border-blue-500 ring-1 ring-blue-200' : 'border-slate-200'} ${isSelected ? 'bg-blue-50/50' : ''}`}
              >
                <p className={`text-xs font-semibold ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>{cell.day}</p>
                <div className="mt-1 space-y-0.5 overflow-hidden">
                  {chips.slice(0, 3).map((c, idx) => (
                    <div key={idx} className={`truncate text-[9px] px-1 py-0.5 rounded border ${CHIP_TONE[c.kind]}`}>{c.label}</div>
                  ))}
                  {chips.length > 3 && <p className="text-[9px] text-slate-500 px-1">+{chips.length - 3} more</p>}
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      {selectedDate && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </h3>
            <button onClick={() => setSelectedDate(null)} className="text-xs text-slate-500 hover:underline">Close</button>
          </div>
          {selectedChips.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing scheduled.</p>
          ) : (
            <ul className="space-y-2">
              {selectedChips.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <ChipIcon kind={c.kind} />
                  <div>
                    <Badge className={CHIP_TONE[c.kind]}>{FILTER_LABELS[c.kind].replace(/s$/, '')}</Badge>
                    <p className="text-slate-900 font-medium mt-1">{c.label}</p>
                    {c.detail && <p className="text-xs text-slate-500">{c.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}

function ChipIcon({ kind }: { kind: ChipKind }) {
  const cls = 'w-4 h-4 mt-0.5'
  if (kind === 'birthday') return <Cake className={cls} />
  if (kind === 'anniversary') return <Trophy className={cls} />
  if (kind === 'holiday') return <Star className={cls} />
  if (kind === 'probation') return <ShieldCheck className={cls} />
  if (kind === 'leave') return <Plane className={cls} />
  return <CalendarIcon className={cls} />
}
