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

type CellStatus = 'PRESENT' | 'LEAVE' | 'WFH' | 'HALF_DAY' | 'ABSENT'

const CELL_DEFAULTS: Record<CellStatus, { status: string; workType: string; hoursWorked: number }> = {
  PRESENT:  { status: 'PRESENT',  workType: 'ONSITE', hoursWorked: 8 },
  WFH:      { status: 'PRESENT',  workType: 'WFH',    hoursWorked: 8 },
  LEAVE:    { status: 'LEAVE',    workType: 'ONSITE', hoursWorked: 0 },
  HALF_DAY: { status: 'HALF_DAY', workType: 'ONSITE', hoursWorked: 4 },
  ABSENT:   { status: 'ABSENT',   workType: 'ONSITE', hoursWorked: 0 },
}

function parseDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

interface RouteContext {
  params: Promise<{ employeeId: string; date: string }>
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  })
  if (!user || user.role !== 'HR_ADMIN') {
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

  const existing = await prisma.attendanceLog.findUnique({
    where: { employeeId_date: { employeeId, date } },
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
