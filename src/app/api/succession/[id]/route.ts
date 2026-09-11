/**
 * PATCH  /api/succession/[id] — { roleTitle?, incumbentId?, critical?, note? }
 * DELETE /api/succession/[id] — remove the plan and its candidates
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess, canManageSuccession, cleanText } from '@/lib/talent'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageSuccession(access)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params

  const plan = await prisma.successionPlan.findUnique({ where: { id }, select: { id: true } })
  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json().catch(() => ({}))) as {
    roleTitle?: string; incumbentId?: string | null; critical?: boolean; note?: string
  }
  const data: { roleTitle?: string; incumbentId?: string | null; critical?: boolean; note?: string | null } = {}

  if (body.roleTitle !== undefined) {
    const t = cleanText(body.roleTitle, 120)
    if (!t) return NextResponse.json({ error: 'The role needs a name.' }, { status: 400 })
    data.roleTitle = t
  }
  if (body.incumbentId !== undefined) {
    if (!body.incumbentId) data.incumbentId = null
    else {
      const e = await prisma.employee.findUnique({ where: { id: body.incumbentId }, select: { id: true, status: true } })
      if (!e || e.status !== 'ACTIVE') {
        return NextResponse.json({ error: 'The incumbent must be an active employee.' }, { status: 400 })
      }
      data.incumbentId = e.id
    }
  }
  if (typeof body.critical === 'boolean') data.critical = body.critical
  if (body.note !== undefined) data.note = cleanText(body.note, 1000)

  await prisma.successionPlan.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageSuccession(access)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const plan = await prisma.successionPlan.findUnique({ where: { id }, select: { id: true } })
  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.successionPlan.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
