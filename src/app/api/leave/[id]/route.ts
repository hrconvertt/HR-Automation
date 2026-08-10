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
import { dayKey } from '@/lib/date-utils'
import { countWorkingDays, bracketsWeekendsFor } from '@/lib/leave-days'

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
 * HR correction of a leave record — all of it, not just how it is labelled.
 *
 * Most of this history was reconstructed from the attendance sheet, which
 * recorded that someone was away but not why, so those rows arrived as Casual
 * with a placeholder reason. Re-typing matters because Casual, Sick and Annual
 * draw on separate balances; leaving them all Casual charges the wrong bucket.
 *
 * Dates used to be frozen here on the grounds that moving them means rewriting
 * the attendance the approval already wrote. That is true, so this does it:
 * the old auto-written days are cleared, the new range is written, and the
 * balance moves by the difference. What it will not touch is a day somebody
 * edited by hand — that is their correction, not ours to overwrite.
 *
 *   Body: { leaveType?, reason?, category?, status?,
 *           fromDate?, toDate?, days?, firstDayHalf?, lastDayHalf? }
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
  let body: {
    leaveType?: string; reason?: string; category?: string; status?: string
    fromDate?: string; toDate?: string; days?: number
    firstDayHalf?: boolean; lastDayHalf?: boolean
  } = {}
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const found = await prisma.leaveRequest.findUnique({ where: { id } })
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Narrowing does not survive into the transaction closure below.
  const existing = found

  const ALLOWED_TYPES = ['CASUAL', 'SICK', 'UNPAID', 'ANNUAL', 'MATERNITY', 'PATERNITY']
  const ALLOWED_STATUS = ['PENDING', 'PENDING_HR', 'APPROVED', 'REJECTED', 'CANCELLED']
  if (body.leaveType && !ALLOWED_TYPES.includes(body.leaveType)) {
    return NextResponse.json({ error: `Unknown leave type: ${body.leaveType}` }, { status: 400 })
  }
  if (body.category && !['LEAVE', 'WFH'].includes(body.category)) {
    return NextResponse.json({ error: 'category must be LEAVE or WFH' }, { status: 400 })
  }
  if (body.status && !ALLOWED_STATUS.includes(body.status)) {
    return NextResponse.json({ error: `Unknown status: ${body.status}` }, { status: 400 })
  }

  const parseDay = (v: string | undefined, fallback: Date): Date | null => {
    if (v === undefined) { const d = new Date(fallback); d.setHours(0, 0, 0, 0); return d }
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const newFrom = parseDay(body.fromDate, existing.fromDate)
  const newTo = parseDay(body.toDate, existing.toDate)
  if (!newFrom || !newTo) {
    return NextResponse.json({ error: 'Dates must be YYYY-MM-DD' }, { status: 400 })
  }
  if (newTo < newFrom) {
    return NextResponse.json({ error: 'The end date is before the start date' }, { status: 400 })
  }

  const newType = body.leaveType ?? existing.leaveType
  const newCategory = body.category ?? existing.category
  const newStatus = body.status ?? existing.status
  const firstDayHalf = body.firstDayHalf ?? existing.firstDayHalf
  const lastDayHalf = body.lastDayHalf ?? existing.lastDayHalf

  // Public holidays across both the old and the new range — free days, so they
  // neither charge the balance nor get an attendance row written over them.
  const spanFrom = newFrom < existing.fromDate ? newFrom : existing.fromDate
  const spanTo = newTo > existing.toDate ? newTo : existing.toDate
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: spanFrom, lte: spanTo } },
    select: { date: true },
  })
  const holidayKeys = new Set(holidays.map((h) => dayKey(h.date)))

  // The day count follows the dates unless HR typed one in.
  const recomputed = countWorkingDays(newFrom, newTo, {
    firstDayHalf, lastDayHalf, holidayDates: holidayKeys,
    bracketWeekends: bracketsWeekendsFor(newType),
  })
  const newDays = typeof body.days === 'number' && Number.isFinite(body.days) && body.days >= 0
    ? body.days
    : recomputed

  // What each version of this record charges. Reversing the old and applying
  // the new covers every combination — a re-type, a date move, a day-count
  // change, an approval being undone — without a branch for each.
  const charges = (s: string, c: string) => s === 'APPROVED' && c === 'LEAVE'
  const oldCharge = charges(existing.status, existing.category) ? existing.days : 0
  const newCharge = charges(newStatus, newCategory) ? newDays : 0

  const updated = await prisma.$transaction(async (tx) => {
    async function moveBalance(leaveType: string, year: number, delta: number) {
      if (delta === 0) return
      const bal = await tx.leaveBalance.findFirst({
        where: { employeeId: existing.employeeId, leaveType, year },
      })
      if (!bal) return
      const used = Math.max(0, bal.used + delta)
      await tx.leaveBalance.update({
        where: { id: bal.id },
        data: { used, remaining: bal.allocated - used },
      })
    }

    await moveBalance(existing.leaveType, existing.fromDate.getFullYear(), -oldCharge)
    await moveBalance(newType, newFrom.getFullYear(), newCharge)

    // Clear the attendance the previous version wrote, so a moved range does
    // not leave leave-marked days stranded behind it.
    const oldFrom = new Date(existing.fromDate); oldFrom.setHours(0, 0, 0, 0)
    const oldTo = new Date(existing.toDate); oldTo.setHours(23, 59, 59, 999)
    await tx.attendanceLog.deleteMany({
      where: {
        employeeId: existing.employeeId,
        date: { gte: oldFrom, lte: oldTo },
        notes: { startsWith: 'Auto-written from approved' },
      },
    })

    const row = await tx.leaveRequest.update({
      where: { id },
      data: {
        leaveType: newType,
        category: newCategory,
        status: newStatus,
        fromDate: newFrom,
        toDate: newTo,
        days: newDays,
        firstDayHalf,
        lastDayHalf,
        ...(typeof body.reason === 'string' ? { reason: body.reason.trim().slice(0, 2000) } : {}),
      },
    })

    // Write the new range back out, in the shape the approval writes.
    if (newStatus === 'APPROVED') {
      const isWfh = newCategory === 'WFH'
      const cursor = new Date(newFrom)
      const end = new Date(newTo)
      while (cursor <= end) {
        const dow = cursor.getDay()
        const k = dayKey(cursor)
        if (dow !== 0 && dow !== 6 && !holidayKeys.has(k)) {
          const isHalf =
            (cursor.getTime() === newFrom.getTime() && firstDayHalf) ||
            (cursor.getTime() === end.getTime() && lastDayHalf)
          const dayDate = new Date(cursor)
          const data = {
            status: isWfh ? 'PRESENT' : isHalf ? 'HALF_DAY' : 'LEAVE',
            workType: isWfh ? 'WFH' : 'ONSITE',
            hoursWorked: isWfh ? (isHalf ? 4 : 8) : isHalf ? 4 : 0,
            notes: isWfh
              ? 'Auto-written from approved work from home'
              : `Auto-written from approved leave (${newType})`,
          }
          await tx.attendanceLog.upsert({
            where: { employeeId_date: { employeeId: existing.employeeId, date: dayDate } },
            update: data,
            create: { employeeId: existing.employeeId, date: dayDate, ...data },
          })
        }
        cursor.setDate(cursor.getDate() + 1)
      }
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
          status: existing.status, days: existing.days,
          fromDate: dayKey(existing.fromDate), toDate: dayKey(existing.toDate),
        }),
        newValue: JSON.stringify({
          leaveType: row.leaveType, reason: row.reason, category: row.category,
          status: row.status, days: row.days,
          fromDate: dayKey(row.fromDate), toDate: dayKey(row.toDate),
        }),
      },
    })

    return row
  }, { timeout: 120000 })

  return NextResponse.json({ request: updated, recomputedDays: recomputed })
}
