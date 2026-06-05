import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasAnyRole } from '@/lib/auth'
import { buildEmail } from '@/lib/email-templates'

interface RouteParams { params: Promise<{ id: string; taskId: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, taskId } = await params
  const body = await request.json()

  // Fetch task + journey
  const task = await prisma.journeyTask.findUnique({
    where: { id: taskId },
    include: { journey: { select: { employeeId: true, type: true, employee: { select: { reportingManagerId: true } } } } },
  })
  if (!task || task.journeyId !== id) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } }, userRoles: { select: { role: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const myRoles = user.userRoles.length ? user.userRoles.map((r) => r.role) : [user.role]
  const isHR = myRoles.includes('HR_ADMIN')
  const isOwner = user.employee?.id === task.journey.employeeId
  const isManager =
    myRoles.includes('MANAGER') &&
    user.employee?.id === task.journey.employee.reportingManagerId
  const isIT = myRoles.includes('IT')
  const isFinance = myRoles.includes('FINANCE')

  // ─── Permission check based on task role ──────────────────────────────
  // HR can edit any task. Otherwise, the assigned-to role / owner can edit their own.
  const assignedRole = task.assignedToRole ?? ''
  let allowed = isHR
  if (!allowed) {
    if (assignedRole === 'EMPLOYEE'   && isOwner)   allowed = true
    if (assignedRole === 'MANAGER'    && isManager) allowed = true
    if (assignedRole === 'IT'         && isIT)      allowed = true
    if (assignedRole === 'FINANCE'    && isFinance) allowed = true
    if (assignedRole === 'BUDDY')     allowed = isManager || isOwner  // permissive
  }
  if (!allowed) return NextResponse.json({ error: 'You do not own this task' }, { status: 403 })

  const update: Record<string, unknown> = {}
  if (body.status !== undefined) {
    update.status = body.status
    if (body.status === 'COMPLETED') {
      update.completedAt = new Date()
      update.completedBy = payload.userId
    } else if (body.status === 'PENDING' || body.status === 'IN_PROGRESS') {
      update.completedAt = null
      update.completedBy = null
    }
  }
  if (body.dueDate !== undefined) update.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (body.notes !== undefined) update.notes = body.notes
  if (body.assignedToId !== undefined && isHR) update.assignedToId = body.assignedToId

  const updated = await prisma.journeyTask.update({ where: { id: taskId }, data: update })

  // ─── Auto-queue Confirmation email on probation-end task complete ───
  if (body.status === 'COMPLETED' && task.phase === 'PROBATION_END' &&
      (task.title.toLowerCase().includes('confirmation') || task.category === 'PAPERWORK')) {
    try {
      // Only queue if not already queued for this journey + trigger
      const existing = await prisma.emailDraft.findFirst({
        where: { trigger: 'CONFIRMATION', triggerRefId: id, status: { in: ['DRAFT', 'APPROVED', 'SENT'] } },
      })
      if (!existing) {
        const empFull = await prisma.employee.findUnique({
          where: { id: task.journey.employeeId },
          include: { department: true, salary: true, reportingManager: true },
        })
        if (empFull?.email) {
          const built = buildEmail('CONFIRMATION', empFull, {
            effectiveDate: empFull.confirmationDate ?? new Date(),
          })
          await prisma.emailDraft.create({
            data: {
              employeeId: empFull.id,
              toEmail: empFull.email,
              toName: empFull.fullName,
              ccEmails: 'hr@convertt.co',
              subject: built.subject,
              bodyHtml: built.bodyHtml,
              trigger: 'CONFIRMATION',
              triggerRefId: id,
              createdById: payload.userId,
              status: 'DRAFT',
            },
          })
        }
      }
    } catch (err) {
      console.error('[task confirmation email auto-queue]', err)
    }
  }

  // Auto-complete journey if every blocking task is done
  if (body.status === 'COMPLETED') {
    const remaining = await prisma.journeyTask.count({
      where: { journeyId: id, status: { not: 'COMPLETED' } },
    })
    if (remaining === 0) {
      await prisma.employeeJourney.update({
        where: { id },
        data: { status: 'COMPLETED', actualEndDate: new Date() },
      })
    }
  }

  return NextResponse.json({ task: updated })
}
