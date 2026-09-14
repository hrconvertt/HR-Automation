/**
 * PATCH  /api/career/flex-teams/[id] — edit details or change status
 * DELETE /api/career/flex-teams/[id] — remove it
 *
 * The host, whoever created it, or HR.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess, parseDay, cleanText } from '@/lib/talent'
import { flexTeamOwner } from '@/lib/flex-teams'
import { FLEX_STATUSES, FLEX_WORK_MODE_VALUES } from '@/lib/talent-labels'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const { team, may } = await flexTeamOwner(access, id)
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!may) return NextResponse.json({ error: 'Only the host, its creator or HR can change it.' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const data: Record<string, unknown> = {}
  if (body.title !== undefined) {
    const t = cleanText(body.title, 140)
    if (!t) return NextResponse.json({ error: 'The name cannot be empty.' }, { status: 400 })
    data.title = t
  }
  for (const [k, max] of [['category', 80], ['description', 3000], ['location', 120], ['hoursPerWeek', 40]] as const) {
    if (body[k] !== undefined) data[k] = cleanText(body[k], max)
  }
  if (body.workMode !== undefined) {
    if (!FLEX_WORK_MODE_VALUES.includes(String(body.workMode))) return NextResponse.json({ error: 'Invalid work mode' }, { status: 400 })
    data.workMode = body.workMode
  }
  if (body.status !== undefined) {
    if (!(FLEX_STATUSES as readonly string[]).includes(String(body.status))) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    data.status = body.status
  }
  if (body.startDate !== undefined) data.startDate = body.startDate ? parseDay(body.startDate) : null
  if (body.endDate !== undefined) data.endDate = body.endDate ? parseDay(body.endDate) : null
  if (body.spots !== undefined) data.spots = typeof body.spots === 'number' && body.spots > 0 ? Math.floor(body.spots) : null

  await prisma.flexTeam.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const { team, may } = await flexTeamOwner(access, id)
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!may) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await prisma.flexTeam.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
