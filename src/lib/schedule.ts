/**
 * Who works when — worked out, not stored.
 *
 * Everybody at Convertt has a standing pattern on their record: the days
 * (workDays — Mon to Fri for all twenty-six today) and the hours (timings —
 * "10am-7pm" for most, written four or five different ways). A week's
 * schedule is that pattern with three things laid over it, in this order:
 *
 *   1. holidays HR has applied — no shift; a WFH-type holiday moves it home.
 *      A holiday on the calendar that HR has not applied changes nothing,
 *      because HR decides each one against workload; it is shown as a tag.
 *   2. approved leave — no shift, or half of one on a half day. An approved
 *      work-from-home request keeps the shift and moves it home.
 *   3. ScheduleShift rows — the exceptions somebody made by hand: an extra
 *      shift, changed hours, a day off.
 *
 * Nothing about the pattern is copied into rows, so changing someone's hours
 * is one edit on their record rather than a year of shifts to rewrite.
 *
 * Lunch is an hour, as the employment agreement says, so a 10am–7pm shift is
 * 8 scheduled hours — the same 8 the attendance grid marks for a present day
 * and the 8 payroll's standard day is set to.
 *
 * Server only: buildSchedule reads the database.
 */
import { prisma } from '@/lib/prisma'

export const DEFAULT_START = 10 * 60
export const DEFAULT_END = 19 * 60
/** The employment agreement's hour for lunch. */
export const DEFAULT_BREAK = 60
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Pakistan does not observe daylight saving, so this is exact all year. */
const PK_OFFSET_MS = 5 * 60 * 60 * 1000

/**
 * "10am-7pm", "10:00 AM - 07:00 PM", "10 AM - 7 PM", "11 AM - 8 PM" and
 * "10-7" all read as minutes past midnight. Anything that does not read as a
 * sensible working day comes back null rather than as a guess.
 */
export function parseTimings(raw: string | null | undefined): { startMin: number; endMin: number } | null {
  if (!raw) return null
  const s = raw.toLowerCase().replace(/\s+/g, '').replace(/to/g, '-')
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?[-–—]+(\d{1,2})(?::(\d{2}))?(am|pm)?$/)
  if (!m) return null
  const clock = (h: string, mm: string | undefined, ap: string | undefined) => {
    const hr = Number(h)
    const mins = Number(mm ?? 0)
    if (hr > 23 || mins > 59) return NaN
    let h24 = hr
    if (ap === 'am') h24 = hr % 12
    else if (ap === 'pm') h24 = (hr % 12) + 12
    return h24 * 60 + mins
  }
  const startMin = clock(m[1], m[2], m[3])
  let endMin = clock(m[4], m[5], m[6])
  if (Number.isNaN(startMin) || Number.isNaN(endMin)) return null
  // An end with no am/pm ("10-7") is afternoon when that is the only reading
  // that puts it after the start.
  if (!m[6] && endMin <= startMin && endMin < 12 * 60) endMin += 12 * 60
  if (endMin <= startMin || endMin - startMin > 16 * 60) return null
  return { startMin, endMin }
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function utcDay(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

/** The Monday on or before a date, at UTC midnight. */
export function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = x.getUTCDay()
  return addDays(x, dow === 0 ? -6 : 1 - dow)
}

/** Today's date in Lahore. The server runs on UTC, five hours behind. */
export function todayKeyPK(): string {
  return isoDay(new Date(Date.now() + PK_OFFSET_MS))
}

