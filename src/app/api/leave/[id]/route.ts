/**
 * DELETE /api/leave/[id]
 *
 * HR-only hard delete. Used to clean up test leaves or genuine mistakes
 * that already made it through approval. Cleans up the side-effects too:
 *
 *   1) Delete the LeaveRequest row
 *   2) Delete any AttendanceLog rows that were auto-written on HR_APPROVE
 *      for the same employee on dates inside this leave's range
 *   3) Restore LeaveBalance.used (decrement by the days we just freed)
 *
 * Everything is wrapped in a transaction so partial failure rolls back.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }

  const { id } = await params
  const leave = await prisma.leaveRequest.findUnique({ where: { id } })
  if (!leave) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Build the inclusive list of dates inside the leave range — we'll wipe
  // any AttendanceLog rows for those dates so the calendar / grid clears.
  const fromUtc = new Date(Date.UTC(
    leave.fromDate.getUTCFullYear(),
    leave.fromDate.getUTCMonth(),
    leave.fromDate.getUTCDate(),
  ))
  const toUtc = new Date(Date.UTC(
    leave.toDate.getUTCFullYear(),
    leave.toDate.getUTCMonth(),
    leave.toDate.getUTCDate(),
    23, 59, 59, 999,
  ))

  const wasApproved = leave.status === 'APPROVED'
  const daysToRestore = wasApproved ? leave.days : 0

  await prisma.$transaction(async (tx) => {
    // 1) Wipe AttendanceLog rows written by the approval
    if (wasApproved) {
      await tx.attendanceLog.deleteMany({
        where: {
          employeeId: leave.employeeId,
          date: { gte: fromUtc, lte: toUtc },
          status: { in: ['LEAVE', 'HALF_DAY'] },
        },
      })
    }

    // 2) Restore LeaveBalance.used for the right year + leaveType
    if (daysToRestore > 0) {
      const year = leave.fromDate.getUTCFullYear()
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_year_leaveType: {
            employeeId: leave.employeeId,
            year,
            leaveType: leave.leaveType,
          },
        },
      })
      if (balance) {
        const newUsed = Math.max(0, balance.used - daysToRestore)
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { used: newUsed, remaining: balance.allocated - newUsed },
        })
      }
    }

    // 3) Delete the LeaveRequest itself
    await tx.leaveRequest.delete({ where: { id } })
  })

  return NextResponse.json({
    success: true,
    cleared: {
      attendanceCleared: wasApproved,
      daysRestored: daysToRestore,
    },
  })
}

/**
 * PATCH /api/leave/[id]
 *
 * HR correction of a record's classification and reason.
 *
 * Most of the leave history here was reconstructed from the attendance sheet,
 * which recorded that someone was away but not why — so every one of those rows
 * came through as Casual with a placeholder reason. Casual and Sick draw on
 * separate balances, so leaving them all as Casual is not a cosmetic problem:
 * it charges the wrong bucket.
 *
 * Only the classification is editable. Dates and day counts stay put — moving
 * those would mean rewriting the attendance rows the approval already wrote,
 * which is a different operation with different consequences.
 *
 *   Body: { leaveType?, reason?, category? }
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }
  if (request.cookies.get('hr_preview_role')?.value) {
    return NextResponse.json({ error: 'Leave preview mode to edit records.' }, { status: 403 })
  }

  const { id } = await params
  let body: { leaveType?: string; reason?: string; category?: string } = {}
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const existing = await prisma.leaveRequest.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ALLOWED_TYPES = ['CASUAL', 'SICK', 'UNPAID', 'ANNUAL', 'MATERNITY', 'PATERNITY']
  if (body.leaveType && !ALLOWED_TYPES.includes(body.leaveType)) {
    return NextResponse.json({ error: `Unknown leave type: ${body.leaveType}` }, { status: 400 })
  }
  if (body.category && !['LEAVE', 'WFH'].includes(body.category)) {
    return NextResponse.json({ error: 'category must be LEAVE or WFH' }, { status: 400 })
  }

  const typeChanged = !!body.leaveType && body.leaveType !== existing.leaveType

  const updated = await prisma.$transaction(async (tx) => {
    // An approved day has already been charged to a balance. Re-typing it has
    // to move the charge, or the old bucket stays short and the new one never
    // gets debited.
    if (typeChanged && existing.status === 'APPROVED' && existing.category === 'LEAVE') {
      const year = existing.fromDate.getFullYear()
      const from = await tx.leaveBalance.findFirst({
        where: { employeeId: existing.employeeId, leaveType: existing.leaveType, year },
      })
      if (from) {
        await tx.leaveBalance.update({
          where: { id: from.id },
          data: {
            used: Math.max(0, from.used - existing.days),
            remaining: from.remaining + existing.days,
          },
        })
      }
      const to = await tx.leaveBalance.findFirst({
        where: { employeeId: existing.employeeId, leaveType: body.leaveType!, year },
      })
      if (to) {
        await tx.leaveBalance.update({
          where: { id: to.id },
          data: {
            used: to.used + existing.days,
            remaining: Math.max(0, to.remaining - existing.days),
          },
        })
      }
    }

    const row = await tx.leaveRequest.update({
      where: { id },
      data: {
        ...(body.leaveType ? { leaveType: body.leaveType } : {}),
        ...(body.category ? { category: body.category } : {}),
        ...(typeof body.reason === 'string' ? { reason: body.reason.trim().slice(0, 2000) } : {}),
      },
    })

    // The attendance note names the leave type, so a re-type has to reach the
    // grid too — otherwise the cell still reads "(CASUAL)" for a sick day.
    if (typeChanged && existing.status === 'APPROVED') {
      await tx.attendanceLog.updateMany({
        where: {
          employeeId: existing.employeeId,
          date: { gte: existing.fromDate, lte: existing.toDate },
          notes: { contains: 'approved leave' },
        },
        data: { notes: `Auto-written from approved leave (${body.leaveType})` },
      })
    }

    await tx.auditLog.create({
      data: {
        userId: payload.userId,
        employeeId: existing.employeeId,
        action: 'UPDATE',
        entity: 'LeaveRequest',
        entityId: id,
        oldValue: JSON.stringify({
          leaveType: existing.leaveType, reason: existing.reason, category: existing.category,
        }),
        newValue: JSON.stringify({
          leaveType: row.leaveType, reason: row.reason, category: row.category,
        }),
      },
    })

    return row
  })

  return NextResponse.json({ request: updated })
}
