/**
 * PATCH  /api/talent/development-items/[id] — move it along, rename it, re-date it
 * DELETE /api/talent/development-items/[id] — remove it
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DEV_STATUSES } from '@/lib/talent-labels'
import { resolveTalentAccess, canEditGrowth, parseDay, cleanText } from '@/lib/talent'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function load(id: string) {
  return prisma.developmentItem.findUnique({ where: { id }, select: { id: true, employeeId: true } })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const item = await load(id)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canEditGrowth(access, item.employeeId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    status?: string; title?: string; detail?: string; dueDate?: string | null
  }
  const data: {
    status?: string; completedAt?: Date | null; title?: string; detail?: string | null; dueDate?: Date | null
  } = {}

  if (body.status !== undefined) {
    if (!(DEV_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    data.status = body.status
    data.completedAt = body.status === 'COMPLETED' ? new Date() : null
  }
  if (body.title !== undefined) {
    const t = cleanText(body.title, 200)
    if (!t) return NextResponse.json({ error: 'The title cannot be empty.' }, { status: 400 })
    data.title = t
  }
  if (body.detail !== undefined) data.detail = cleanText(body.detail, 2000)
  if (body.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === '') data.dueDate = null
    else {
      const d = parseDay(body.dueDate)
      if (!d) return NextResponse.json({ error: 'Invalid due date' }, { status: 400 })
      data.dueDate = d
    }
  }

  await prisma.developmentItem.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const item = await load(id)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canEditGrowth(access, item.employeeId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await prisma.developmentItem.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
