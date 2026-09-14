/**
 * POST /api/experience/journeys/[id]/distribute — hand a published journey out.
 * body: { target: 'PEOPLE' | 'DEPARTMENT' | 'MANAGERS' | 'EVERYONE', employeeIds?, departmentId? }
 *
 * People who already have it are left alone and counted in the reply. Each
 * new recipient is notified with a link straight into their journey.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { journeyAdmin, assignJourney } from '@/lib/experience-server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const g = await journeyAdmin(request)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const { id } = await ctx.params
  const journey = await prisma.experienceJourney.findUnique({ where: { id }, select: { status: true } })
  if (!journey) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (journey.status !== 'PUBLISHED') return NextResponse.json({ error: 'Publish the journey before distributing it.' }, { status: 400 })

  const body = (await request.json().catch(() => ({}))) as { target?: string; employeeIds?: unknown; departmentId?: string }
  const live = { status: 'ACTIVE', deletedAt: null }
  let ids: string[] = []
  let method = 'MANUAL'

  if (body.target === 'PEOPLE') {
    const wanted = Array.isArray(body.employeeIds) ? body.employeeIds.filter((x): x is string => typeof x === 'string') : []
    ids = (await prisma.employee.findMany({ where: { ...live, id: { in: wanted } }, select: { id: true } })).map((e) => e.id)
  } else if (body.target === 'DEPARTMENT') {
    if (!body.departmentId) return NextResponse.json({ error: 'Pick a department.' }, { status: 400 })
    ids = (await prisma.employee.findMany({ where: { ...live, departmentId: body.departmentId }, select: { id: true } })).map((e) => e.id)
    method = 'DEPARTMENT'
  } else if (body.target === 'MANAGERS') {
    ids = (await prisma.employee.findMany({ where: { ...live, directReports: { some: live } }, select: { id: true } })).map((e) => e.id)
    method = 'MANAGERS'
  } else if (body.target === 'EVERYONE') {
    ids = (await prisma.employee.findMany({ where: live, select: { id: true } })).map((e) => e.id)
    method = 'EVERYONE'
  } else {
    return NextResponse.json({ error: 'Pick who gets it.' }, { status: 400 })
  }
  if (ids.length === 0) return NextResponse.json({ error: 'Nobody matches that.' }, { status: 400 })

  const result = await assignJourney({
    journeyId: id, employeeIds: ids, method, assignedById: g.access.userId, assignedByName: g.access.userName,
  })
  return NextResponse.json(result)
}
