import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Daily mark-absent cron — runs after EOD (e.g. 23:00 local).
 *
 * For every active employee:
 *   • Skip if today is a weekend
 *   • Skip if today is a public/optional holiday
 *   • Skip if they have an APPROVED leave covering today
 *   • Skip if they have an AttendanceLog row for today already (clocked in,
 *     WFH, half-day, leave, etc.)
 *   • Otherwise → create AttendanceLog { status: 'ABSENT' }
 *
 * OPT-IN: gated behind MARK_ABSENT_ENABLED=true. Convertt's current policy
 * (per project memory) is "no Absent days" — every cell is P/WFH/L/H/WE/HOLIDAY.
 * The cron stays dormant until HR explicitly flips the env flag, e.g. when
 * they migrate fully to live clock-in as the source of truth.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET) {
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (process.env.MARK_ABSENT_ENABLED !== 'true') {
    return NextResponse.json({
      skipped: true,
      reason: 'MARK_ABSENT_ENABLED is not set to "true" — cron is dormant by design.',
    })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  const dow = today.getDay()
  if (dow === 0 || dow === 6) {
    return NextResponse.json({ skipped: true, reason: 'Weekend' })
  }

  const holiday = await prisma.holiday.findFirst({
    where: { date: { gte: today, lt: tomorrow } },
    select: { id: true },
  })
  if (holiday) {
    return NextResponse.json({ skipped: true, reason: 'Holiday' })
  }

  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  })

  const [logsToday, leavesToday] = await Promise.all([
    prisma.attendanceLog.findMany({
      where: { date: { gte: today, lt: tomorrow } },
      select: { employeeId: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        fromDate: { lte: today },
        toDate: { gte: today },
      },
      select: { employeeId: true },
    }),
  ])

  const loggedToday = new Set(logsToday.map((l) => l.employeeId))
  const onLeaveToday = new Set(leavesToday.map((l) => l.employeeId))

  let created = 0
  for (const emp of employees) {
    if (loggedToday.has(emp.id) || onLeaveToday.has(emp.id)) continue
    await prisma.attendanceLog.create({
      data: {
        employeeId: emp.id,
        date: today,
        workType: 'ONSITE',
        status: 'ABSENT',
        hoursWorked: 0,
        notes: 'Auto-marked absent (no clock-in, no approved leave)',
      },
    })
    created += 1
  }

  return NextResponse.json({ created, totalActive: employees.length })
}
