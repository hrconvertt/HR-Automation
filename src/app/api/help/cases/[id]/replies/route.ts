/**
 * POST /api/help/cases/[id]/replies — { message, internal? }
 *
 * Anyone who can see the case replies. Internal notes are HR's alone and are
 * never shown to the person the case is for. A reply from HR tells the person;
 * a reply from the person tells the assignee, or HR if nobody is assigned —
 * and moves a case waiting on them back to In progress.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify, notifyMany } from '@/lib/notifications'
import { resolveTalentAccess } from '@/lib/talent'
import { canSeeCase, isCaseAgent, hrAdminEmployeeIds } from '@/lib/help-center-server'
import { caseLabel } from '@/lib/help-center'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.isPreviewMode) return NextResponse.json({ error: 'Switch back to your own view to reply.' }, { status: 403 })
  const { id } = await ctx.params
  const t = await prisma.helpDeskTicket.findUnique({
    where: { id },
    select: { id: true, caseNumber: true, subject: true, status: true, employeeId: true, createdById: true, assignedToId: true },
  })
  if (!t || !canSeeCase(access, t)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json().catch(() => ({}))) as { message?: string; internal?: boolean }
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 5000) : ''
  if (!message) return NextResponse.json({ error: 'Write a reply first.' }, { status: 400 })
  const agent = isCaseAgent(access)
  const internal = agent && body.internal === true

  await prisma.ticketReply.create({ data: { ticketId: id, authorId: access.userId, message, isInternal: internal } })

  const label = caseLabel(t.caseNumber, t.id)
  const link = `/dashboard/help/cases/${t.id}`
  if (!internal) {
    if (agent) {
      await prisma.helpDeskTicket.update({ where: { id }, data: { status: t.status === 'OPEN' ? 'IN_PROGRESS' : t.status } })
      if (access.employeeId !== t.employeeId) {
        await notify({ employeeId: t.employeeId, type: 'GENERAL', title: `Reply on case ${label}`, message: message.slice(0, 240), link })
      }
    } else {
      if (t.status === 'ON_HOLD' || t.status === 'RESOLVED') {
        await prisma.helpDeskTicket.update({ where: { id }, data: { status: 'IN_PROGRESS', resolvedAt: null } })
      } else {
        await prisma.helpDeskTicket.update({ where: { id }, data: { updatedAt: new Date() } })
      }
      let to: string[] = []
      if (t.assignedToId) {
        const u = await prisma.user.findUnique({ where: { id: t.assignedToId }, select: { employee: { select: { id: true } } } })
        if (u?.employee) to = [u.employee.id]
      }
      if (to.length === 0) to = await hrAdminEmployeeIds()
      to = to.filter((x) => x !== access.employeeId)
      if (to.length) {
        await notifyMany(to, { type: 'GENERAL', title: `Reply on case ${label}`, message: `${access.userName}: ${message.slice(0, 200)}`, link })
      }
    }
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}
