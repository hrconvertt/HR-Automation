/**
 * Modules of a journey. HR only.
 *   POST   { title, description? }
 *   PATCH  { moduleId, title?, description?, move?: 'UP' | 'DOWN' }
 *   DELETE ?moduleId=
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cleanText } from '@/lib/talent'
import { journeyAdmin } from '@/lib/experience-server'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function journeyOr404(id: string) {
  return prisma.experienceJourney.findUnique({ where: { id }, select: { id: true } })
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const g = await journeyAdmin(request)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const { id } = await ctx.params
  if (!(await journeyOr404(id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = (await request.json().catch(() => ({}))) as { title?: string; description?: string }
  const title = cleanText(body.title, 140)
  if (!title) return NextResponse.json({ error: 'Name the module.' }, { status: 400 })
  const last = await prisma.experienceModule.aggregate({ where: { journeyId: id }, _max: { seq: true } })
  const m = await prisma.experienceModule.create({
    data: { journeyId: id, title, description: cleanText(body.description, 1000), seq: (last._max.seq ?? 0) + 1 },
    select: { id: true },
  })
  await prisma.experienceJourney.update({ where: { id }, data: { updatedAt: new Date() } })
  return NextResponse.json({ module: m }, { status: 201 })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const g = await journeyAdmin(request)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const { id } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as { moduleId?: string; title?: string; description?: string; move?: string }
  const m = body.moduleId
    ? await prisma.experienceModule.findFirst({ where: { id: body.moduleId, journeyId: id }, select: { id: true, seq: true } })
    : null
  if (!m) return NextResponse.json({ error: 'Module not found' }, { status: 404 })

  if (body.move === 'UP' || body.move === 'DOWN') {
    const neighbour = await prisma.experienceModule.findFirst({
      where: { journeyId: id, seq: body.move === 'UP' ? { lt: m.seq } : { gt: m.seq } },
      orderBy: { seq: body.move === 'UP' ? 'desc' : 'asc' },
      select: { id: true, seq: true },
    })
    if (neighbour) {
      await prisma.$transaction([
        prisma.experienceModule.update({ where: { id: m.id }, data: { seq: neighbour.seq } }),
        prisma.experienceModule.update({ where: { id: neighbour.id }, data: { seq: m.seq } }),
      ])
    }
    return NextResponse.json({ ok: true })
  }

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) {
    const t = cleanText(body.title, 140)
    if (!t) return NextResponse.json({ error: 'The module needs a name.' }, { status: 400 })
    data.title = t
  }
  if (body.description !== undefined) data.description = cleanText(body.description, 1000)
  await prisma.experienceModule.update({ where: { id: m.id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const g = await journeyAdmin(request)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const { id } = await ctx.params
  const moduleId = request.nextUrl.searchParams.get('moduleId')
  const m = moduleId ? await prisma.experienceModule.findFirst({ where: { id: moduleId, journeyId: id }, select: { id: true } }) : null
  if (!m) return NextResponse.json({ error: 'Module not found' }, { status: 404 })
  await prisma.experienceModule.delete({ where: { id: m.id } })
  return NextResponse.json({ ok: true })
}
