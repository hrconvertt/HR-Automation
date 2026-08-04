/**
 * PATCH  /api/holidays/[id]   — apply or un-apply a holiday
 * DELETE /api/holidays/[id]   — remove it entirely
 *
 * A holiday sitting on the calendar is not the same as it being taken. HR
 * decides each one against workload, so nothing touches attendance until it is
 * applied.
 *
 * Applying writes HOLIDAY (or WFH) across everyone employed on that date.
 * Un-applying reverses exactly what it wrote — rows it created are deleted,
 * rows it overwrote are restored to PRESENT — so a mistaken apply is not
 * permanent.
 *
 *   Body: { applied: boolean }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function requireHr(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { ok: false as const, status: 401, error: 'Unauthorized' }
  const me = await prisma.user.findUnique({
    where: { id: payload.userId }, select: { role: true },
  })
  if (!me || me.role !== 'HR_ADMIN') {
    return { ok: false as const, status: 403, error: 'Forbidden — HR only' }
  }
  if (request.cookies.get('hr_preview_role')?.value) {
    return { ok: false as const, status: 403, error: 'Leave preview mode to change holidays.' }
  }
  return { ok: true as const, userId: payload.userId }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const gate = await requireHr(request)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: { applied?: boolean } = {}
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (typeof body.applied !== 'boolean') {
    return NextResponse.json({ error: 'applied must be boolean' }, { status: 400 })
  }

  const holiday = await prisma.holiday.findUnique({
    where: { id }, select: { id: true, name: true, date: true, type: true, applied: true },
  })
  if (!holiday) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const date = holiday.date
  const mark = holiday.type === 'WFH' ? 'PRESENT' : 'HOLIDAY'
  const workType = holiday.type === 'WFH' ? 'WFH' : 'ONSITE'

  // Only people employed on the day. A closure cannot apply to someone who had
  // not joined, or had already left.
  const employees = await prisma.employee.findMany({
    where: {
      joiningDate: { lte: date },
      OR: [{ exitDate: null }, { exitDate: { gte: date } }],
    },
    select: { id: true },
  })

  let changed = 0

  if (body.applied) {
    for (const e of employees) {
      const existing = await prisma.attendanceLog.findFirst({
        where: { employeeId: e.id, date }, select: { id: true, status: true },
      })
      if (existing) {
        if (existing.status !== mark) {
          await prisma.attendanceLog.update({
            where: { id: existing.id },
            data: { status: mark, workType, notes: holiday.name },
          })
          changed++
        }
      } else {
        await prisma.attendanceLog.create({
          data: { employeeId: e.id, date, status: mark, workType, notes: holiday.name },
        })
        changed++
      }
    }
  } else {
    // Reverse only what this holiday wrote. The note is the marker: rows this
    // apply touched carry the holiday's name, so anything else — a genuine
    // leave, a manual correction — is left alone.
    const mine = await prisma.attendanceLog.findMany({
      where: { date, notes: holiday.name },
      select: { id: true },
    })
    for (const log of mine) {
      await prisma.attendanceLog.update({
        where: { id: log.id },
        data: { status: 'PRESENT', workType: 'ONSITE', notes: null },
      })
      changed++
    }
  }

  const updated = await prisma.holiday.update({
    where: { id },
    data: {
      applied: body.applied,
      appliedAt: body.applied ? new Date() : null,
      appliedById: body.applied ? gate.userId : null,
    },
    select: { id: true, applied: true, appliedAt: true },
  })

  return NextResponse.json({
    holiday: updated,
    attendanceRowsChanged: changed,
    employeesAffected: employees.length,
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const gate = await requireHr(request)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const holiday = await prisma.holiday.findUnique({
    where: { id }, select: { name: true, date: true, applied: true },
  })
  if (!holiday) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Deleting an applied holiday would strand its attendance marks with nothing
  // explaining them, so clear those first.
  if (holiday.applied) {
    await prisma.attendanceLog.updateMany({
      where: { date: holiday.date, notes: holiday.name },
      data: { status: 'PRESENT', workType: 'ONSITE', notes: null },
    })
  }
  await prisma.holiday.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
