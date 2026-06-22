/**
 * POST /api/onboarding/tasks/[id]/complete
 *
 * Marks a task COMPLETED without an upload. For non-document tasks
 * (Welcome email sent, Buddy assigned, etc.) and for HR-side override.
 *
 * Auth: HR_ADMIN, the employee's manager, or the employee themselves
 * (if the task is EMPLOYEE-owned).
 *
 * POST body: { undo?: boolean } — undo restores PENDING.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await prisma.onboardingTask.findUnique({
    where: { id },
    include: {
      checklist: {
        include: {
          employee: { select: { id: true, fullName: true, reportingManagerId: true, status: true } },
        },
      },
    },
  })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'].includes(task.checklist.employee.status)) {
    return NextResponse.json({ error: 'Employee is no longer active' }, { status: 403 })
  }

  const isHR = me.role === 'HR_ADMIN'
  const isManager = me.role === 'MANAGER' && me.employee?.id === task.checklist.employee.reportingManagerId
  const isSelf = me.employee?.id === task.checklist.employee.id
  const canEmployeeTick = isSelf && (task.owner === 'EMPLOYEE' || task.isEmployeeUploadable)
  if (!isHR && !isManager && !canEmployeeTick) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as { undo?: boolean }

  if (body.undo) {
    const restored = await prisma.onboardingTask.update({
      where: { id },
      data: {
        status: 'PENDING',
        isComplete: false,
        attachedDocumentId: null,
        notRequiredReason: null,
        completedAt: null,
        completedById: null,
      },
    })
    return NextResponse.json({ task: restored })
  }

  const updated = await prisma.onboardingTask.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      isComplete: true,
      notRequiredReason: null,
      completedAt: new Date(),
      completedById: payload.userId,
    },
  })

  // Notify manager + HR (skip the caller).
  const empLink = `/dashboard/onboarding/${task.checklist.employee.id}`
  const msg = `${task.checklist.employee.fullName}: ${task.title}`
  if (task.checklist.employee.reportingManagerId && task.checklist.employee.reportingManagerId !== me.employee?.id) {
    await notify({ employeeId: task.checklist.employee.reportingManagerId, type: 'GENERAL', title: 'Onboarding task completed', message: msg, link: empLink })
  }
  const hrs = await prisma.user.findMany({ where: { role: 'HR_ADMIN' }, select: { employee: { select: { id: true } } } })
  for (const u of hrs) {
    if (u.employee?.id && u.employee.id !== me.employee?.id) {
      await notify({ employeeId: u.employee.id, type: 'GENERAL', title: 'Onboarding task completed', message: msg, link: empLink })
    }
  }

  return NextResponse.json({ task: updated })
}
