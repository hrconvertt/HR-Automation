import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { notify } from '@/lib/notifications'

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { checklistId, title, owner, category, description } = body
  if (!checklistId || !title || !owner || !category) {
    return NextResponse.json({ error: 'checklistId, title, owner, category required' }, { status: 400 })
  }

  const checklist = await prisma.onboardingChecklist.findUnique({
    where: { id: checklistId },
    select: { id: true, employeeId: true, employee: { select: { reportingManagerId: true } } },
  })
  if (!checklist) return NextResponse.json({ error: 'Checklist not found' }, { status: 404 })

  const maxOrder = await prisma.onboardingTask.aggregate({
    where: { checklistId, category },
    _max: { orderIndex: true },
  })

  const task = await prisma.onboardingTask.create({
    data: {
      checklistId,
      title,
      description: description ?? null,
      owner,
      category,
      orderIndex: (maxOrder._max.orderIndex ?? 0) + 1,
    },
  })

  // Notify owner where possible
  if (owner === 'EMPLOYEE') {
    await notify({ employeeId: checklist.employeeId, type: 'GENERAL', title: 'New onboarding task', message: title, link: `/dashboard/onboarding/${checklist.employeeId}` })
  } else if (owner === 'MANAGER' && checklist.employee?.reportingManagerId) {
    await notify({ employeeId: checklist.employee.reportingManagerId, type: 'GENERAL', title: 'New onboarding task assigned', message: title, link: `/dashboard/onboarding/${checklist.employeeId}` })
  }

  return NextResponse.json({ task }, { status: 201 })
}
