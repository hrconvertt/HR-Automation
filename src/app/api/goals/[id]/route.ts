import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) return null
  const previewRole =
    user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  return {
    effectiveRole: previewRole ?? user.role,
    employeeId: user.employee?.id ?? null,
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const goal = await prisma.goal.findUnique({
    where: { id },
    include: { employee: { select: { id: true, reportingManagerId: true } } },
  })
  if (!goal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Authorization
  const isOwn = goal.employeeId === access.employeeId
  const isMyTeamMember = goal.employee.reportingManagerId === access.employeeId
  const isHR = access.effectiveRole === 'HR_ADMIN'

  if (!isOwn && !isMyTeamMember && !isHR) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Build update — field permissions
  const data: Record<string, unknown> = {}
  if (isOwn || isHR) {
    if (body.description !== undefined) data.description = body.description
    if (body.kpi !== undefined) data.kpi = body.kpi
    if (body.target !== undefined) data.target = body.target
    if (body.weight !== undefined) data.weight = body.weight
    if (body.status !== undefined) data.status = body.status
    if (body.selfComment !== undefined) data.selfComment = body.selfComment
    if (body.achievement !== undefined) data.achievement = body.achievement
  }
  if (isMyTeamMember || isHR) {
    if (body.managerComment !== undefined) data.managerComment = body.managerComment
    // Manager can update status too
    if (body.status !== undefined) data.status = body.status
  }

  const updated = await prisma.goal.update({ where: { id }, data })
  return NextResponse.json({ goal: updated })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const goal = await prisma.goal.findUnique({
    where: { id },
    include: { employee: { select: { reportingManagerId: true } } },
  })
  if (!goal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwn = goal.employeeId === access.employeeId
  const isMyTeamMember = goal.employee.reportingManagerId === access.employeeId
  const isHR = access.effectiveRole === 'HR_ADMIN'

  if (!isOwn && !isMyTeamMember && !isHR) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.goal.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
