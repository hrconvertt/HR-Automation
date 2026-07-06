import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { notify } from '@/lib/notifications'

async function load(request: NextRequest, id: string) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return null
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  const task = await prisma.onboardingTask.findUnique({
    where: { id },
    include: { checklist: { include: { employee: { select: { id: true, fullName: true, reportingManagerId: true } } } } },
  })
  if (!me || !task) return null
  const isHR = me.role === 'HR_ADMIN'
  const isManager = me.role === 'MANAGER' && me.employee?.id === task.checklist.employee.reportingManagerId
  const isSelf = me.employee?.id === task.checklist.employee.id
  return { me, task, isHR, isManager, isSelf, payload }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const ctxd = await load(request, id)
  if (!ctxd) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { me, task, isHR, isManager, isSelf } = ctxd

  const body = await request.json()

  // Permission: HR can edit anything. Others can only mark tasks owned by them.
  if (!isHR) {
    const canTick =
      (task.owner === 'EMPLOYEE' && isSelf) ||
      (task.owner === 'MANAGER' && isManager) ||
      (task.owner === 'IT' && me.role === 'HR_ADMIN')
    if (!canTick) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (typeof body.isComplete !== 'boolean') return NextResponse.json({ error: 'Only isComplete editable' }, { status: 400 })
  }

  const updated = await prisma.onboardingTask.update({
    where: { id },
    data: {
      title: isHR ? body.title ?? undefined : undefined,
      description: isHR ? body.description ?? undefined : undefined,
      owner: isHR ? body.owner ?? undefined : undefined,
      category: isHR ? body.category ?? undefined : undefined,
      orderIndex: isHR ? body.orderIndex ?? undefined : undefined,
      isComplete: typeof body.isComplete === 'boolean' ? body.isComplete : undefined,
      completedAt: typeof body.isComplete === 'boolean' ? (body.isComplete ? new Date() : null) : undefined,
      completedById: typeof body.isComplete === 'boolean' ? (body.isComplete ? ctxd.payload.userId : null) : undefined,
      notes: body.notes ?? undefined,
    },
  })

  // Notify HR when a task is completed
  if (body.isComplete === true) {
    const hr = await prisma.user.findMany({ where: { role: 'HR_ADMIN' }, select: { employee: { select: { id: true } } } })
    for (const u of hr) {
      if (u.employee?.id) await notify({ employeeId: u.employee.id, type: 'GENERAL', title: 'Onboarding task completed', message: `${task.checklist.employee.fullName}: ${task.title}`, link: `/dashboard/onboarding/${task.checklist.employee.id}` })
    }
  }

  return NextResponse.json({ task: updated })
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload || !hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await prisma.onboardingTask.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
