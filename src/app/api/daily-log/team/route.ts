/**
 * GET /api/daily-log/team?date=YYYY-MM-DD
 *
 * Lead / Manager / HR view of their team's daily logs + KPIs for the
 * given date. Includes a "missing log" hint (no logs on/before cutoff hour).
 *
 * Scope:
 *  - HR_ADMIN / EXECUTIVE   — full company
 *  - MANAGER / LEAD         — own team via getTeamEmployeeIds
 *  - Anyone else            — 403
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { getTeamEmployeeIds } from '@/lib/team-scope'
import { dayUtc, getDailyLoggingConfig } from '@/lib/daily-logging-config'

export async function GET(request: NextRequest) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const dateParam = searchParams.get('date')
  const date = dateParam ? dayUtc(new Date(dateParam)) : dayUtc(new Date(Date.now() - 86400_000))

  let employeeIds: string[] = []
  if (payload.role === 'HR_ADMIN' || payload.role === 'EXECUTIVE') {
    const all = await prisma.employee.findMany({
      where: { status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'] } },
      select: { id: true },
    })
    employeeIds = all.map((e) => e.id)
  } else if ((payload.role === 'MANAGER' || payload.role === 'LEAD') && payload.employeeId) {
    employeeIds = await getTeamEmployeeIds(payload.employeeId)
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (employeeIds.length === 0) {
    return NextResponse.json({ date: date.toISOString().slice(0, 10), employees: [] })
  }

  const [employees, logs, kpis, config] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: {
        id: true,
        fullName: true,
        designation: true,
        photoUrl: true,
        department: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
    }),
    prisma.dailyLog.findMany({
      where: { employeeId: { in: employeeIds }, date },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.dailyKpi.findMany({
      where: { employeeId: { in: employeeIds }, date },
      include: { metric: { select: { id: true, name: true, unit: true } } },
    }),
    getDailyLoggingConfig(),
  ])

  const logsByEmp = new Map<string, typeof logs>()
  for (const l of logs) {
    const arr = logsByEmp.get(l.employeeId) ?? []
    arr.push(l)
    logsByEmp.set(l.employeeId, arr)
  }
  const kpisByEmp = new Map<string, typeof kpis>()
  for (const k of kpis) {
    const arr = kpisByEmp.get(k.employeeId) ?? []
    arr.push(k)
    kpisByEmp.set(k.employeeId, arr)
  }

  const out = employees.map((e) => ({
    ...e,
    logs: logsByEmp.get(e.id) ?? [],
    kpis: kpisByEmp.get(e.id) ?? [],
    missing: (logsByEmp.get(e.id)?.length ?? 0) === 0,
  }))

  return NextResponse.json({
    date: date.toISOString().slice(0, 10),
    employees: out,
    softCutoffHour: config.softCutoffHour,
  })
}
