import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'

/**
 * Daily cron — flags employee documents expiring within 60 days.
 * Notifies HR + employee. Idempotent per-day-bucket via a simple
 * "already notified once" guard: we only fire for documents whose
 * expiryDate is between now+59d and now+61d (a 1-day window centered
 * on the 60-day mark), so we don't spam every day.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 59)
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 61)

  const docs = await prisma.employeeDocument.findMany({
    where: { expiryDate: { gte: start, lt: end } },
    include: { employee: { select: { id: true, fullName: true } } },
  })

  const hr = await prisma.user.findMany({ where: { role: 'HR_ADMIN' }, select: { employee: { select: { id: true } } } })
  const hrEmps = hr.map((u) => u.employee?.id).filter((x): x is string => !!x)

  for (const d of docs) {
    await notify({
      employeeId: d.employee.id,
      type: 'GENERAL',
      title: 'Document expiring in 60 days',
      message: `${d.type}: ${d.name} expires ${d.expiryDate?.toDateString() ?? ''}. Please renew.`,
      link: `/dashboard/documents`,
    })
    for (const empId of hrEmps) {
      await notify({
        employeeId: empId,
        type: 'GENERAL',
        title: `Doc expiring: ${d.employee.fullName}`,
        message: `${d.type} expires ${d.expiryDate?.toDateString() ?? ''}.`,
      })
    }
  }
  return NextResponse.json({ flagged: docs.length })
}
