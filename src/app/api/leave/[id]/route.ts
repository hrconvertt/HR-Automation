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
  const payload = token ? await verifyToken(token) : null
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
