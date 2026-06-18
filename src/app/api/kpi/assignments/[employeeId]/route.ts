/**
 * GET   /api/kpi/assignments/[employeeId] — list active KPIs for an employee
 * POST  /api/kpi/assignments/[employeeId] — create assignment    (HR or Lead/Manager of employee)
 * PATCH /api/kpi/assignments/[employeeId] — update target / active (same auth)
 *
 * Body for POST: { metricId, target }
 * Body for PATCH: { assignmentId, target?, isActive? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, type AuthPayload } from '@/lib/auth'
import { getTeamEmployeeIds } from '@/lib/team-scope'

async function canManageAssignmentsFor(
  payload: AuthPayload,
  employeeId: string,
): Promise<boolean> {
  if (payload.role === 'HR_ADMIN') return true
  if (payload.role !== 'MANAGER' && payload.role !== 'LEAD') return false
  if (!payload.employeeId) return false
  const team = await getTeamEmployeeIds(payload.employeeId)
  return team.includes(employeeId)
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ employeeId: string }> },
) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { employeeId } = await context.params

  // Employee can read own; HR sees all; Lead/Manager only own team.
  let allowed = false
  if (payload.role === 'HR_ADMIN' || payload.role === 'EXECUTIVE') allowed = true
  else if (payload.employeeId === employeeId) allowed = true
  else if (payload.role === 'MANAGER' || payload.role === 'LEAD') {
    allowed = await canManageAssignmentsFor(payload, employeeId)
  }
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const assignments = await prisma.kpiAssignment.findMany({
    where: { employeeId },
    include: { metric: true },
    orderBy: [{ metric: { name: 'asc' } }],
  })
  return NextResponse.json({ assignments })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ employeeId: string }> },
) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { employeeId } = await context.params
  if (!(await canManageAssignmentsFor(payload, employeeId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json()
  const metricId = String(body.metricId ?? '')
  const target = Number(body.target ?? 0)
  if (!metricId || !(target >= 0)) {
    return NextResponse.json({ error: 'metricId and target required' }, { status: 400 })
  }
  const assignment = await prisma.kpiAssignment.upsert({
    where: { employeeId_metricId: { employeeId, metricId } },
    update: { target, isActive: true },
    create: { employeeId, metricId, target, assignedById: payload.userId },
    include: { metric: true },
  })
  return NextResponse.json({ assignment })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ employeeId: string }> },
) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { employeeId } = await context.params
  if (!(await canManageAssignmentsFor(payload, employeeId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json()
  const assignmentId = String(body.assignmentId ?? '')
  if (!assignmentId) return NextResponse.json({ error: 'assignmentId required' }, { status: 400 })
  const existing = await prisma.kpiAssignment.findUnique({ where: { id: assignmentId } })
  if (!existing || existing.employeeId !== employeeId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const data: Record<string, unknown> = {}
  if (body.target !== undefined) data.target = Number(body.target)
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive
  const assignment = await prisma.kpiAssignment.update({
    where: { id: assignmentId },
    data,
    include: { metric: true },
  })
  return NextResponse.json({ assignment })
}
