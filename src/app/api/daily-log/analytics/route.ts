/**
 * GET /api/daily-log/analytics?employeeId=X&range=14d|30d|90d|custom&from=...&to=...
 *
 * Returns:
 *  - daily totals (date, totalHours, sumTarget, sumActual)
 *  - per-metric daily series for the KPI Attainment chart
 *  - inquiry list (recent) + counts (task vs KPI)
 *
 * Visibility is enforced via canSeeAnalytics() against the
 * daily-logging config.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { getTeamEmployeeIds } from '@/lib/team-scope'
import { canSeeAnalytics, dayUtc, getDailyLoggingConfig } from '@/lib/daily-logging-config'

function rangeToDates(range: string, fromParam?: string | null, toParam?: string | null): { from: Date; to: Date } {
  const today = dayUtc()
  if (range === 'custom' && fromParam && toParam) {
    return { from: dayUtc(new Date(fromParam)), to: dayUtc(new Date(toParam)) }
  }
  const days = range === '90d' ? 90 : range === '14d' ? 14 : 30
  const from = new Date(today)
  from.setUTCDate(from.getUTCDate() - (days - 1))
  return { from, to: today }
}

export async function GET(request: NextRequest) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const employeeId = searchParams.get('employeeId') ?? payload.employeeId
  if (!employeeId) return NextResponse.json({ error: 'employeeId required' }, { status: 400 })

  // Auth check
  const isOwn = payload.employeeId === employeeId
  const cfg = await getDailyLoggingConfig()
  let allowed = canSeeAnalytics(cfg, payload.role, isOwn)
  if (allowed && !isOwn && (payload.role === 'MANAGER' || payload.role === 'LEAD')) {
    // Lead/Manager: scope to their team
    const team = payload.employeeId ? await getTeamEmployeeIds(payload.employeeId) : []
    if (!team.includes(employeeId)) allowed = false
  }
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const range = searchParams.get('range') ?? '30d'
  const { from, to } = rangeToDates(range, searchParams.get('from'), searchParams.get('to'))

  const [logs, kpis] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { employeeId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    }),
    prisma.dailyKpi.findMany({
      where: { employeeId, date: { gte: from, lte: to } },
      include: { metric: { select: { id: true, name: true, unit: true } } },
      orderBy: { date: 'asc' },
    }),
  ])

  // Build daily aggregate
  const days: string[] = []
  for (let d = new Date(from); d.getTime() <= to.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
  }

  type DayAgg = { date: string; totalHours: number; sumTarget: number; sumActual: number }
  const byDate = new Map<string, DayAgg>(
    days.map((d) => [d, { date: d, totalHours: 0, sumTarget: 0, sumActual: 0 }]),
  )

  for (const l of logs) {
    const k = l.date.toISOString().slice(0, 10)
    const row = byDate.get(k)
    if (row) row.totalHours += Number(l.hoursInvested)
  }
  for (const k of kpis) {
    const key = k.date.toISOString().slice(0, 10)
    const row = byDate.get(key)
    if (row) {
      row.sumTarget += k.target
      row.sumActual += k.actual
    }
  }

  // Per-metric series
  const metricMap = new Map<string, { id: string; name: string; unit: string; series: { date: string; target: number; actual: number }[] }>()
  for (const k of kpis) {
    if (!metricMap.has(k.metricId)) {
      metricMap.set(k.metricId, {
        id: k.metric.id,
        name: k.metric.name,
        unit: k.metric.unit,
        series: [],
      })
    }
    metricMap.get(k.metricId)!.series.push({
      date: k.date.toISOString().slice(0, 10),
      target: k.target,
      actual: k.actual,
    })
  }

  // Inquiries
  const inquiryTasks = logs.filter((l) => l.inquiryStatus !== 'NONE')
  const inquiryKpis = kpis.filter((k) => k.inquiryStatus !== 'NONE')
  const inquiries = [
    ...inquiryTasks.map((l) => ({
      kind: 'TASK' as const,
      id: l.id,
      date: l.date.toISOString().slice(0, 10),
      label: l.taskName,
      question: l.managerInquiry,
      status: l.inquiryStatus,
      response: l.employeeResponse,
    })),
    ...inquiryKpis.map((k) => ({
      kind: 'KPI' as const,
      id: k.id,
      date: k.date.toISOString().slice(0, 10),
      label: k.metric.name,
      question: k.managerInquiry,
      status: k.inquiryStatus,
      response: k.employeeResponse,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  return NextResponse.json({
    employeeId,
    range,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    daily: Array.from(byDate.values()),
    metrics: Array.from(metricMap.values()),
    inquiries,
    inquiryCounts: {
      total: inquiries.length,
      task: inquiryTasks.length,
      kpi: inquiryKpis.length,
    },
  })
}
