/**
 * POST /api/experience/progress — { assignmentId, stepId, action }
 *   VIEW        the person opened the step
 *   COMPLETE    "Complete step"
 *   UNCOMPLETE  undo it
 *
 * Only the person walking the journey records their own progress.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess } from '@/lib/talent'
import { refreshAssignment } from '@/lib/experience-server'

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { assignmentId?: string; stepId?: string; action?: string }
  if (!body.assignmentId || !body.stepId || !['VIEW', 'COMPLETE', 'UNCOMPLETE'].includes(body.action ?? '')) {
    return NextResponse.json({ error: 'assignmentId, stepId and action are required' }, { status: 400 })
  }

  const a = await prisma.experienceAssignment.findUnique({
    where: { id: body.assignmentId }, select: { id: true, employeeId: true, journeyId: true },
  })
  if (!a || a.employeeId !== access.employeeId || access.isPreviewMode) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const step = await prisma.experienceStep.findUnique({
    where: { id: body.stepId }, select: { id: true, module: { select: { journeyId: true } } },
  })
  if (!step || step.module.journeyId !== a.journeyId) return NextResponse.json({ error: 'That step is not in this journey.' }, { status: 400 })

  const now = new Date()
  const existing = await prisma.experienceStepProgress.findUnique({
    where: { assignmentId_stepId: { assignmentId: a.id, stepId: step.id } },
    select: { id: true, viewedAt: true, completedAt: true },
  })
  const data =
    body.action === 'VIEW' ? { viewedAt: existing?.viewedAt ?? now }
      : body.action === 'COMPLETE' ? { viewedAt: existing?.viewedAt ?? now, completedAt: existing?.completedAt ?? now }
        : { completedAt: null }

  if (body.action === 'VIEW' && existing?.viewedAt) return NextResponse.json({ ok: true })
  if (existing) {
    await prisma.experienceStepProgress.update({ where: { id: existing.id }, data })
  } else {
    await prisma.experienceStepProgress.create({ data: { assignmentId: a.id, stepId: step.id, ...data } })
  }
  await refreshAssignment(a.id)
  return NextResponse.json({ ok: true })
}
