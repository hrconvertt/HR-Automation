/**
 * GET  /api/kpi/metrics — list KPI metric library
 * POST /api/kpi/metrics — create a metric (HR only)
 *
 * Lead/Manager can read; only HR can mutate.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const includeInactive = searchParams.get('includeInactive') === '1'
  const metrics = await prisma.kpiMetric.findMany({
    where: includeInactive ? {} : { isActive: true },
    include: {
      defaultPosition: { select: { id: true, title: true } },
      _count: { select: { assignments: true } },
    },
    orderBy: [{ name: 'asc' }],
  })
  return NextResponse.json({
    metrics: metrics.map((m) => ({
      id: m.id,
      name: m.name,
      unit: m.unit,
      description: m.description,
      isActive: m.isActive,
      defaultPositionId: m.defaultPositionId,
      defaultPosition: m.defaultPosition,
      defaultTarget: m.defaultTarget,
      assignmentCount: m._count.assignments,
      createdAt: m.createdAt,
    })),
  })
}

export async function POST(request: NextRequest) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }
  const body = await request.json()
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const unit = ['count', 'hours', 'currency', 'percent'].includes(body.unit) ? body.unit : 'count'
  const metric = await prisma.kpiMetric.create({
    data: {
      name,
      unit,
      description: body.description ? String(body.description).trim() : null,
      defaultPositionId: body.defaultPositionId ? String(body.defaultPositionId) : null,
      defaultTarget:
        body.defaultTarget !== undefined && body.defaultTarget !== null
          ? Number(body.defaultTarget)
          : null,
      createdById: payload.userId,
    },
  })
  return NextResponse.json({ metric })
}
