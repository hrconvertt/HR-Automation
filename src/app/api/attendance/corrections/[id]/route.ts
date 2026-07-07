/**
 * PATCH /api/attendance/corrections/[id] — HR reviews a correction request.
 *
 * Body: { action: 'APPROVE' | 'REJECT', comment?: string }
 *   APPROVE — upserts the AttendanceLog row for (employee, date) using the
 *             same status mapping as the HR cell-edit endpoint, writes an
 *             AuditLog entry, then notifies the employee.
 *   REJECT  — requires a comment; notifies the employee with it.
 *
 * Gate: HR_ADMIN only, honoring hr_preview_role for writes — an HR admin
 * previewing as another role is denied.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import { dayKey, endOfDay } from '@/lib/date-utils'

const CELL_DEFAULTS: Record<string, { status: string; workType: string; hoursWorked: number }> = {
  PRESENT:  { status: 'PRESENT',  workType: 'ONSITE', hoursWorked: 8 },
  WFH:      { status: 'PRESENT',  workType: 'WFH',    hoursWorked: 8 },
  LEAVE:    { status: 'LEAVE',    workType: 'ONSITE', hoursWorked: 0 },
  HALF_DAY: { status: 'HALF_DAY', workType: 'ONSITE', hoursWorked: 4 },
}

const STATUS_LABEL: Record<string, string> = {
  PRESENT: 'Present',
  WFH: 'Work From Home',
  LEAVE: 'Leave',
  HALF_DAY: 'Half Day',
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Honor hr_preview_role for writes: an HR admin previewing as another role
  // must not be able to review corrections.
  const previewRole = user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  if (effectiveRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Only HR can review correction requests' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = (await request.json().catch(() => null)) as {
    action?: string
    comment?: string
  } | null
  const action = body?.action?.toUpperCase()
  if (action !== 'APPROVE' && action !== 'REJECT') {
    return NextResponse.json({ error: 'action must be APPROVE or REJECT' }, { status: 400 })
  }
  const comment = (body?.comment ?? '').trim().slice(0, 1000)
  if (action === 'REJECT' && !comment) {
    return NextResponse.json({ error: 'A comment is required to reject a request' }, { status: 400 })
  }

  const correction = await prisma.attendanceCorrection.findUnique({
    where: { id },
    include: { employee: { select: { id: true, fullName: true } } },
  })
  if (!correction) return NextResponse.json({ error: 'Correction request not found' }, { status: 404 })
  if (correction.status !== 'PENDING') {
    return NextResponse.json({ error: 'This request has already been reviewed' }, { status: 409 })
  }

  const dateStr = dayKey(correction.date)

  if (action === 'APPROVE') {
    const cell = CELL_DEFAULTS[correction.requestedStatus]
    if (!cell) {
      return NextResponse.json({ error: `Unknown requested status: ${correction.requestedStatus}` }, { status: 400 })
    }

    // Match by day RANGE — different write paths store the day's DateTime at
    // local vs UTC midnight, so exact equality on the unique key can miss.
    const existing = await prisma.attendanceLog.findFirst({
      where: {
        employeeId: correction.employeeId,
        date: { gte: correction.date, lte: endOfDay(correction.date) },
      },
      select: { id: true, status: true, workType: true, hoursWorked: true, notes: true },
    })
    const note = `Attendance correction approved by HR (request ${correction.id}): ${correction.reason}`

    const saved = existing
      ? await prisma.attendanceLog.update({
          where: { id: existing.id },
          data: { status: cell.status, workType: cell.workType, hoursWorked: cell.hoursWorked, notes: note },
        })
      : await prisma.attendanceLog.create({
          data: {
            employeeId: correction.employeeId,
            date: correction.date,
            status: cell.status,
            workType: cell.workType,
            hoursWorked: cell.hoursWorked,
            notes: note,
          },
        })

    await prisma.attendanceCorrection.update({
      where: { id: correction.id },
      data: { status: 'APPROVED', reviewedById: user.id, reviewComment: comment || null },
    })

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        employeeId: correction.employeeId,
        action: 'UPDATE',
        entity: 'AttendanceLog',
        entityId: saved.id,
        oldValue: existing
          ? JSON.stringify({ status: existing.status, workType: existing.workType, hoursWorked: existing.hoursWorked })
          : null,
        newValue: JSON.stringify({
          status: saved.status,
          workType: saved.workType,
          hoursWorked: saved.hoursWorked,
          date: dateStr,
          via: 'AttendanceCorrection',
          correctionId: correction.id,
        }),
      },
    })

    await notify({
      employeeId: correction.employeeId,
      type: 'ATTENDANCE_CORRECTION_APPROVED',
      title: 'Attendance correction approved',
      message: `Your attendance for ${dateStr} has been updated to ${STATUS_LABEL[correction.requestedStatus] ?? correction.requestedStatus}.${comment ? ` Note: ${comment}` : ''}`,
      link: `/dashboard/attendance/${correction.employeeId}`,
    })

    return NextResponse.json({ ok: true, status: 'APPROVED' })
  }

  // REJECT
  await prisma.attendanceCorrection.update({
    where: { id: correction.id },
    data: { status: 'REJECTED', reviewedById: user.id, reviewComment: comment },
  })

  await notify({
    employeeId: correction.employeeId,
    type: 'ATTENDANCE_CORRECTION_REJECTED',
    title: 'Attendance correction rejected',
    message: `Your correction request for ${dateStr} was rejected: ${comment}`,
    link: `/dashboard/attendance/${correction.employeeId}`,
  })

  return NextResponse.json({ ok: true, status: 'REJECTED' })
}
