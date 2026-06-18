/**
 * POST /api/daily-log
 *
 * Body: {
 *   date?: 'YYYY-MM-DD'  (defaults to today; HR-only when in the past)
 *   employeeId?: string  (HR-only override)
 *   logs: [{ taskName, hoursInvested, status, category?, notes? }, ...]
 *   kpis: [{ metricId, actual }, ...]
 * }
 *
 * Re-submitting the same day REPLACES the existing rows for that day for
 * this employee (preserves inquiry data when re-saving — we only delete
 * rows that have NONE inquiryStatus, then re-insert).
 *
 * After midnight, only HR can edit retroactively.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { dayUtc } from '@/lib/daily-logging-config'

interface LogInput {
  taskName: string
  hoursInvested: number | string
  status?: string
  category?: string | null
  notes?: string | null
}
interface KpiInput {
  metricId: string
  actual: number | string
}

export async function POST(request: NextRequest) {
  const payload = await verifyToken()
  if (!payload || !payload.employeeId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const dateInput: string | undefined = body.date
  const employeeIdInput: string | undefined = body.employeeId

  // Determine target employee
  let employeeId = payload.employeeId
  if (employeeIdInput && employeeIdInput !== payload.employeeId) {
    if (payload.role !== 'HR_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    employeeId = employeeIdInput
  }

  const today = dayUtc()
  const date = dateInput ? dayUtc(new Date(dateInput)) : today
  const isPast = date.getTime() < today.getTime()
  if (isPast && payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Past days are locked. Contact HR.' }, { status: 403 })
  }

  const logs: LogInput[] = Array.isArray(body.logs) ? body.logs : []
  const kpis: KpiInput[] = Array.isArray(body.kpis) ? body.kpis : []

  // Validate KPI assignments are real + active
  const assignments = await prisma.kpiAssignment.findMany({
    where: { employeeId, isActive: true },
  })
  const targetByMetric = new Map(assignments.map((a) => [a.metricId, a.target]))

  await prisma.$transaction(async (tx) => {
    // Replace tasks — only delete rows with NONE inquiry status (preserve open inquiries)
    await tx.dailyLog.deleteMany({
      where: { employeeId, date, inquiryStatus: 'NONE' },
    })
    for (const l of logs) {
      const taskName = String(l.taskName ?? '').trim()
      if (!taskName) continue
      const hrs = Number(l.hoursInvested)
      if (!isFinite(hrs) || hrs < 0) continue
      const status = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'].includes(l.status ?? '')
        ? (l.status as string)
        : 'COMPLETED'
      await tx.dailyLog.create({
        data: {
          employeeId,
          date,
          taskName,
          hoursInvested: hrs,
          status,
          category: l.category ? String(l.category).trim() : null,
          notes: l.notes ? String(l.notes).trim() : null,
        },
      })
    }

    // Upsert KPIs (only those with active assignments)
    for (const k of kpis) {
      const metricId = String(k.metricId)
      if (!targetByMetric.has(metricId)) continue
      const actual = Math.max(0, Math.floor(Number(k.actual) || 0))
      const target = targetByMetric.get(metricId) as number
      await tx.dailyKpi.upsert({
        where: {
          employeeId_metricId_date: { employeeId, metricId, date },
        },
        update: { actual },
        create: {
          employeeId,
          metricId,
          date,
          target,
          actual,
        },
      })
    }
  })

  return NextResponse.json({ ok: true })
}
