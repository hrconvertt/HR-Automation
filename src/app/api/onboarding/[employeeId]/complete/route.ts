import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { notify } from '@/lib/notifications'

export async function POST(request: NextRequest, ctx: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await ctx.params
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload || !hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const checklist = await prisma.onboardingChecklist.findUnique({
    where: { employeeId },
    include: { tasks: true, employee: { select: { joiningDate: true, reportingManagerId: true, fullName: true } } },
  })
  if (!checklist) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // NOT_REQUIRED counts as done (it's HR/manager explicitly skipping).
  const allDone = checklist.tasks.length > 0 && checklist.tasks.every((t) => t.isComplete || t.status === 'COMPLETED' || t.status === 'NOT_REQUIRED')
  const days = Math.floor((Date.now() - new Date(checklist.employee.joiningDate).getTime()) / 86400000)
  if (!allDone) return NextResponse.json({ error: 'Not all tasks complete' }, { status: 400 })
  if (days < 30) return NextResponse.json({ error: 'Employee has not reached Day 30' }, { status: 400 })

  await prisma.onboardingChecklist.update({
    where: { employeeId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })

  await notify({ employeeId, type: 'GENERAL', title: 'Onboarding complete', message: 'Welcome aboard! Your onboarding is officially complete.' })
  if (checklist.employee.reportingManagerId) {
    await notify({ employeeId: checklist.employee.reportingManagerId, type: 'GENERAL', title: 'Team member fully onboarded', message: `${checklist.employee.fullName} is fully onboarded.` })
  }

  return NextResponse.json({ ok: true })
}
