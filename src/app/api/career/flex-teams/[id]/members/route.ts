/**
 * Flex team membership.
 *
 *   POST                         the viewer expresses interest (the host is told)
 *   PATCH  { memberId, status }  host, creator or HR accepts (MEMBER) or declines
 *   DELETE                       the viewer withdraws their interest
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { resolveTalentAccess } from '@/lib/talent'
import { FLEX_MEMBER_STATUSES } from '@/lib/talent-labels'
import { flexTeamOwner } from '@/lib/flex-teams'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.isPreviewMode || !access.employeeId) {
    return NextResponse.json({ error: 'Your login is not linked to an employee record.' }, { status: 403 })
  }
  const { id } = await ctx.params
  const team = await prisma.flexTeam.findUnique({ where: { id }, select: { id: true, title: true, status: true, hostId: true } })
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (team.status !== 'OPEN') return NextResponse.json({ error: 'This flex team is not taking people.' }, { status: 400 })

  await prisma.flexTeamMember.upsert({
    where: { flexTeamId_employeeId: { flexTeamId: id, employeeId: access.employeeId } },
    update: { status: 'INTERESTED' },
    create: { flexTeamId: id, employeeId: access.employeeId },
  })
  if (team.hostId && team.hostId !== access.employeeId) {
    await notify({
      employeeId: team.hostId,
      type: 'GENERAL',
      title: 'Interest in your flex team',
      message: `${access.userName} would like to join "${team.title}".`,
      link: `/dashboard/career/flex-teams/${id}`,
    })
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const { team, may } = await flexTeamOwner(access, id)
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!may) return NextResponse.json({ error: 'Only the host, its creator or HR can do that.' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as { memberId?: string; status?: string }
  if (!body.memberId || !(FLEX_MEMBER_STATUSES as readonly string[]).includes(body.status ?? '')) {
    return NextResponse.json({ error: 'memberId and a valid status are required' }, { status: 400 })
  }
  const m = await prisma.flexTeamMember.findFirst({
    where: { id: body.memberId, flexTeamId: id }, select: { id: true, employeeId: true },
  })
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.flexTeamMember.update({ where: { id: m.id }, data: { status: body.status } })
  if (body.status !== 'INTERESTED') {
    await notify({
      employeeId: m.employeeId,
      type: 'GENERAL',
      title: body.status === 'MEMBER' ? 'You joined a flex team' : 'Flex team update',
      message: body.status === 'MEMBER'
        ? `You are on "${team.title}" now.`
        : `"${team.title}" could not take you this time.`,
      link: `/dashboard/career/flex-teams/${id}`,
    })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.employeeId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const m = await prisma.flexTeamMember.findUnique({
    where: { flexTeamId_employeeId: { flexTeamId: id, employeeId: access.employeeId } }, select: { id: true },
  })
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.flexTeamMember.delete({ where: { id: m.id } })
  return NextResponse.json({ ok: true })
}