/** 600 → "10:00 AM". */
export function fmtTime(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

/** Working hours in a shift, to the quarter hour. */
export function shiftHours(startMin: number, endMin: number, breakMin: number): number {
  return Math.max(0, Math.round(((endMin - startMin - breakMin) / 60) * 4) / 4)
}

export type DayKind = 'SHIFT' | 'OFF' | 'HOLIDAY' | 'LEAVE'

export interface DayPlan {
  date: string
  dow: number
  kind: DayKind
  startMin: number | null
  endMin: number | null
  breakMin: number
  location: 'OFFICE' | 'WFH'
  hours: number
  /** Short labels the day carries: a holiday's name, "Casual leave", "Extra shift"… */
  tags: string[]
  /** A half day of leave — half the shift is worked. */
  half: boolean
  /** The hand-made exception behind the day, when there is one. */
  shiftId: string | null
  shiftKind: string | null
}

export interface PersonSchedule {
  employeeId: string
  name: string
  department: string | null
  designation: string | null
  /** "Mon–Fri · 10:00 AM – 7:00 PM" */
  pattern: string
  /** No hours on record, so the office's 10am–7pm was used. */
  assumed: boolean
  days: DayPlan[]
  hours: number
  shifts: number
}

function leaveLabel(type: string): string {
  const s = type.replace(/_/g, ' ').toLowerCase()
  const cap = s.charAt(0).toUpperCase() + s.slice(1)
  return s.includes('leave') ? cap : `${cap} leave`
}

function daysLabel(dows: number[]): string {
  const sorted = [...dows].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
  const key = sorted.join(',')
  if (key === '1,2,3,4,5') return 'Mon–Fri'
  if (key === '1,2,3,4,5,6') return 'Mon–Sat'
  return sorted.map((d) => DOW[d]).join(', ')
}

/**
 * The schedule for these people across `days` days from `from` (a UTC
 * midnight). People come back sorted by name.
 */
export async function buildSchedule(employeeIds: string[], from: Date, days: number): Promise<PersonSchedule[]> {
  if (employeeIds.length === 0) return []
  const to = addDays(from, days)

  const [people, holidays, leaves, overrides] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: {
        id: true, fullName: true, designation: true, timings: true, workDays: true,
        joiningDate: true, exitDate: true, department: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: from, lt: to } },
      select: { date: true, name: true, type: true, applied: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: 'APPROVED',
        fromDate: { lt: to },
        toDate: { gte: from },
      },
      select: {
        employeeId: true, category: true, leaveType: true,
        fromDate: true, toDate: true, firstDayHalf: true, lastDayHalf: true,
      },
    }),
    prisma.scheduleShift.findMany({
      where: { employeeId: { in: employeeIds }, date: { gte: from, lt: to } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const holidayOn = new Map(holidays.map((h) => [isoDay(h.date), h]))

  // Each person's leave, day by day, within the window.
  const leaveOn = new Map<string, { category: string; label: string; half: boolean }>()
  for (const l of leaves) {
    const first = isoDay(l.fromDate)
    const last = isoDay(l.toDate)
    for (let d = l.fromDate < from ? new Date(from) : new Date(l.fromDate); d < to && isoDay(d) <= last; d = addDays(d, 1)) {
      const key = isoDay(d)
      const half = (l.firstDayHalf && key === first) || (l.lastDayHalf && key === last)
      leaveOn.set(`${l.employeeId}|${key}`, {
        category: l.category,
        label: l.category === 'WFH' ? 'Working from home' : leaveLabel(l.leaveType),
        half,
      })
    }
  }

  const overridesOn = new Map<string, typeof overrides>()
  for (const o of overrides) {
    const k = `${o.employeeId}|${isoDay(o.date)}`
    overridesOn.set(k, [...(overridesOn.get(k) ?? []), o])
  }

  return people.map((p) => {
    const parsed = parseTimings(p.timings)
    const startMin = parsed?.startMin ?? DEFAULT_START
    const endMin = parsed?.endMin ?? DEFAULT_END
    const workDows = (p.workDays ?? '')
      .split(',')
      .map((d) => DOW.indexOf(d.trim() as (typeof DOW)[number]))
      .filter((d) => d >= 0)

    const plans: DayPlan[] = []
    for (let i = 0; i < days; i++) {
      const d = addDays(from, i)
      const key = isoDay(d)
      const dow = d.getUTCDay()
      const employed = (!p.joiningDate || p.joiningDate <= d) && (!p.exitDate || p.exitDate >= d)

      let plan: DayPlan = employed && workDows.includes(dow)
        ? {
          date: key, dow, kind: 'SHIFT', startMin, endMin, breakMin: DEFAULT_BREAK, location: 'OFFICE',
          hours: shiftHours(startMin, endMin, DEFAULT_BREAK), tags: [], half: false, shiftId: null, shiftKind: null,
        }
        : {
          date: key, dow, kind: 'OFF', startMin: null, endMin: null, breakMin: 0, location: 'OFFICE',
          hours: 0, tags: employed ? [] : [p.joiningDate && p.joiningDate > d ? 'Before joining' : 'After leaving'],
          half: false, shiftId: null, shiftKind: null,
        }

      // 1. Holidays.
      const h = holidayOn.get(key)
      if (h && employed) {
        if (h.applied && h.type === 'WFH') {
          if (plan.kind === 'SHIFT') plan = { ...plan, location: 'WFH' }
          plan.tags.push(`${h.name} · WFH`)
        } else if (h.applied) {
          if (plan.kind === 'SHIFT') plan = { ...plan, kind: 'HOLIDAY', startMin: null, endMin: null, breakMin: 0, hours: 0 }
          plan.tags.push(h.name)
        } else {
          plan.tags.push(`${h.name} (not applied)`)
        }
      }

      // 2. Approved leave.
      const lv = leaveOn.get(`${p.id}|${key}`)
      if (lv && plan.kind === 'SHIFT') {
        if (lv.category === 'WFH') {
          plan = { ...plan, location: 'WFH' }
          plan.tags.push(lv.label)
        } else if (lv.half) {
          plan = { ...plan, half: true, hours: Math.round((plan.hours / 2) * 4) / 4 }
          plan.tags.push(`${lv.label} (half day)`)
        } else {
          plan = { ...plan, kind: 'LEAVE', startMin: null, endMin: null, breakMin: 0, hours: 0 }
          plan.tags.push(lv.label)
        }
      }

      // 3. Hand-made exceptions, oldest first, so the latest one stands.
      for (const o of overridesOn.get(`${p.id}|${key}`) ?? []) {
        if (o.kind === 'OFF') {
          plan = { ...plan, kind: 'OFF', startMin: null, endMin: null, breakMin: 0, hours: 0, half: false, shiftId: o.id, shiftKind: o.kind }
          plan.tags.push(o.note || 'Day off')
        } else if (o.startMin != null && o.endMin != null) {
          const loc = o.location === 'WFH' ? 'WFH' : 'OFFICE'
          plan = {
            ...plan, kind: 'SHIFT', startMin: o.startMin, endMin: o.endMin, breakMin: o.breakMin, location: loc,
            hours: shiftHours(o.startMin, o.endMin, o.breakMin), half: false, shiftId: o.id, shiftKind: o.kind,
          }
          plan.tags.push(o.kind === 'EXTRA' ? 'Extra shift' : 'Changed hours')
          if (o.note) plan.tags.push(o.note)
        }
      }

      plans.push(plan)
    }

    return {
      employeeId: p.id,
      name: p.fullName,
      department: p.department?.name ?? null,
      designation: p.designation,
      pattern: `${daysLabel(workDows)} · ${fmtTime(startMin)} – ${fmtTime(endMin)}`,
      assumed: !parsed,
      days: plans,
      hours: plans.reduce((s, x) => s + x.hours, 0),
      shifts: plans.filter((x) => x.kind === 'SHIFT').length,
    }
  })
}
