/**
 * Steps of a journey. HR only.
 *   POST   { moduleId, title, type, body?, url?, programId?, required?, dueDays?, minutes? }
 *   PATCH  { stepId, ...the same fields, move?: 'UP' | 'DOWN' }
 *   DELETE ?stepId=
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cleanText } from '@/lib/talent'
import { journeyAdmin } from '@/lib/experience-server'
import { STEP_TYPE_VALUES } from '@/lib/experience'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function stepFields(body: Record<string, unknown>, partial: boolean) {
  const data: Record<string, unknown> = {}
  if (!partial || body.title !== undefined) {
    const t = cleanText(body.title, 160)
    if (!t) return { error: 'Name the step.' }
    data.title = t
  }
  if (!partial || body.type !== undefined) {
    if (typeof body.type !== 'string' || !STEP_TYPE_VALUES.includes(body.type)) return { error: 'Pick a step type.' }
    data.type = body.type
  }
  if (body.body !== undefined) data.body = typeof body.body === 'string' && body.body.trim() ? body.body.trim().slice(0, 10_000) : null
  if (body.url !== undefined) {
    const u = cleanText(body.url, 1000)
    if (u && !(u.startsWith('/') || /^https?:\/\//i.test(u) || u.startsWith('{profile}'))) {
      return { error: 'A link must start with / for a page in Convertt HR, or with https://.' }
    }
    data.url = u
  }
  if (body.programId !== undefined) {
    if (body.programId) {
      const p = await prisma.trainingProgram.findUnique({ where: { id: String(body.programId) }, select: { id: true } })
      if (!p) return { error: 'That course no longer exists.' }
      data.programId = p.id
    } else data.programId = null
  }
  if (body.required !== undefined) data.required = body.required === true
  if (body.dueDays !== undefined) {
    const n = body.dueDays === '' || body.dueDays === null ? null : Number(body.dueDays)
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 365)) return { error: 'Due after must be 0–365 days.' }
    data.dueDays = n
  }
  if (body.minutes !== undefined) {
    const n = body.minutes === '' || body.minutes === null ? null : Number(body.minutes)
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 600)) return { error: 'Minutes must be 0–600.' }
    data.minutes = n
  }
  if (data.type === 'LEARNING' && !data.programId && !partial) return { error: 'Pick the course for a learning step.' }
  return { data }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const g = await journeyAdmin(request)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const { id } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const m = typeof body.moduleId === 'string'
    ? await prisma.experienceModule.findFirst({ where: { id: body.moduleId, journeyId: id }, select: { id: true } })
    : null
  if (!m) return NextResponse.json({ error: 'Module not found' }, { status: 404 })
  const parsed = await stepFields(body, false)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const last = await prisma.experienceStep.aggregate({ where: { moduleId: m.id }, _max: { seq: true } })
  const step = await prisma.experienceStep.create({
    data: {
      moduleId: m.id,
      seq: (last._max.seq ?? 0) + 1,
      required: true,
      ...(parsed.data as { title: string; type: string }),
    },
    select: { id: true },
  })
  await prisma.experienceJourney.update({ where: { id }, data: { updatedAt: new Date() } })
  return NextResponse.json({ step }, { status: 201 })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const g = await journeyAdmin(request)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const { id } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const s = typeof body.stepId === 'string'
    ? await prisma.experienceStep.findFirst({ where: { id: body.stepId, module: { journeyId: id } }, select: { id: true, seq: true, moduleId: true } })
    : null
  if (!s) return NextResponse.json({ error: 'Step not found' }, { status: 404 })

  if (body.move === 'UP' || body.move === 'DOWN') {
    const neighbour = await prisma.experienceStep.findFirst({
      where: { moduleId: s.moduleId, seq: body.move === 'UP' ? { lt: s.seq } : { gt: s.seq } },
      orderBy: { seq: body.move === 'UP' ? 'desc' : 'asc' },
      select: { id: true, seq: true },
    })
    if (neighbour) {
      await prisma.$transaction([
        prisma.experienceStep.update({ where: { id: s.id }, data: { seq: neighbour.seq } }),
        prisma.experienceStep.update({ where: { id: neighbour.id }, data: { seq: s.seq } }),
      ])
    }
    return NextResponse.json({ ok: true })
  }

  const parsed = await stepFields(body, true)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  await prisma.experienceStep.update({ where: { id: s.id }, data: parsed.data })
  await prisma.experienceJourney.update({ where: { id }, data: { updatedAt: new Date() } })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const g = await journeyAdmin(request)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const { id } = await ctx.params
  const stepId = request.nextUrl.searchParams.get('stepId')
  const s = stepId ? await prisma.experienceStep.findFirst({ where: { id: stepId, module: { journeyId: id } }, select: { id: true } }) : null
  if (!s) return NextResponse.json({ error: 'Step not found' }, { status: 404 })
  await prisma.experienceStep.delete({ where: { id: s.id } })
  return NextResponse.json({ ok: true })
}
