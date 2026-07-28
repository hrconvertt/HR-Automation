import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasAnyRole } from '@/lib/auth'

// Lifecycle dashboard metrics â€” funnel counts, time-to-onboarded avg,
// attrition by phase (last 12 months).
export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasAnyRole(payload, ['HR_ADMIN', 'EXECUTIVE'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())

  const [active, onboardingActive, probationActive, exitInFlight, completed, hires12mo, exits12mo, probationFails] = await Promise.all([
    prisma.employee.count({ where: { status: 'ACTIVE' } }),
    prisma.onboardingChecklist.count({ where: { status: { not: 'COMPLETED' }, employee: { status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'] } } } }),
    prisma.probationRecord.count({ where: { status: 'ACTIVE', employee: { status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'] } } } }),
    prisma.exitClearance.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.onboardingChecklist.findMany({
      where: { status: 'COMPLETED', completedAt: { gte: oneYearAgo, not: null }, employee: { status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'] } } },
      include: { employee: { select: { joiningDate: true } } },
    }),
    prisma.employee.count({ where: { joiningDate: { gte: oneYearAgo } } }),
    prisma.employee.count({ where: { exitDate: { gte: oneYearAgo, not: null } } }),
    prisma.probationRecord.count({
      where: { outcome: 'TERMINATED', updatedAt: { gte: oneYearAgo } },
    }),
  ])

  // Time to fully onboarded
  let avgDaysToOnboarded = 0
  if (completed.length > 0) {
    const total = completed.reduce((acc, c) => {
      const start = new Date(c.employee.joiningDate).getTime()
      const end = c.completedAt ? new Date(c.completedAt).getTime() : Date.now()
      return acc + (end - start) / 86400000
    }, 0)
    avgDaysToOnboarded = Math.round(total / completed.length)
  }

  const probationAttrition = hires12mo > 0 ? Math.round((probationFails / hires12mo) * 100) : 0
  const overallAttrition = active > 0 ? Math.round((exits12mo / active) * 100) : 0

  return NextResponse.json({
    funnel: {
      onboarding: onboardingActive,
      probation: probationActive,
      active: active - onboardingActive - probationActive,
      exit: exitInFlight,
    },
    avgDaysToOnboarded,
    attrition: {
      duringProbationPct: probationAttrition,
      overall12moPct: overallAttrition,
      probationFails,
      totalHires: hires12mo,
      totalExits: exits12mo,
    },
  })
}
