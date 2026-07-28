/**
 * POST /api/daily-kpi/[id]/inquiry — Ask Why on a daily KPI row.
 *
 * Mirrors /api/daily-log/[id]/inquiry — same auth, same loop.
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
  const row = await prisma.dailyKpi.findUnique({ where: { id } })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let allowed = payload.role === 'HR_ADMIN'
  if (!allowed && (payload.role === 'MANAGER' || payload.role === 'LEAD') && payload.employeeId) {
    const team = await getTeamEmployeeIds(payload.employeeId)
    allowed = team.includes(row.employeeId)
  }
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const question = String(body.question ?? '').trim()
  if (!question) return NextResponse.json({ error: 'Question required' }, { status: 400 })

  const updated = await prisma.dailyKpi.update({
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
    title: 'KPI question from your lead',
    message: question.slice(0, 140),
    link: '/dashboard/daily-log/inquiries',
  })

  return NextResponse.json({ kpi: updated })
}
