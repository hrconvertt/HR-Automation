/**
 * PATCH  /api/pulse/actions/[id] — { status?: 'OPEN' | 'DONE', note? } — HR or the owner
 * DELETE /api/pulse/actions/[id] — HR
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess, cleanText } from '@/lib/talent'
import { ACTION_STATUSES } from '@/lib/voice'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const a = await prisma.pulseAction.findUnique({ where: { id }, select: { id: true, ownerId: true } })
  if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const hr = access.actualRole === 'HR_ADMIN' && !access.isPreviewMode
  const owner = !access.isPreviewMode && !!access.employeeId && a.ownerId === access.employeeId
  if (!hr && !owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as { status?: string; note?: string }
  const data: { status?: string; completedAt?: Date | null; note?: string | null } = {}
  if (body.status !== undefined) {
    if (!(ACTION_STATUSES as readonly string[]).includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    data.status = body.status
    data.completedAt = body.status === 'DONE' ? new Date() : null
  }
  if (body.note !== undefined) data.note = cleanText(body.note, 2000)
  await prisma.pulseAction.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.actualRole !== 'HR_ADMIN' || access.isPreviewMode) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const a = await prisma.pulseAction.findUnique({ where: { id }, select: { id: true } })
  if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.pulseAction.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
