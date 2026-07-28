/**
 * GET /api/daily-log/inquiries
 *
 * Returns the caller's own pending inquiries (tasks + KPIs).
 * Used by the dashboard banner and the inquiries response page.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET() {
  const payload = await verifyToken()
  if (!payload || !payload.employeeId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const employeeId = payload.employeeId
  const [tasks, kpis] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { employeeId, inquiryStatus: 'PENDING' },
      orderBy: { managerInquiryAt: 'desc' },
    }),
    prisma.dailyKpi.findMany({
      where: { employeeId, inquiryStatus: 'PENDING' },
      include: { metric: { select: { id: true, name: true, unit: true } } },
      orderBy: { managerInquiryAt: 'desc' },
    }),
  ])
  return NextResponse.json({
    count: tasks.length + kpis.length,
    tasks,
    kpis,
  })
}
