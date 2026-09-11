/**
 * PATCH /api/talent/check-ins/[id] — record how a check-in went, move it, or
 * cancel it.
 * body: { status?: 'SCHEDULED' | 'DONE' | 'CANCELLED', notes?, scheduledFor? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CHECK_IN_STATUSES } from '@/lib/talent-labels'
import { resolveTalentAccess, canManageTalent, parseDay } from '@/lib/talent'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const checkIn = await prisma.checkIn.findUnique({ where: { id }, select: { id: true, employeeId: true } })
  if (!checkIn) return NextResponse.json({ error: 'Check-in not found' }, { status: 404 })
  if (!(await canManageTalent(access, checkIn.employeeId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    status?: string; notes?: string; scheduledFor?: string
  }
  const data: { status?: string; completedAt?: Date | null; notes?: string | null; scheduledFor?: Date } = {}

  if (body.status !== undefined) {
    if (!(CHECK_IN_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    data.status = body.status
    data.completedAt = body.status === 'DONE' ? new Date() : null
  }
  if (typeof body.notes === 'string') data.notes = body.notes.trim().slice(0, 4000) || null
  if (body.scheduledFor !== undefined) {
    const d = parseDay(body.scheduledFor)
    if (!d) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    data.scheduledFor = d
  }

  await prisma.checkIn.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}
