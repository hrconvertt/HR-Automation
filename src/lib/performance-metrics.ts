// ─── Time & Work auto-scoring for performance reviews ──────────────────────
// Convertt's reviews are based on "time taken and work done in that time."
// This module turns existing AttendanceLog + LeaveRequest + Goal data into
// concrete numbers HR/managers can see alongside the qualitative review.
//
// Three exports:
//   - cycleWindow(reviewType, reviewPeriod): the date range to measure
//   - computeTimeMetrics(employeeId, start, end): all the numbers
//   - suggestedOverallRating(review): the blended 60/20/20 suggestion

import { prisma } from '@/lib/prisma'

// ────────────────────────────────────────────────────────────────────────────
// cycleWindow
// ────────────────────────────────────────────────────────────────────────────
// Turns ("BIANNUAL", "H1-2026") → { start: 2026-01-01, end: 2026-06-30 }
// Legacy review types (MONTHLY_11, QUARTERLY) return null — we skip metrics
// for those because the window semantics aren't well-defined.

export function cycleWindow(
  reviewType: string,
  reviewPeriod: string,
): { start: Date; end: Date } | null {
  if (!reviewType || !reviewPeriod) return null

  if (reviewType === 'BIANNUAL') {
    // "H1-2026" or "H2-2026"
    const m = /^H([12])-(\d{4})$/i.exec(reviewPeriod.trim())
    if (!m) return null
    const half = Number(m[1])
    const year = Number(m[2])
    if (half === 1) {
      return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 5, 30, 23, 59, 59)) }
    }
    return { start: new Date(Date.UTC(year, 6, 1)), end: new Date(Date.UTC(year, 11, 31, 23, 59, 59)) }
  }

  if (reviewType === 'ANNUAL') {
    // Period is just "2026"
    const m = /^(\d{4})$/.exec(reviewPeriod.trim())
    if (!m) return null
    const year = Number(m[1])
    return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31, 23, 59, 59)) }
  }

  if (reviewType === 'PROBATION') {
    // Fall back to year if we don't have an employee context here.
    // The actual probation start/end is patched in computeTimeMetrics if available.
    const m = /^(\d{4})$/.exec(reviewPeriod.trim())
    if (!m) return null
    const year = Number(m[1])
    return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31, 23, 59, 59)) }
  }

  // Legacy: MONTHLY_11, QUARTERLY — skip
  return null
}

// ────────────────────────────────────────────────────────────────────────────
// computeTimeMetrics
// ────────────────────────────────────────────────────────────────────────────

export interface TimeMetrics {
  daysWorked: number
  daysAbsent: number
  daysOnLeave: number
  lateArrivalCount: number
  avgHoursPerDay: number
  goalsOnTime: number
  goalsLate: number
  timeScore: number
}

