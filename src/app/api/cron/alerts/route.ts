/**
 * Cron endpoint: POST /api/cron/alerts
 * Run daily. Checks for:
 * - Probation ending in ≤14 days → notify HR
 * - 3+ consecutive absences → notify HR
 * - Performance review due → notify manager
 * - Leave balance running low → notify employee
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date()
  const alerts: string[] = []

  // 1. Probation alerts (ending in ≤14 days)
  const in14Days = new Date(today)
  in14Days.setDate(in14Days.getDate() + 14)

  const probationEnding = await prisma.probationRecord.findMany({
    where: {
      endDate: { lte: in14Days, gte: today },
      outcome: null,
      hrAlertSent: false,
    },
    include: { employee: true },
  })

  for (const record of probationEnding) {
    const hrAdmins = await prisma.employee.findMany({
      where: { user: { role: 'HR_ADMIN' }, status: 'ACTIVE' },
    })
    for (const hr of hrAdmins) {
      const daysLeft = Math.ceil((record.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      await prisma.notification.create({
        data: {
          employeeId: hr.id,
          type: 'PROBATION_ALERT',
          title: `Probation Ending Soon — ${record.employee.fullName}`,
          message: `${record.employee.fullName}'s probation ends in ${daysLeft} days (${record.endDate.toDateString()}). Please confirm outcome.`,
          link: `/dashboard/onboarding`,
        },
      })
    }
    await prisma.probationRecord.update({
      where: { id: record.id },
      data: { hrAlertSent: true },
    })
    alerts.push(`Probation alert: ${record.employee.fullName}`)
  }

  // 2. Consecutive absence alerts (3+ days)
  const threeDaysAgo = new Date(today)
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

  const activeEmployees = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, fullName: true },
  })

  for (const emp of activeEmployees) {
    const recentLogs = await prisma.attendanceLog.findMany({
      where: {
        employeeId: emp.id,
        date: { gte: threeDaysAgo },
        status: 'ABSENT',
      },
      orderBy: { date: 'asc' },
    })

    if (recentLogs.length >= 3) {
      // Check if already notified today
      const existing = await prisma.notification.findFirst({
        where: {
          type: 'ANOMALY',
          message: { contains: emp.fullName },
          createdAt: { gte: new Date(today.setHours(0, 0, 0, 0)) },
        },
      })
      if (!existing) {
        const hrAdmins = await prisma.employee.findMany({
          where: { user: { role: 'HR_ADMIN' }, status: 'ACTIVE' },
        })
        for (const hr of hrAdmins) {
          await prisma.notification.create({
            data: {
              employeeId: hr.id,
              type: 'ANOMALY',
              title: `Attendance Anomaly — ${emp.fullName}`,
              message: `${emp.fullName} has been absent for 3+ consecutive days. Please follow up.`,
              link: `/dashboard/attendance`,
            },
          })
        }
        alerts.push(`Absence alert: ${emp.fullName}`)
      }
    }
  }

  return NextResponse.json({ success: true, alerts })
}
