/**
 * Shared leave-day math — used by the submit endpoint, the preview endpoint,
 * and the approval writeback so all three can never disagree.
 */

import { dayKey, isSameDay } from '@/lib/date-utils'

export type LeaveDayOpts = {
  firstDayHalf?: boolean
  lastDayHalf?: boolean
  holidayDates?: Set<string>
}

/**
 * Count chargeable leave days between two dates (inclusive), applying:
 *   1. Weekend rule           — Sat/Sun skipped by default
 *   2. Sandwich rule          — if the same request brackets a weekend (covers
 *                               BOTH the preceding Friday AND following Monday),
 *                               the Sat+Sun in between count.
 *   3. Public-holiday rule    — days marked as `Holiday(type='PUBLIC')` are
 *                               always free (paid holiday — no balance deducted).
 *   4. Half-day flags         — firstDayHalf / lastDayHalf each subtract 0.5.
 */
export function countWorkingDays(start: Date, end: Date, opts: LeaveDayOpts = {}): number {
  const { firstDayHalf = false, lastDayHalf = false, holidayDates = new Set<string>() } = opts
  const s = new Date(start); s.setHours(0, 0, 0, 0)
  const e = new Date(end); e.setHours(23, 59, 59, 999)

  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    const day = cur.getDay()
    const key = dayKey(cur)
    const isHoliday = holidayDates.has(key)
    if (isHoliday) {
      // Public holiday — always free, doesn't charge balance
    } else if (day !== 0 && day !== 6) {
      count++
    } else {
      // Sandwich check
      const friBefore = new Date(cur)
      const monAfter = new Date(cur)
      if (day === 6) {
        friBefore.setDate(cur.getDate() - 1)
        monAfter.setDate(cur.getDate() + 2)
      } else {
        friBefore.setDate(cur.getDate() - 2)
        monAfter.setDate(cur.getDate() + 1)
      }
      friBefore.setHours(0, 0, 0, 0)
      monAfter.setHours(0, 0, 0, 0)
      if (friBefore >= s && monAfter <= e) count++
    }
    cur.setDate(cur.getDate() + 1)
  }

  // Apply half-day reductions. Single-day request with either flag = 0.5 total.
  if (count > 0) {
    const sameDay = isSameDay(start, end)
    if (firstDayHalf) count -= 0.5
    if (lastDayHalf && !(sameDay && firstDayHalf)) count -= 0.5
  }
  return Math.max(0, count)
}

export type LeaveDayMark = {
  /** YYYY-MM-DD (local) */
  date: string
  /** L = full leave, HD = half day, WE = weekend (skipped), HOLIDAY = public holiday (skipped) */
  mark: 'L' | 'HD' | 'WE' | 'HOLIDAY'
}

/**
 * Per-day attendance impact of a leave range — exactly mirrors the
 * writeback loop in /api/leave/[id]/approve (weekends + PUBLIC holidays
 * skipped, first/last half flags → HD).
 */
export function buildLeaveDayMarks(
  start: Date,
  end: Date,
  opts: LeaveDayOpts = {},
): LeaveDayMark[] {
  const { firstDayHalf = false, lastDayHalf = false, holidayDates = new Set<string>() } = opts
  const s = new Date(start); s.setHours(0, 0, 0, 0)
  const e = new Date(end); e.setHours(0, 0, 0, 0)

  const marks: LeaveDayMark[] = []
  const cursor = new Date(s)
  while (cursor <= e) {
    const dow = cursor.getDay()
    const k = dayKey(cursor)
    if (holidayDates.has(k)) {
      marks.push({ date: k, mark: 'HOLIDAY' })
    } else if (dow === 0 || dow === 6) {
      marks.push({ date: k, mark: 'WE' })
    } else {
      const isFirst = cursor.getTime() === s.getTime()
      const isLast = cursor.getTime() === e.getTime()
      const isHalf = (isFirst && firstDayHalf) || (isLast && lastDayHalf)
      marks.push({ date: k, mark: isHalf ? 'HD' : 'L' })
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return marks
}
