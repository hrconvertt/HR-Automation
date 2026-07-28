/**
 * POST /api/onboarding/[employeeId]/apply-template
 *
 * Seeds the standard Convertt onboarding checklist tasks onto an existing
 * (empty) checklist. Used by the "Apply standard checklist" button in the
 * onboarding workspace for checklists created before per-hire task seeding
 * existed. HR-only; refuses if the checklist already has tasks so it can
 * never duplicate a live checklist.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { buildStandardOnboardingTasks } from '@/lib/onboarding-tasks'

export async function POST(request: NextRequest, ctx: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await ctx.params
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'View-only while previewing role' }, { status: 403 })
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, status: true, employeeType: true, onboarding: { select: { id: true, _count: { select: { tasks: true } } } } },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  if (['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'].includes(employee.status)) {
    return NextResponse.json({ error: 'Employee has exited — onboarding not applicable' }, { status: 400 })
  }

  // Create the checklist row if it's missing entirely.
  const checklist = employee.onboarding
    ?? { id: (await prisma.onboardingChecklist.create({ data: { employeeId } })).id, _count: { tasks: 0 } }
  if (checklist._count.tasks > 0) {
    return NextResponse.json({ error: 'Checklist already has tasks' }, { status: 400 })
  }

  const seeds = buildStandardOnboardingTasks(employee.employeeType)
  await prisma.onboardingTask.createMany({
    data: seeds.map((t) => ({
      checklistId: checklist.id,
      title: t.title,
      owner: t.owner,
      category: t.category,
      orderIndex: t.orderIndex,
      description: t.description ?? null,
      isEmployeeUploadable: t.isEmployeeUploadable ?? false,
      documentType: t.documentType ?? null,
    })),
  })

  return NextResponse.json({ ok: true, created: seeds.length }, { status: 201 })
}
