import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'

/**
 * Daily — flag employees with no attendance log for 7+ consecutive workdays
 * and no approved leave covering that period. Notifies HR; doesn't auto-set
 * ABSCONDED (HR must confirm via UI to avoid false positives).
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const now = new Date()
  const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 9)

  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, fullName: true },
  })

  const flagged: { id: string; name: string }[] = []
  for (const emp of employees) {
    const logs = await prisma.attendanceLog.count({
      where: { employeeId: emp.id, date: { gte: sevenDaysAgo }, status: { notIn: ['WEEKEND', 'HOLIDAY', 'ABSENT'] } },
    })
    if (logs >= 1) continue
    const leaves = await prisma.leaveRequest.count({
      where: { employeeId: emp.id, status: 'APPROVED', fromDate: { lte: now }, toDate: { gte: sevenDaysAgo } },
    })
    if (leaves >= 1) continue
    flagged.push({ id: emp.id, name: emp.fullName })
  }

  if (flagged.length) {
    const hr = await prisma.user.findMany({ where: { role: 'HR_ADMIN' }, select: { employee: { select: { id: true } } } })
    for (const u of hr) {
      if (u.employee?.id) await notify({
        employeeId: u.employee.id,
        type: 'ANOMALY',
        title: 'Possible absconding',
        message: `${flagged.length} employee(s) with no attendance for 7+ workdays: ${flagged.map((f) => f.name).slice(0, 5).join(', ')}.`,
      })
    }
  }
  return NextResponse.json({ flagged: flagged.length, details: flagged })
}
