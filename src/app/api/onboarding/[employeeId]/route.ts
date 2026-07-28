import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function authorize(request: NextRequest, employeeId: string) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return null
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) return null
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, reportingManagerId: true },
  })
  if (!emp) return null
  const isHR = me.role === 'HR_ADMIN'
  const isManager = me.role === 'MANAGER' && me.employee?.id === emp.reportingManagerId
  const isSelf = me.employee?.id === emp.id
  if (!isHR && !isManager && !isSelf) return null
  return { me, isHR, isManager, isSelf, payload }
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await ctx.params
  const auth = await authorize(request, employeeId)
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const checklist = await prisma.onboardingChecklist.findUnique({
    where: { employeeId },
    include: { tasks: { orderBy: [{ category: 'asc' }, { orderIndex: 'asc' }] } },
  })
  return NextResponse.json({ checklist })
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await ctx.params
  const auth = await authorize(request, employeeId)
  if (!auth || !auth.isHR) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json()
  const updated = await prisma.onboardingChecklist.update({
    where: { employeeId },
    data: {
      day1ScheduleJson: body.day1ScheduleJson ?? undefined,
      notes: body.notes ?? undefined,
    },
  })
  return NextResponse.json({ checklist: updated })
}
