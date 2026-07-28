/**
 * PATCH /api/kpi/metrics/[id]                     — update / disable (HR only)
 * DELETE /api/kpi/metrics/[id]                    — soft-disable
 * POST   /api/kpi/metrics/[id]/assign-default-position — bulk assign (HR)
 *
 * The assign-default-position helper lives on the parent route as a body-flag
 * to keep route surface small.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function requireHR() {
  const payload = await verifyToken()
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (payload.role !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  }
  return { payload }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const g = await requireHR()
  if ('error' in g) return g.error
  const { id } = await context.params
  const body = await request.json()
  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string') data.name = body.name.trim()
  if (typeof body.unit === 'string' && ['count', 'hours', 'currency', 'percent'].includes(body.unit)) {
    data.unit = body.unit
  }
  if ('description' in body) data.description = body.description ? String(body.description).trim() : null
  if ('defaultPositionId' in body) data.defaultPositionId = body.defaultPositionId || null
  if ('defaultTarget' in body) {
    data.defaultTarget =
      body.defaultTarget === null || body.defaultTarget === undefined
        ? null
        : Number(body.defaultTarget)
  }
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive
  const metric = await prisma.kpiMetric.update({ where: { id }, data })
  return NextResponse.json({ metric })
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const g = await requireHR()
  if ('error' in g) return g.error
  const { id } = await context.params
  // Soft-disable to preserve historical DailyKpi rows.
  await prisma.kpiMetric.update({ where: { id }, data: { isActive: false } })
  await prisma.kpiAssignment.updateMany({ where: { metricId: id }, data: { isActive: false } })
  return NextResponse.json({ ok: true })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  // Bulk-assign to default position
  const g = await requireHR()
  if ('error' in g) return g.error
  const { id } = await context.params
  const body = await request.json().catch(() => ({}))
  if (body.action !== 'assign-default-position') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
  const metric = await prisma.kpiMetric.findUnique({ where: { id } })
  if (!metric || !metric.defaultPositionId) {
    return NextResponse.json({ error: 'Metric has no default position' }, { status: 400 })
  }
  const target = metric.defaultTarget ?? 1
  const employees = await prisma.employee.findMany({
    where: { positionId: metric.defaultPositionId, status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'] } },
    select: { id: true },
  })
  let created = 0
  for (const emp of employees) {
    try {
      await prisma.kpiAssignment.upsert({
        where: { employeeId_metricId: { employeeId: emp.id, metricId: id } },
        update: { isActive: true, target },
        create: {
          employeeId: emp.id,
          metricId: id,
          target,
          assignedById: g.payload.userId,
        },
      })
      created++
    } catch {
      /* ignore */
    }
  }
  return NextResponse.json({ ok: true, count: created })
}
