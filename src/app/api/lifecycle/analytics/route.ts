import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

/**
 * Employee Lifecycle — analytics.
 *
 * Company-wide workforce analytics for the lifecycle overview dashboard:
 * stage counts, headcount trend, joiners vs exiters, tenure distribution,
 * annualised attrition, department + gender splits and upcoming (30d) events.
 *
 * HEADCOUNT / TENURE / ATTRITION ONLY — no salary or compensation figures.
 *
 * Gate: HR_ADMIN + EXECUTIVE only (honours hr_preview_role) — identical to the
 * overview route, since this exposes the same workforce-wide data.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const previewRole =
    payload.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? payload.role
  if (effectiveRole !== 'HR_ADMIN' && effectiveRole !== 'EXECUTIVE') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const in30Days = new Date(now.getTime() + 30 * 24 * 3600 * 1000)

  // First day of the month N months back (N=0 → current month start).
  const monthStartsBack = (n: number) => new Date(now.getFullYear(), now.getMonth() - n, 1)
  const twelveMonthsAgo = monthStartsBack(11) // start of the 12-month window

  const [
    employees,
    departments,
    activeLoas,
    openExitClearances,
    onboardingOpen,
    probationDue,
    loaReturns,
    exitUpcoming,
  ] = await Promise.all([
    // Whole workforce — the minimal fields needed for every computed metric.
    // No compensation columns are selected.
    prisma.employee.findMany({
      select: {
        id: true,
        joiningDate: true,
        exitDate: true,
        status: true,
        gender: true,
        departmentId: true,
        department: { select: { name: true } },
      },
    }),
    prisma.department.findMany({ select: { id: true, name: true } }),
    prisma.leaveOfAbsence.count({ where: { status: { in: ['ACTIVE', 'EXTENDED'] } } }).catch(() => 0),
    prisma.exitClearance.count({ where: { status: { not: 'COMPLETED' } } }).catch(() => 0),
    prisma.onboardingChecklist.count({ where: { status: { not: 'COMPLETED' } } }).catch(() => 0),
    // Upcoming (30d): probation confirmations due
    prisma.probationRecord
      .findMany({
        where: {
          endDate: { gte: now, lte: in30Days },
          status: { in: ['ACTIVE', 'UNDER_REVIEW'] },
        },
        select: { id: true, endDate: true, employee: { select: { id: true, fullName: true } } },
        orderBy: { endDate: 'asc' },
        take: 25,
      })
      .catch(() => [] as { id: string; endDate: Date; employee: { id: string; fullName: string } | null }[]),
    // Upcoming (30d): LOA expected returns
    prisma.leaveOfAbsence
      .findMany({
        where: {
          expectedReturn: { gte: now, lte: in30Days },
          status: { in: ['ACTIVE', 'EXTENDED'] },
        },
        select: { id: true, expectedReturn: true, type: true, employee: { select: { id: true, fullName: true } } },
        orderBy: { expectedReturn: 'asc' },
        take: 25,
      })
      .catch(() => [] as { id: string; expectedReturn: Date; type: string; employee: { id: string; fullName: string } | null }[]),
    // Upcoming (30d): last working days (stage/contract ends)
    prisma.exitClearance
      .findMany({
        where: {
          lastWorkingDay: { gte: now, lte: in30Days },
          status: { not: 'COMPLETED' },
        },
        select: { id: true, lastWorkingDay: true, employee: { select: { id: true, fullName: true } } },
        orderBy: { lastWorkingDay: 'asc' },
        take: 25,
      })
      .catch(() => [] as { id: string; lastWorkingDay: Date | null; employee: { id: string; fullName: string } | null }[]),
  ])

  const EXITED_STATUSES = new Set(['RESIGNED', 'TERMINATED', 'LAYOFF', 'INACTIVE'])
  const isExited = (e: (typeof employees)[number]) =>
    e.exitDate != null || EXITED_STATUSES.has(e.status)

  // ── Headcount at end of a given instant ──────────────────────────────────
  // Employed if joined on/before `t` and not yet exited as of `t`.
  const headcountAt = (t: Date) =>
    employees.filter(
      (e) => e.joiningDate <= t && (e.exitDate == null || e.exitDate > t),
    ).length

  // ── Stage counts (current) ───────────────────────────────────────────────
  const activeCount = employees.filter((e) => e.status === 'ACTIVE').length
  const probationCount = employees.filter((e) => e.status === 'PROBATION').length
  const stages = {
    onboarding: onboardingOpen,
    probation: probationCount,
    active: activeCount,
    onLoa: activeLoas,
    offboarding: openExitClearances,
  }

  // ── 12-month trends ──────────────────────────────────────────────────────
  const months: {
    key: string
    label: string
    joiners: number
    exiters: number
    headcount: number
  }[] = []
  for (let i = 11; i >= 0; i--) {
    const start = monthStartsBack(i)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    const joiners = employees.filter((e) => e.joiningDate >= start && e.joiningDate < end).length
    const exiters = employees.filter(
      (e) => e.exitDate != null && e.exitDate >= start && e.exitDate < end,
    ).length
    // Headcount at the last instant of the month (or now for the current month)
    const asOf = end > now ? now : new Date(end.getTime() - 1)
    months.push({
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      label: start.toLocaleDateString('en-US', { month: 'short' }),
      joiners,
      exiters,
      headcount: headcountAt(asOf),
    })
  }

  // ── Tenure distribution (currently-employed only) ────────────────────────
  const tenureBuckets = [
    { key: '<3mo', label: '< 3 mo', count: 0 },
    { key: '3-6mo', label: '3–6 mo', count: 0 },
    { key: '6-12mo', label: '6–12 mo', count: 0 },
    { key: '1-2y', label: '1–2 yr', count: 0 },
    { key: '2y+', label: '2 yr+', count: 0 },
  ]
  const DAY = 24 * 3600 * 1000
  for (const e of employees) {
    if (isExited(e)) continue
    const days = (now.getTime() - e.joiningDate.getTime()) / DAY
    if (days < 90) tenureBuckets[0].count++
    else if (days < 182) tenureBuckets[1].count++
    else if (days < 365) tenureBuckets[2].count++
    else if (days < 730) tenureBuckets[3].count++
    else tenureBuckets[4].count++
  }

  // ── Attrition (trailing 12 months, annualised) ───────────────────────────
  // Formula: exits over the trailing 12 months ÷ average headcount, where
  // average headcount = (headcount 12 months ago + headcount today) / 2.
  const exits12mo = employees.filter(
    (e) => e.exitDate != null && e.exitDate >= twelveMonthsAgo && e.exitDate <= now,
  ).length
  const hcStart = headcountAt(twelveMonthsAgo)
  const hcNow = headcountAt(now)
  const avgHeadcount = (hcStart + hcNow) / 2
  const attritionRate = avgHeadcount > 0 ? Math.round((exits12mo / avgHeadcount) * 1000) / 10 : 0

  // ── Department split (currently-employed) ────────────────────────────────
  const deptMap = new Map<string, { name: string; count: number }>()
  for (const e of employees) {
    if (isExited(e)) continue
    const name = e.department?.name ?? 'Unassigned'
    const key = e.departmentId ?? '__none__'
    const cur = deptMap.get(key) ?? { name, count: 0 }
    cur.count++
    deptMap.set(key, cur)
  }
  const departmentSplit = Array.from(deptMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  // ── Gender split (currently-employed) ────────────────────────────────────
  let male = 0
  let female = 0
  let other = 0
  for (const e of employees) {
    if (isExited(e)) continue
    const g = (e.gender ?? '').toLowerCase()
    if (g.startsWith('m')) male++
    else if (g.startsWith('f')) female++
    else other++
  }
  const genderSplit = { male, female, other }

  // ── Headline chips ───────────────────────────────────────────────────────
  const joinedThisMonth = employees.filter(
    (e) => e.joiningDate >= monthStart && e.joiningDate < nextMonthStart,
  ).length
  const exitedThisMonth = employees.filter(
    (e) => e.exitDate != null && e.exitDate >= monthStart && e.exitDate < nextMonthStart,
  ).length

  // ── Upcoming (30d) merged list ───────────────────────────────────────────
  type Upcoming = {
    id: string
    kind: 'PROBATION' | 'LOA_RETURN' | 'LAST_DAY'
    label: string
    employeeId: string | null
    employeeName: string | null
    date: string
    href: string
  }
  const upcoming: Upcoming[] = []
  for (const p of probationDue) {
    upcoming.push({
      id: `prob-${p.id}`,
      kind: 'PROBATION',
      label: 'Probation confirmation due',
      employeeId: p.employee?.id ?? null,
      employeeName: p.employee?.fullName ?? null,
      date: p.endDate.toISOString(),
      href: '/dashboard/probation',
    })
  }
  for (const l of loaReturns) {
    upcoming.push({
      id: `loa-${l.id}`,
      kind: 'LOA_RETURN',
      label: `Return from ${l.type.toLowerCase().replace(/_/g, ' ')} leave`,
      employeeId: l.employee?.id ?? null,
      employeeName: l.employee?.fullName ?? null,
      date: l.expectedReturn.toISOString(),
      href: '/dashboard/lifecycle/loa',
    })
  }
  for (const x of exitUpcoming) {
    if (!x.lastWorkingDay) continue
    upcoming.push({
      id: `exit-${x.id}`,
      kind: 'LAST_DAY',
      label: 'Last working day',
      employeeId: x.employee?.id ?? null,
      employeeName: x.employee?.fullName ?? null,
      date: x.lastWorkingDay.toISOString(),
      href: '/dashboard/lifecycle/exit',
    })
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({
    stages,
    headline: {
      active: activeCount,
      joinedThisMonth,
      exitedThisMonth,
      attritionRate,
      probation: probationCount,
      onLoa: activeLoas,
    },
    months,
    tenureBuckets,
    attrition: {
      rate: attritionRate,
      exits12mo,
      avgHeadcount: Math.round(avgHeadcount * 10) / 10,
      headcountStart: hcStart,
      headcountNow: hcNow,
    },
    departmentSplit,
    genderSplit,
    totalDepartments: departments.length,
    upcoming: upcoming.slice(0, 20),
  })
}
