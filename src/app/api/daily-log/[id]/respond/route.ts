/**
 * POST /api/daily-log/[id]/respond — employee responds to an inquiry.
 *
 * Body: { response: string }
 * Auth: the row's own employee.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const payload = await verifyToken()
  if (!payload || !payload.employeeId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params
  const row = await prisma.dailyLog.findUnique({ where: { id } })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (row.employeeId !== payload.employeeId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (row.inquiryStatus !== 'PENDING') {
    return NextResponse.json({ error: 'No pending inquiry' }, { status: 400 })
  }
  const body = await request.json()
  const response = String(body.response ?? '').trim()
  if (!response) return NextResponse.json({ error: 'Response required' }, { status: 400 })

  const updated = await prisma.dailyLog.update({
    where: { id },
    data: {
      inquiryStatus: 'RESOLVED',
      employeeResponse: response,
      employeeResponseAt: new Date(),
    },
  })

  // Notify the lead who asked.
  if (row.managerInquiryById) {
    const leadUser = await prisma.user.findUnique({
      where: { id: row.managerInquiryById },
      select: { employee: { select: { id: true } } },
    })
    if (leadUser?.employee?.id) {
      await notify({
        employeeId: leadUser.employee.id,
        type: 'GENERAL',
        title: 'Inquiry response received',
        message: response.slice(0, 140),
        link: '/dashboard/daily-review',
      })
    }
  }

  return NextResponse.json({ log: updated })
}
