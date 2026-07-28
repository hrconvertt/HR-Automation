import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'

/**
 * Daily 6pm PKT (1pm UTC) cron — finalize employees whose last working day
 * has arrived. Disables their login, marks status RESIGNED/TERMINATED, and
 * notifies HR.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

  // Find clearances where lastWorkingDay has passed and employee still active.
  const due = await prisma.exitClearance.findMany({
    where: {
      lastWorkingDay: { lte: todayEnd, not: null },
      employee: { status: { notIn: ['RESIGNED', 'TERMINATED', 'ABSCONDED'] } },
    },
    include: { employee: { select: { id: true, fullName: true, userId: true, terminationType: true } } },
  })

  const finalized: string[] = []
  for (const c of due) {
    const newStatus = c.employee.terminationType === 'INVOLUNTARY' ? 'TERMINATED' : 'RESIGNED'
    await prisma.employee.update({
      where: { id: c.employeeId },
      data: { status: newStatus, exitDate: c.lastWorkingDay ?? now, terminationType: c.employee.terminationType ?? 'VOLUNTARY' },
    })
    if (c.employee.userId) {
      await prisma.user.update({ where: { id: c.employee.userId }, data: { isActive: false } }).catch(() => {})
    }
    finalized.push(c.employee.fullName)
  }

  // Notify HR
  if (finalized.length) {
    const hr = await prisma.user.findMany({ where: { role: 'HR_ADMIN' }, select: { employee: { select: { id: true } } } })
    for (const u of hr) {
      if (u.employee?.id) {
        await notify({
          employeeId: u.employee.id,
          type: 'GENERAL',
          title: 'Employee(s) finalized today',
          message: `${finalized.length} employee(s) finalized: ${finalized.join(', ')}.`,
        })
      }
    }
  }

  return NextResponse.json({ ok: true, finalized: finalized.length })
}
