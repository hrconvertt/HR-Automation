/**
 * PATCH /api/org-chart/level — set an employee's career ladder level.
 *
 * The Org Chart is the source of truth for both hierarchy and level, so the
 * level is assigned here rather than buried in an edit form. It writes straight
 * to Employee.careerLevel, which the profile's Position Level then reads.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { LEVELS } from '@/lib/promotion'

export async function PATCH(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = request.cookies.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN') return NextResponse.json({ error: 'HR only' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const employeeId = String(body.employeeId ?? '')
  const level = body.level == null ? null : String(body.level)
  if (!employeeId) return NextResponse.json({ error: 'employeeId required' }, { status: 400 })
  if (level !== null && !(LEVELS as readonly string[]).includes(level)) {
    return NextResponse.json({ error: 'Level must be L1–L5 or empty' }, { status: 400 })
  }

  await prisma.employee.update({
    where: { id: employeeId },
    data: { careerLevel: level },
  })

  return NextResponse.json({ ok: true, careerLevel: level })
}
