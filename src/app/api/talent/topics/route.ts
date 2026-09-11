/**
 * Check-in topics.
 *
 *   POST   { employeeId, title, source?, sourceId?, checkInId? }
 *          Adds a topic to the given check-in, or to the report's next
 *          scheduled one — and if none is scheduled, schedules one a week out.
 *          That is Workday's "Add as Topic to Check-In": one click from a
 *          suggested action, without first having to go and book a meeting.
 *   PATCH  { topicId, done }   tick a topic off
 *   DELETE ?topicId=           remove it
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { TOPIC_SOURCES } from '@/lib/talent-labels'
import { resolveTalentAccess, canManageTalent, cleanText, formatDay } from '@/lib/talent'

const WEEK = 7 * 86_400_000

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as {
    employeeId?: string; title?: string; source?: string; sourceId?: string; checkInId?: string
  }
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : ''
  const title = cleanText(body.title, 200)
  if (!employeeId || !title) {
    return NextResponse.json({ error: 'employeeId and title are required' }, { status: 400 })
  }
  if (!(await canManageTalent(access, employeeId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const source = (TOPIC_SOURCES as readonly string[]).includes(body.source ?? '') ? body.source! : 'MANUAL'
  const sourceId = source !== 'MANUAL' && typeof body.sourceId === 'string' ? body.sourceId : null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let checkIn: { id: string; scheduledFor: Date } | null = null
  let scheduledNow = false
  if (body.checkInId) {
    checkIn = await prisma.checkIn.findFirst({
      where: { id: body.checkInId, employeeId, status: 'SCHEDULED' },
      select: { id: true, scheduledFor: true },
    })
    if (!checkIn) return NextResponse.json({ error: 'That check-in is not open.' }, { status: 400 })
  } else {
    checkIn = await prisma.checkIn.findFirst({
      where: { employeeId, status: 'SCHEDULED', scheduledFor: { gte: today } },
      orderBy: { scheduledFor: 'asc' },
      select: { id: true, scheduledFor: true },
    })
    if (!checkIn) {
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId }, select: { reportingManagerId: true, status: true },
      })
      if (!employee || employee.status !== 'ACTIVE') {
        return NextResponse.json({ error: 'Employee not found or not active.' }, { status: 404 })
      }
      checkIn = await prisma.checkIn.create({
        data: {
          employeeId,
          managerId: employee.reportingManagerId ?? access.employeeId,
          scheduledFor: new Date(today.getTime() + WEEK),
          createdById: access.userId,
        },
        select: { id: true, scheduledFor: true },
      })
      scheduledNow = true
    }
  }

  // The same suggestion twice on one check-in is noise.
  if (sourceId) {
    const dup = await prisma.checkInTopic.findFirst({
      where: { checkInId: checkIn.id, source, sourceId }, select: { id: true },
    })
    if (dup) {
      return NextResponse.json({
        ok: true, already: true, checkInId: checkIn.id, scheduledFor: checkIn.scheduledFor,
      })
    }
  }

  await prisma.checkInTopic.create({ data: { checkInId: checkIn.id, title, source, sourceId } })

  if (scheduledNow && access.employeeId !== employeeId) {
    await notify({
      employeeId,
      type: 'GENERAL',
      title: 'Check-in scheduled',
      message: `${access.userName} set up a check-in with you for ${formatDay(checkIn.scheduledFor)}.`,
    })
  }

  return NextResponse.json({
    ok: true, checkInId: checkIn.id, scheduledFor: checkIn.scheduledFor, scheduledNow,
  }, { status: 201 })
}

async function topicWithOwner(topicId: string) {
  return prisma.checkInTopic.findUnique({
    where: { id: topicId },
    select: { id: true, checkIn: { select: { employeeId: true } } },
  })
}

export async function PATCH(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { topicId?: string; done?: boolean }
  if (!body.topicId || typeof body.done !== 'boolean') {
    return NextResponse.json({ error: 'topicId and done are required' }, { status: 400 })
  }
  const topic = await topicWithOwner(body.topicId)
  if (!topic) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canManageTalent(access, topic.checkIn.employeeId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await prisma.checkInTopic.update({ where: { id: topic.id }, data: { done: body.done } })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const topicId = request.nextUrl.searchParams.get('topicId')
  if (!topicId) return NextResponse.json({ error: 'topicId is required' }, { status: 400 })
  const topic = await topicWithOwner(topicId)
  if (!topic) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canManageTalent(access, topic.checkIn.employeeId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await prisma.checkInTopic.delete({ where: { id: topic.id } })
  return NextResponse.json({ ok: true })
}
