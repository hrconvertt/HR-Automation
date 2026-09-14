/**
 * PATCH  /api/experience/journeys/[id] — { title?, description?, status?, autoAssign?, bannerTone? }
 * DELETE /api/experience/journeys/[id] — the journey, its steps and everyone's progress
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cleanText } from '@/lib/talent'
import { journeyAdmin } from '@/lib/experience-server'
import { AUTO_ASSIGN_VALUES, BANNER_TONES, JOURNEY_STATUSES } from '@/lib/experience'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const g = await journeyAdmin(request)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const { id } = await ctx.params
  const j = await prisma.experienceJourney.findUnique({
    where: { id }, select: { id: true, _count: { select: { modules: true } } },
  })
  if (!j) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const data: Record<string, unknown> = {}
  if (body.title !== undefined) {
    const t = cleanText(body.title, 140)
    if (!t) return NextResponse.json({ error: 'The journey needs a name.' }, { status: 400 })
    data.title = t
  }
  if (body.description !== undefined) data.description = cleanText(body.description, 2000)
  if (body.status !== undefined) {
    if (!(JOURNEY_STATUSES as readonly string[]).includes(String(body.status))) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    if (body.status === 'PUBLISHED') {
      const steps = await prisma.experienceStep.count({ where: { module: { journeyId: id } } })
      if (steps === 0) return NextResponse.json({ error: 'Add at least one step before publishing.' }, { status: 400 })
    }
    data.status = body.status
  }
  if (body.autoAssign !== undefined) {
    const v = body.autoAssign === '' || body.autoAssign === null ? null : String(body.autoAssign)
    if (v !== null && !(AUTO_ASSIGN_VALUES as readonly string[]).includes(v)) {
      return NextResponse.json({ error: 'Invalid automatic assignment' }, { status: 400 })
    }
    data.autoAssign = v
  }
  if (body.bannerTone !== undefined) {
    if (typeof body.bannerTone !== 'string' || !BANNER_TONES[body.bannerTone]) {
      return NextResponse.json({ error: 'Invalid colour' }, { status: 400 })
    }
    data.bannerTone = body.bannerTone
  }

  await prisma.experienceJourney.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const g = await journeyAdmin(request)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const { id } = await ctx.params
  const j = await prisma.experienceJourney.findUnique({ where: { id }, select: { id: true } })
  if (!j) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.experienceJourney.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
