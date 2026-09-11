/**
 * Candidates on a succession plan. HR only.
 *
 *   POST   { employeeId, readiness, note? }
 *   PATCH  { candidateId, readiness?, note? }
 *   DELETE ?candidateId=
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { READINESS_VALUES } from '@/lib/talent-labels'
import { resolveTalentAccess, canManageSuccession, cleanText } from '@/lib/talent'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function gate(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!canManageSuccession(access)) return { res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { id } = await ctx.params
  const plan = await prisma.successionPlan.findUnique({ where: { id }, select: { id: true, incumbentId: true } })
  if (!plan) return { res: NextResponse.json({ error: 'Plan not found' }, { status: 404 }) }
  return { plan }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const g = await gate(request, ctx)
  if ('res' in g) return g.res

  const body = (await request.json().catch(() => ({}))) as {
    employeeId?: string; readiness?: string; note?: string
  }
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : ''
  if (!employeeId) return NextResponse.json({ error: 'Pick a successor.' }, { status: 400 })
  if (employeeId === g.plan.incumbentId) {
    return NextResponse.json({ error: 'The incumbent cannot be their own successor.' }, { status: 400 })
  }
  const readiness = READINESS_VALUES.includes(body.readiness ?? '') ? body.readiness! : 'ONE_YEAR'

  const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, status: true } })
  if (!e || e.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'The successor must be an active employee.' }, { status: 400 })
  }

  const existing = await prisma.successionCandidate.findUnique({
    where: { planId_employeeId: { planId: g.plan.id, employeeId } }, select: { id: true },
  })
  if (existing) return NextResponse.json({ error: 'They are already on this plan.' }, { status: 409 })

  await prisma.successionCandidate.create({
    data: { planId: g.plan.id, employeeId, readiness, note: cleanText(body.note, 500) },
  })
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const g = await gate(request, ctx)
  if ('res' in g) return g.res

  const body = (await request.json().catch(() => ({}))) as {
    candidateId?: string; readiness?: string; note?: string
  }
  if (!body.candidateId) return NextResponse.json({ error: 'candidateId is required' }, { status: 400 })
  const c = await prisma.successionCandidate.findFirst({
    where: { id: body.candidateId, planId: g.plan.id }, select: { id: true },
  })
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: { readiness?: string; note?: string | null } = {}
  if (body.readiness !== undefined) {
    if (!READINESS_VALUES.includes(body.readiness)) {
      return NextResponse.json({ error: 'Invalid readiness' }, { status: 400 })
    }
    data.readiness = body.readiness
  }
  if (body.note !== undefined) data.note = cleanText(body.note, 500)

  await prisma.successionCandidate.update({ where: { id: c.id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const g = await gate(request, ctx)
  if ('res' in g) return g.res
  const candidateId = request.nextUrl.searchParams.get('candidateId')
  if (!candidateId) return NextResponse.json({ error: 'candidateId is required' }, { status: 400 })
  const c = await prisma.successionCandidate.findFirst({
    where: { id: candidateId, planId: g.plan.id }, select: { id: true },
  })
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.successionCandidate.delete({ where: { id: c.id } })
  return NextResponse.json({ ok: true })
}
