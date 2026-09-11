/**
 * POST /api/talent/check-ins — schedule a one-to-one with a report.
 * body: { employeeId, scheduledFor: 'YYYY-MM-DD', topics?: string[] }
 *
 * The report's own manager or HR. The report is told the date, so the
 * check-in is not a surprise on the day.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import {
  resolveTalentAccess, canManageTalent, parseDay, formatDay, cleanText,
} from '@/lib/talent'

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as {
    employeeId?: string; scheduledFor?: string; topics?: unknown
  }
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : ''
  if (!employeeId) return NextResponse.json({ error: 'employeeId is required' }, { status: 400 })
  if (!(await canManageTalent(access, employeeId))) {
    return NextResponse.json(
      { error: 'Only HR or the employee’s manager can schedule a check-in.' },
      { status: 403 },
    )
  }

  const scheduledFor = parseDay(body.scheduledFor)
  if (!scheduledFor) return NextResponse.json({ error: 'Pick a date for the check-in.' }, { status: 400 })

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, status: true, reportingManagerId: true },
  })
  if (!employee || employee.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Employee not found or not active.' }, { status: 404 })
  }

  const topics = Array.isArray(body.topics)
    ? body.topics.map((t) => cleanText(t, 200)).filter((t): t is string => !!t).slice(0, 20)
    : []

  const created = await prisma.checkIn.create({
    data: {
      employeeId,
      managerId: employee.reportingManagerId ?? access.employeeId,
      scheduledFor,
      createdById: access.userId,
      topics: { create: topics.map((title) => ({ title })) },
    },
    select: { id: true, scheduledFor: true },
  })

  if (access.employeeId !== employeeId) {
    await notify({
      employeeId,
      type: 'GENERAL',
      title: 'Check-in scheduled',
      message: `${access.userName} set up a check-in with you for ${formatDay(scheduledFor)}.`,
    })
  }

  return NextResponse.json({ checkIn: created }, { status: 201 })
}
