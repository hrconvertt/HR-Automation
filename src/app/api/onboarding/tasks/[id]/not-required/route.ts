/**
 * POST /api/onboarding/tasks/[id]/not-required
 *
 * Marks an onboarding task NOT_REQUIRED with an optional reason. Counts as
 * completed for the progress percentage but doesn't represent actual work
 * — used for things HR doesn't do yet (e.g. ID Card issuance).
 *
 * Auth: HR_ADMIN or the employee's manager. Employees can NOT mark their
 * own tasks "not required" — that's a manager call.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
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
  if (!isHR && !isManager) {
    return NextResponse.json({ error: 'Forbidden — only HR or the assigned manager can mark a task as not required' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as { reason?: string; undo?: boolean }

  // Undo path — restore PENDING.
  if (body.undo) {
    const restored = await prisma.onboardingTask.update({
      where: { id },
      data: {
        status: 'PENDING',
        isComplete: false,
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
      status: 'NOT_REQUIRED',
      isComplete: false,
      attachedDocumentId: null,
      notRequiredReason: body.reason?.trim() || null,
      completedAt: new Date(),
      completedById: payload.userId,
    },
  })

  // Notify manager + HR.
  const empLink = `/dashboard/onboarding/${task.checklist.employee.id}`
  const msg = `${task.checklist.employee.fullName}: ${task.title} — marked not required${body.reason ? ` ("${body.reason.trim()}")` : ''}`
  if (task.checklist.employee.reportingManagerId && task.checklist.employee.reportingManagerId !== me.employee?.id) {
    await notify({ employeeId: task.checklist.employee.reportingManagerId, type: 'GENERAL', title: 'Onboarding task skipped', message: msg, link: empLink })
  }
  const hrs = await prisma.user.findMany({ where: { role: 'HR_ADMIN' }, select: { employee: { select: { id: true } } } })
  for (const u of hrs) {
    if (u.employee?.id && u.employee.id !== me.employee?.id) {
      await notify({ employeeId: u.employee.id, type: 'GENERAL', title: 'Onboarding task skipped', message: msg, link: empLink })
    }
  }

  return NextResponse.json({ task: updated })
}
