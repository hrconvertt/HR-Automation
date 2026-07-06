import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function getCtx() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = await verifyToken(tok)
  if (!payload) return null
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, employee: { select: { id: true } } },
  })
  if (!me) return null
  const previewRole = c.get('hr_preview_role')?.value
  const effectiveRole = previewRole && me.role === 'HR_ADMIN' ? previewRole : me.role
  return { userId: me.id, employeeId: me.employee?.id ?? null, role: effectiveRole, preview: !!previewRole }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.preview) return NextResponse.json({ error: 'Preview mode' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const action = String(body.action || '').toUpperCase()

  const task = await prisma.taskAssignment.findUnique({
    where: { id },
    include: {
      template: { select: { expectedHours: true } },
      employee: { select: { id: true, reportingManagerId: true } },
    },
  })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwn = task.employeeId === ctx.employeeId
  const isMyTeam = task.employee.reportingManagerId === ctx.employeeId
  const isHR = ctx.role === 'HR_ADMIN'

  const expected = task.customExpectedHours ?? task.template?.expectedHours ?? null

  if (action === 'START') {
    if (!isOwn && !isHR) return NextResponse.json({ error: 'Only the assignee can start' }, { status: 403 })
    const updated = await prisma.taskAssignment.update({
      where: { id },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    })
    return NextResponse.json({ assignment: updated })
  }

  if (action === 'COMPLETE') {
    if (!isOwn && !isHR) return NextResponse.json({ error: 'Only the assignee can complete' }, { status: 403 })
    const actualHours = Number(body.actualHours)
    if (!Number.isFinite(actualHours) || actualHours <= 0) {
      return NextResponse.json({ error: 'actualHours must be > 0' }, { status: 400 })
    }
    const efficiency = expected && actualHours > 0 ? expected / actualHours : null
    const updated = await prisma.taskAssignment.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        actualHours,
        efficiency,
        delayReason: body.delayReason ? String(body.delayReason).slice(0, 1000) : task.delayReason,
      },
    })
    return NextResponse.json({ assignment: updated })
  }

  if (action === 'SCORE_QUALITY') {
    if (!isMyTeam && !isHR) return NextResponse.json({ error: 'Only manager or HR can score' }, { status: 403 })
    if (task.status !== 'COMPLETED') return NextResponse.json({ error: 'Task must be completed' }, { status: 400 })
    const qualityScore = Number(body.qualityScore)
    if (!Number.isFinite(qualityScore) || qualityScore < 1 || qualityScore > 5) {
      return NextResponse.json({ error: 'qualityScore must be 1-5' }, { status: 400 })
    }
    const updated = await prisma.taskAssignment.update({
      where: { id },
      data: { qualityScore, status: 'SCORED' },
    })
    return NextResponse.json({ assignment: updated })
  }

  if (action === 'JUSTIFY_DELAY') {
    if (!isMyTeam && !isHR) return NextResponse.json({ error: 'Only manager or HR can justify' }, { status: 403 })
    const updated = await prisma.taskAssignment.update({
      where: { id },
      data: {
        delayJustified: true,
        notes: body.notes ? String(body.notes).slice(0, 2000) : task.notes,
      },
    })
    return NextResponse.json({ assignment: updated })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
