/**
 * POST /api/daily-log/[id]/inquiry — fire an Ask Why on a task row.
 *
 * Body: { question: string }
 * Auth: HR_ADMIN, or MANAGER/LEAD that has the row's employee in their team.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { getTeamEmployeeIds } from '@/lib/team-scope'
import { notify } from '@/lib/notifications'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params

  const row = await prisma.dailyLog.findUnique({ where: { id } })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Auth
  let allowed = payload.role === 'HR_ADMIN'
  if (!allowed && (payload.role === 'MANAGER' || payload.role === 'LEAD') && payload.employeeId) {
    const team = await getTeamEmployeeIds(payload.employeeId)
    allowed = team.includes(row.employeeId)
  }
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const question = String(body.question ?? '').trim()
  if (!question) return NextResponse.json({ error: 'Question required' }, { status: 400 })

  const updated = await prisma.dailyLog.update({
    where: { id },
    data: {
      inquiryStatus: 'PENDING',
      managerInquiry: question,
      managerInquiryAt: new Date(),
      managerInquiryById: payload.userId,
    },
  })

  await notify({
    employeeId: row.employeeId,
    type: 'GENERAL',
    title: 'Your lead has a question on yesterday\'s log',
    message: question.slice(0, 140),
    link: '/dashboard/daily-log/inquiries',
  })

  return NextResponse.json({ log: updated })
}
