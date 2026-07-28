/**
 * GET /api/daily-log/today
 *
 * Returns the calling employee's own daily log + KPI assignments for
 * today, plus any already-saved DailyKpi actuals for today.
 *
 * Optional ?date=YYYY-MM-DD for HR retroactive edits.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { dayUtc, getDailyLoggingConfig } from '@/lib/daily-logging-config'

export async function GET(request: NextRequest) {
  const payload = await verifyToken()
  if (!payload || !payload.employeeId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dateParam = searchParams.get('date')
  const targetEmployeeIdParam = searchParams.get('employeeId')

  // Only HR can read/write a different employee's "today".
  let employeeId = payload.employeeId
  if (targetEmployeeIdParam && targetEmployeeIdParam !== payload.employeeId) {
    if (payload.role !== 'HR_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    employeeId = targetEmployeeIdParam
  }

  const date = dateParam ? dayUtc(new Date(dateParam)) : dayUtc()

  const [logs, kpis, assignments, config] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { employeeId, date },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.dailyKpi.findMany({
      where: { employeeId, date },
      include: { metric: { select: { id: true, name: true, unit: true } } },
    }),
    prisma.kpiAssignment.findMany({
      where: { employeeId, isActive: true, metric: { isActive: true } },
      include: { metric: true },
      orderBy: [{ metric: { name: 'asc' } }],
    }),
    getDailyLoggingConfig(),
  ])

  return NextResponse.json({
    date: date.toISOString().slice(0, 10),
    logs,
    kpis,
    assignments,
    config,
  })
}