export async function computeTimeMetrics(
  employeeId: string,
  start: Date,
  end: Date,
): Promise<TimeMetrics> {
  // ── Attendance: count PRESENT / ABSENT / LATE rows in the cycle window ──
  // Schema: AttendanceLog.status ∈ PRESENT | ABSENT | LATE | HALF_DAY | HOLIDAY | WEEKEND | LEAVE
  // We treat LATE rows as worked (an employee who came in late still worked).
  const logs = await prisma.attendanceLog.findMany({
    where: {
      employeeId,
      date: { gte: start, lte: end },
    },
    select: {
      status: true,
      hoursWorked: true,
      lateMinutes: true,
    },
  })

  let daysWorked = 0
  let daysAbsent = 0
  let lateArrivalCount = 0
  let totalHours = 0
  let hoursDays = 0

  for (const l of logs) {
    const s = l.status
    if (s === 'PRESENT' || s === 'LATE' || s === 'HALF_DAY') {
      daysWorked++
      if (l.hoursWorked != null) {
        totalHours += l.hoursWorked
        hoursDays++
      }
    } else if (s === 'ABSENT') {
      daysAbsent++
    }
    // Lateness: explicit LATE status OR lateMinutes > 0
    if (s === 'LATE' || (l.lateMinutes != null && l.lateMinutes > 0)) {
      lateArrivalCount++
    }
  }

  const avgHoursPerDay = hoursDays > 0 ? totalHours / hoursDays : 0

  // ── Leave: count distinct dates with APPROVED leave that fall in window ──
  const leaves = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      status: 'APPROVED',
      // Overlap: leave.fromDate <= window.end AND leave.toDate >= window.start
      fromDate: { lte: end },
      toDate: { gte: start },
    },
    select: { fromDate: true, toDate: true, days: true },
  })

  // Sum overlapping days (clamp to window). Simpler than enumerating dates.
  let daysOnLeave = 0
  for (const lv of leaves) {
    const s = lv.fromDate < start ? start : lv.fromDate
    const e = lv.toDate > end ? end : lv.toDate
    const msPerDay = 24 * 60 * 60 * 1000
    const span = Math.max(0, Math.floor((e.getTime() - s.getTime()) / msPerDay) + 1)
    // If the leave was a half-day and fully in window, use the float `days`
    // when it's smaller than the span (handles 0.5-day leaves cleanly).
    if (lv.fromDate >= start && lv.toDate <= end && lv.days < span) {
      daysOnLeave += lv.days
    } else {
      daysOnLeave += span
    }
  }
  daysOnLeave = Math.round(daysOnLeave)

  // ── Goals: on-time vs late ──
  // Look at goals linked to this employee whose updatedAt falls in cycle.
  // "On-time" heuristic:
  //   - status=COMPLETED → on-time (it got done in the cycle)
  //   - status=AT_RISK or IN_PROGRESS at cycle end → late
  //   - NOT_STARTED / ON_TRACK → neither counted
  const goals = await prisma.goal.findMany({
    where: {
      employeeId,
      // Goal was active during the cycle: created before window end
      // AND (not yet completed OR completed during the window)
      createdAt: { lte: end },
    },
    select: { status: true, updatedAt: true, target: true },
  })

  let goalsOnTime = 0
  let goalsLate = 0
  for (const g of goals) {
    if (g.status === 'COMPLETED') {
      // If target is a parseable date string and completion happened after it → late
      const parsed = g.target ? Date.parse(g.target) : NaN
      if (!Number.isNaN(parsed) && g.updatedAt.getTime() > parsed) {
        goalsLate++
      } else {
        goalsOnTime++
      }
    } else if (g.status === 'AT_RISK' || g.status === 'IN_PROGRESS') {
      // Still open at the end of cycle → counts as late delivery
      goalsLate++
    }
    // NOT_STARTED / ON_TRACK / anything else → don't count either way
  }

  // ── Derived timeScore on 1-5 ──
  const attendancePct =
    daysWorked + daysAbsent > 0 ? daysWorked / (daysWorked + daysAbsent) : 1
  const punctualityPct =
    daysWorked > 0 ? 1 - lateArrivalCount / daysWorked : 1
  const onTimePct =
    goalsOnTime + goalsLate > 0
      ? goalsOnTime / (goalsOnTime + goalsLate)
      : 1

  const raw =
    5 *
    (0.5 * attendancePct +
      0.25 * Math.max(0, punctualityPct) +
      0.25 * onTimePct)
  const bounded = Math.max(1, Math.min(5, raw))
  const timeScore = Math.round(bounded * 10) / 10

  return {
    daysWorked,
    daysAbsent,
    daysOnLeave,
    lateArrivalCount,
    avgHoursPerDay: Math.round(avgHoursPerDay * 10) / 10,
    goalsOnTime,
    goalsLate,
    timeScore,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// suggestedOverallRating
// ────────────────────────────────────────────────────────────────────────────
// Blended suggestion HR can take or override:
//   60% work (individualScore) + 20% time (timeScore) + 20% behavioral (behavioralAvg)
// All three components are on a 1-5 scale.

export function suggestedOverallRating(review: {
  individualScore?: number | null
  timeScore?: number | null
  behavioralAvg?: number | null
}): number | null {
  const w = review.individualScore
  const t = review.timeScore
  const b = review.behavioralAvg
  if (w == null || t == null || b == null) return null
  const raw = 0.6 * w + 0.2 * t + 0.2 * b
  const bounded = Math.max(1, Math.min(5, raw))
  return Math.round(bounded * 10) / 10
}
