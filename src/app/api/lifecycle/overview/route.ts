import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [
    onboardingCount,
    probationCount,
    activeCount,
    exitCount,
    joiningThisMonth,
    exitingThisMonth,
    recentHires,
    recentExits,
    recentProbations,
  ] = await Promise.all([
    prisma.onboardingChecklist.count({ where: { status: { not: 'COMPLETED' } } }).catch(() => 0),
    prisma.employee.count({ where: { status: 'PROBATION' } }),
    prisma.employee.count({ where: { status: 'ACTIVE' } }),
    prisma.exitClearance.count({ where: { status: { not: 'COMPLETED' } } }).catch(() => 0),
    prisma.employee.findMany({
      where: { joiningDate: { gte: monthStart, lt: nextMonthStart } },
      select: { id: true, fullName: true, designation: true, joiningDate: true },
      orderBy: { joiningDate: 'asc' },
      take: 20,
    }),
    prisma.exitClearance.findMany({
      where: { status: { not: 'COMPLETED' }, OR: [{ lastWorkingDay: { gte: monthStart, lt: nextMonthStart } }, { lastWorkingDay: null }] },
      select: {
        id: true, lastWorkingDay: true,
        employee: { select: { id: true, fullName: true, designation: true } },
      },
      orderBy: { lastWorkingDay: 'asc' },
      take: 20,
    }).catch(() => []),
    prisma.employee.findMany({
      where: { joiningDate: { gte: new Date(now.getTime() - 90 * 24 * 3600 * 1000) } },
      select: { id: true, fullName: true, joiningDate: true },
      orderBy: { joiningDate: 'desc' },
      take: 5,
    }),
    prisma.exitClearance.findMany({
      orderBy: { initiatedAt: 'desc' },
      take: 5,
      select: {
        id: true, initiatedAt: true, status: true, completedAt: true,
        employee: { select: { fullName: true } },
      },
    }).catch(() => []),
    prisma.probationRecord.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true, createdAt: true, outcome: true,
        employee: { select: { fullName: true } },
      },
    }).catch(() => []),
  ])

  // Build a unified recent-activity feed (latest 10)
  type Event = { id: string; type: string; title: string; employeeName: string | null; at: string }
  const events: Event[] = []
  for (const h of recentHires) {
    events.push({
      id: `hire-${h.id}`, type: 'New Hire',
      title: 'Joined the team', employeeName: h.fullName,
      at: h.joiningDate.toISOString(),
    })
  }
  for (const x of recentExits) {
    events.push({
      id: `exit-${x.id}`, type: 'Exit',
      title: x.status === 'COMPLETED' ? 'Exit clearance completed' : 'Exit clearance initiated',
      employeeName: x.employee?.fullName ?? null,
      at: (x.completedAt ?? x.initiatedAt).toISOString(),
    })
  }
  for (const p of recentProbations) {
    events.push({
      id: `prob-${p.id}`, type: 'Probation',
      title: p.outcome ? `Probation outcome: ${p.outcome}` : 'Probation review',
      employeeName: p.employee?.fullName ?? null,
      at: p.createdAt.toISOString(),
    })
  }
  events.sort((a, b) => b.at.localeCompare(a.at))

  // Count exits completed this month
  const exitedThisMonth = await prisma.exitClearance.count({
    where: { completedAt: { gte: monthStart, lt: nextMonthStart } },
  }).catch(() => 0)

  return NextResponse.json({
    counts: {
      onboarding: onboardingCount,
      probation: probationCount,
      active: activeCount,
      exitClearance: exitCount,
      joinedThisMonth: joiningThisMonth.length,
      exitedThisMonth,
    },
    joiningThisMonth: joiningThisMonth.map((e) => ({
      ...e,
      joiningDate: e.joiningDate.toISOString(),
    })),
    exitingThisMonth: exitingThisMonth.map((c) => ({
      id: c.employee?.id ?? c.id,
      fullName: c.employee?.fullName ?? '—',
      designation: c.employee?.designation ?? '',
      lastWorkingDay: c.lastWorkingDay ? c.lastWorkingDay.toISOString() : null,
    })),
    recentActivity: events.slice(0, 10),
  })
}
