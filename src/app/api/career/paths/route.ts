/**
 * Saved career paths — the viewer's own.
 *
 *   GET                              the viewer's paths
 *   POST { name?, basis, steps[] }   save one (steps are role titles, in order)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess, cleanText } from '@/lib/talent'

export async function GET(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.employeeId) return NextResponse.json({ paths: [] })
  const paths = await prisma.careerPath.findMany({
    where: { employeeId: access.employeeId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, basis: true, createdAt: true, steps: { orderBy: { seq: 'asc' }, select: { roleTitle: true } } },
  })
  return NextResponse.json({ paths })
}

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.isPreviewMode || !access.employeeId) {
    return NextResponse.json({ error: 'Your login is not linked to an employee record.' }, { status: 403 })
  }
  const body = (await request.json().catch(() => ({}))) as { name?: string; basis?: string; steps?: unknown }
  const steps = Array.isArray(body.steps)
    ? body.steps.map((s) => cleanText(s, 120)).filter((s): s is string => !!s).slice(0, 6)
    : []
  if (steps.length === 0) return NextResponse.json({ error: 'Add at least one move to the path.' }, { status: 400 })

  const path = await prisma.careerPath.create({
    data: {
      employeeId: access.employeeId,
      name: cleanText(body.name, 80) ?? 'Career Development',
      basis: body.basis === 'SKILLS' ? 'SKILLS' : 'INTERESTS',
      steps: { create: steps.map((roleTitle, i) => ({ seq: i + 1, roleTitle })) },
    },
    select: { id: true },
  })
  return NextResponse.json({ path }, { status: 201 })
}
