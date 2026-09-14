/**
 * PATCH /api/career/suggestions/[id] — { dismissed: true } takes it off the
 * Career Hub. The person it was for, or whoever made it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess } from '@/lib/talent'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const s = await prisma.careerSuggestion.findUnique({
    where: { id }, select: { id: true, employeeId: true, suggestedById: true },
  })
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const mine = !access.isPreviewMode && !!access.employeeId
    && (s.employeeId === access.employeeId || s.suggestedById === access.employeeId)
  if (!mine) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { dismissed?: boolean }
  await prisma.careerSuggestion.update({
    where: { id }, data: { dismissedAt: body.dismissed === false ? null : new Date() },
  })
  return NextResponse.json({ ok: true })
}
