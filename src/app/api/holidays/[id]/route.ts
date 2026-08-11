/**
 * PATCH  /api/holidays/[id]   — apply or un-apply a holiday
 * DELETE /api/holidays/[id]   — remove it entirely
 *
 * A holiday sitting on the calendar is not the same as it being taken. HR
 * decides each one against workload, so nothing touches attendance until it is
 * applied. The write itself lives in @/lib/holiday-apply, shared with the
 * notice route — sending the announcement applies the holiday too.
 *
 *   Body: { applied: boolean }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { applyHoliday } from '@/lib/holiday-apply'

async function requireHr(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { ok: false as const, status: 401, error: 'Unauthorized' }
  const me = await prisma.user.findUnique({
    where: { id: payload.userId }, select: { role: true },
  })
  if (!me || me.role !== 'HR_ADMIN') {
    return { ok: false as const, status: 403, error: 'Forbidden — HR only' }
  }
  // Only block when previewing as somebody else. This used to reject any
  // preview cookie at all, including "view as HR", so Apply answered 403 to
  // the very person allowed to press it and looked like a dead button.
  const preview = request.cookies.get('hr_preview_role')?.value
  if (preview && preview !== 'HR_ADMIN') {
    return { ok: false as const, status: 403, error: 'Switch back to HR view to change holidays.' }
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

  const exists = await prisma.holiday.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const outcome = await applyHoliday(id, body.applied, gate.userId)

  return NextResponse.json({
    holiday: { id, applied: body.applied },
    attendanceRowsChanged: outcome.changed,
    employeesAffected: outcome.employeesAffected,
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
