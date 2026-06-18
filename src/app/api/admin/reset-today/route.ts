/**
 * HR-only utility â€” clears the logged-in HR Admin's attendance for today only.
 * Useful for resetting test punches. Doesn't affect other employees.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  const empId = user?.employee?.id
  if (!empId) return NextResponse.json({ error: 'No employee linked' }, { status: 400 })

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)

  const [punches, logs] = await Promise.all([
    prisma.attendancePunch.deleteMany({
      where: { employeeId: empId, date: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.attendanceLog.deleteMany({
      where: { employeeId: empId, date: { gte: todayStart, lte: todayEnd } },
    }),
  ])

  return NextResponse.json({ ok: true, deletedPunches: punches.count, deletedLogs: logs.count })
}
