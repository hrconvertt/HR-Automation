/**
 * PATCH /api/attendance/[employeeId]/[date]
 *
 * HR-only endpoint to manually edit a single attendance cell in the grid.
 * Upserts an AttendanceLog row for (employeeId, date) and writes an AuditLog
 * entry with the old → new value.
 *
 * Status values accepted: PRESENT | LEAVE | WFH | HALF_DAY | ABSENT
 *   PRESENT → workType=ONSITE, hours=8
 *   WFH     → status=PRESENT, workType=WFH, hours=8
 *   LEAVE   → workType=ONSITE, hours=0
 *   HALF_DAY→ workType=ONSITE, hours=4
 *   ABSENT  → workType=ONSITE, hours=0
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { parseLocalDate, endOfDay } from '@/lib/date-utils'
import { CELL_DEFAULTS, type CellStatus } from '@/lib/attendance-cell'

function parseDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  // Local midnight — matches the project-wide convention in date-utils (leave
  // writeback, corrections, grid buckets all use local-midnight day keys).
  const d = parseLocalDate(s)
  return isNaN(d.getTime()) ? null : d
}

interface RouteContext {
  params: Promise<{ employeeId: string; date: string }>
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  })
  // Honor hr_preview_role for writes: an HR admin previewing as another role
  // must not be able to edit cells while exploring that experience.
  const previewRole =
    user?.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user?.role
  if (!user || effectiveRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Only HR can edit attendance cells' }, { status: 403 })
  }

  const { employeeId, date: dateStr } = await ctx.params
  const date = parseDate(dateStr)
  if (!date) return NextResponse.json({ error: 'Invalid date (expected YYYY-MM-DD)' }, { status: 400 })

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, fullName: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const body = await request.json().catch(() => null) as { status?: string; note?: string } | null
  if (!body?.status || !(body.status in CELL_DEFAULTS)) {
    return NextResponse.json(
      { error: 'status must be one of PRESENT | LEAVE | WFH | HALF_DAY | ABSENT' },
      { status: 400 },
    )
  }
  const cell = CELL_DEFAULTS[body.status as CellStatus]
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''

  // Match by day RANGE — historical write paths stored the day's DateTime at
  // local vs UTC midnight, so exact equality on the unique key can miss.
  const existing = await prisma.attendanceLog.findFirst({
    where: { employeeId, date: { gte: date, lte: endOfDay(date) } },
    select: { id: true, status: true, workType: true, hoursWorked: true, notes: true },
  })

  const oldValue = existing
    ? { status: existing.status, workType: existing.workType, hoursWorked: existing.hoursWorked, notes: existing.notes }
    : null

  let saved
  if (existing) {
    saved = await prisma.attendanceLog.update({
      where: { id: existing.id },
      data: {
        status: cell.status,
        workType: cell.workType,
        hoursWorked: cell.hoursWorked,
        notes: note || existing.notes,
      },
    })
  } else {
    saved = await prisma.attendanceLog.create({
      data: {
        employeeId,
        date,
        status: cell.status,
        workType: cell.workType,
        hoursWorked: cell.hoursWorked,
        notes: note || null,
      },
    })
  }

  const newValue = {
    status: saved.status,
    workType: saved.workType,
    hoursWorked: saved.hoursWorked,
    notes: saved.notes,
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      employeeId,
      action: 'UPDATE',
      entity: 'AttendanceLog',
      entityId: saved.id,
      oldValue: oldValue ? JSON.stringify(oldValue) : null,
      newValue: JSON.stringify({ ...newValue, date: dateStr, note }),
    },
  })

  return NextResponse.json({
    ok: true,
    cell: {
      employeeId,
      date: dateStr,
      status: saved.status,
      workType: saved.workType,
    },
  })
}

/**
 * GET /api/attendance/[employeeId]/[date] — HR-only audit history for one cell.
 *
 * Returns the chronological trail of every change to that day: manual HR
 * edits, approved correction requests, and leave-approval writebacks. Sourced
 * from AuditLog rows (entity=AttendanceLog) whose newValue records the date.
 */
export async function GET(request: NextRequest, ctx: RouteContext) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  const previewRole =
    user?.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user?.role
  if (!user || effectiveRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Only HR can view cell history' }, { status: 403 })
  }

  const { employeeId, date: dateStr } = await ctx.params
  const date = parseDate(dateStr)
  if (!date) return NextResponse.json({ error: 'Invalid date (expected YYYY-MM-DD)' }, { status: 400 })

  const entries = await prisma.auditLog.findMany({
    where: {
      employeeId,
      entity: 'AttendanceLog',
      // Every attendance audit writer embeds `"date":"YYYY-MM-DD"` in newValue.
      newValue: { contains: `"date":"${dateStr}"` },
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })

  // AuditLog stores userId without a relation — resolve display names in bulk.
  const userIds = [...new Set(entries.map((e) => e.userId).filter((x): x is string => !!x))]
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, employee: { select: { fullName: true } } },
      })
    : []
  const nameByUser = new Map(users.map((u) => [u.id, u.employee?.fullName ?? u.email]))

  return NextResponse.json({
    history: entries.map((e) => {
      let oldVal: Record<string, unknown> | null = null
      let newVal: Record<string, unknown> | null = null
      try { oldVal = e.oldValue ? JSON.parse(e.oldValue) : null } catch { /* legacy */ }
      try { newVal = e.newValue ? JSON.parse(e.newValue) : null } catch { /* legacy */ }
      const source =
        newVal?.via === 'AttendanceCorrection' ? 'Correction request'
        : newVal?.via === 'LeaveApproval' ? 'Leave approval'
        : 'Manual HR edit'
      return {
        id: e.id,
        at: e.createdAt.toISOString(),
        by: (e.userId && nameByUser.get(e.userId)) || 'System',
        source,
        from: oldVal ? { status: oldVal.status, workType: oldVal.workType } : null,
        to: newVal ? { status: newVal.status, workType: newVal.workType } : null,
        note: typeof newVal?.note === 'string' && newVal.note ? newVal.note : null,
      }
    }),
  })
}
