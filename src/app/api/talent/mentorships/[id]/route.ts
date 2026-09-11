/**
 * PATCH /api/talent/mentorships/[id] — { status: 'ACTIVE' | 'ENDED' }
 *
 * The mentee, the mentor, the mentee's manager or HR.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MENTORSHIP_STATUSES } from '@/lib/talent-labels'
import { resolveTalentAccess, canManageTalent } from '@/lib/talent'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const m = await prisma.mentorship.findUnique({
    where: { id }, select: { id: true, menteeId: true, mentorId: true, startedAt: true },
  })
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const party = !access.isPreviewMode && (access.employeeId === m.menteeId || access.employeeId === m.mentorId)
  if (!party && !(await canManageTalent(access, m.menteeId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as { status?: string }
  if (!body.status || !(MENTORSHIP_STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  await prisma.mentorship.update({
    where: { id },
    data: {
      status: body.status,
      startedAt: body.status === 'ACTIVE' ? (m.startedAt ?? new Date()) : m.startedAt,
      endedAt: body.status === 'ENDED' ? new Date() : null,
    },
  })
  return NextResponse.json({ ok: true })
}
