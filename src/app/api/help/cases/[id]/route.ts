/**
 * PATCH /api/help/cases/[id]
 *
 *   HR:            { status?, assignedToId?, resolution?, priority?, type? }
 *   The person or whoever raised it: { status: 'CLOSED' } to close it, or
 *                  { status: 'OPEN' } to reopen a resolved or closed case.
 *
 * The person the case is for is told when it is resolved or closed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { resolveTalentAccess, cleanText } from '@/lib/talent'
import { canSeeCase, isCaseAgent } from '@/lib/help-center-server'
import {
  CASE_STATUS_VALUES, CASE_PRIORITIES, CASE_TYPE_VALUES, caseLabel, caseStatusLabel, caseTypeOf,
} from '@/lib/help-center'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const t = await prisma.helpDeskTicket.findUnique({
    where: { id },
    select: { id: true, caseNumber: true, subject: true, status: true, employeeId: true, createdById: true },
  })
  if (!t || !canSeeCase(access, t)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json().catch(() => ({}))) as {
    status?: string; assignedToId?: string | null; resolution?: string; priority?: string; type?: string
  }
  const agent = isCaseAgent(access)
  const data: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (!CASE_STATUS_VALUES.includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    if (!agent) {
      const closing = body.status === 'CLOSED'
      const reopening = body.status === 'OPEN' && ['RESOLVED', 'CLOSED'].includes(t.status)
      if (access.isPreviewMode || (!closing && !reopening)) {
        return NextResponse.json({ error: 'You can close your case or reopen it; HR moves it along otherwise.' }, { status: 403 })
      }
    }
    data.status = body.status
    data.resolvedAt = ['RESOLVED', 'CLOSED'].includes(body.status) ? new Date() : null
  }

  if (!agent && (body.assignedToId !== undefined || body.resolution !== undefined || body.priority !== undefined || body.type !== undefined)) {
    return NextResponse.json({ error: 'Only HR can change that.' }, { status: 403 })
  }
  if (body.assignedToId !== undefined) {
    if (body.assignedToId) {
      const u = await prisma.user.findUnique({ where: { id: body.assignedToId }, select: { role: true } })
      if (!u || u.role !== 'HR_ADMIN') return NextResponse.json({ error: 'Assign it to someone in HR.' }, { status: 400 })
    }
    data.assignedToId = body.assignedToId || null
  }
  if (body.resolution !== undefined) data.resolution = cleanText(body.resolution, 5000)
  if (body.priority !== undefined) {
    if (!(CASE_PRIORITIES as readonly string[]).includes(body.priority)) return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
    data.priority = body.priority
  }
  if (body.type !== undefined) {
    if (!CASE_TYPE_VALUES.includes(body.type)) return NextResponse.json({ error: 'Invalid case type' }, { status: 400 })
    data.category = body.type
    data.serviceTeam = caseTypeOf(body.type).team
  }

  await prisma.helpDeskTicket.update({ where: { id }, data })

  if (typeof data.status === 'string' && data.status !== t.status && access.employeeId !== t.employeeId) {
    await notify({
      employeeId: t.employeeId,
      type: 'GENERAL',
      title: `Case ${caseLabel(t.caseNumber, t.id)} is ${caseStatusLabel(data.status).toLowerCase()}`,
      message: data.resolution ? String(data.resolution).slice(0, 240) : t.subject,
      link: `/dashboard/help/cases/${t.id}`,
    })
  }
  return NextResponse.json({ ok: true })
}
