/**
 * PATCH  /api/help/articles/[id] — edit, publish or unpublish (HR)
 * DELETE /api/help/articles/[id] — delete it (HR)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess } from '@/lib/talent'
import { ARTICLE_CATEGORY_KEYS, ARTICLE_STATUSES, ARTICLE_AUDIENCE_ROLES } from '@/lib/help-center'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function gate(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (access.actualRole !== 'HR_ADMIN' || access.isPreviewMode) {
    return { res: NextResponse.json({ error: 'Only HR edits Help Center articles.' }, { status: 403 }) }
  }
  const { id } = await ctx.params
  const article = await prisma.helpArticle.findUnique({ where: { id }, select: { id: true } })
  if (!article) return { res: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { id, access }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const g = await gate(request, ctx)
  if ('res' in g) return g.res
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const data: Record<string, unknown> = { updatedById: g.access.userId }

  if (body.title !== undefined) {
    const t = typeof body.title === 'string' ? body.title.trim().slice(0, 160) : ''
    if (!t) return NextResponse.json({ error: 'The title cannot be empty.' }, { status: 400 })
    data.title = t
  }
  if (body.body !== undefined) {
    const b = typeof body.body === 'string' ? body.body.trim().slice(0, 50_000) : ''
    if (!b) return NextResponse.json({ error: 'The body cannot be empty.' }, { status: 400 })
    data.body = b
  }
  if (body.summary !== undefined) data.summary = typeof body.summary === 'string' && body.summary.trim() ? body.summary.trim().slice(0, 300) : null
  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || !ARTICLE_CATEGORY_KEYS.includes(body.category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }
    data.category = body.category
  }
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !(ARTICLE_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    data.status = body.status
  }
  if (Array.isArray(body.tags)) {
    data.tags = [...new Set(body.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 15)
  }
  if (Array.isArray(body.audienceRoles)) {
    data.audienceRoles = body.audienceRoles.filter((r): r is string => typeof r === 'string' && (ARTICLE_AUDIENCE_ROLES as readonly string[]).includes(r))
  }

  await prisma.helpArticle.update({ where: { id: g.id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const g = await gate(request, ctx)
  if ('res' in g) return g.res
  await prisma.$transaction([
    prisma.articleFeedback.deleteMany({ where: { refType: 'ARTICLE', refId: g.id } }),
    prisma.helpArticle.delete({ where: { id: g.id } }),
  ])
  return NextResponse.json({ ok: true })
}
