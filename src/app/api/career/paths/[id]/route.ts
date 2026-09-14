/**
 * PATCH  /api/career/paths/[id] — { name } rename
 * DELETE /api/career/paths/[id] — delete
 *
 * The owner only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess, cleanText } from '@/lib/talent'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function own(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { id } = await ctx.params
  const p = await prisma.careerPath.findUnique({ where: { id }, select: { id: true, employeeId: true } })
  if (!p) return { res: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (access.isPreviewMode || p.employeeId !== access.employeeId) {
    return { res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { id }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const o = await own(request, ctx)
  if ('res' in o) return o.res
  const body = (await request.json().catch(() => ({}))) as { name?: string }
  const name = cleanText(body.name, 80)
  if (!name) return NextResponse.json({ error: 'Name the path.' }, { status: 400 })
  await prisma.careerPath.update({ where: { id: o.id }, data: { name } })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const o = await own(request, ctx)
  if ('res' in o) return o.res
  await prisma.careerPath.delete({ where: { id: o.id } })
  return NextResponse.json({ ok: true })
}
