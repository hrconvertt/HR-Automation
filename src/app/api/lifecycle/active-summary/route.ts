import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// Aggregate "Milestones & Moves" feed for the Active phase tab.
// Birthdays + anniversaries this month, probation ends within 30 days,
// last-90-day promotions/manager-changes, and tenure buckets.
export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const thisMonth = now.getMonth()
  const in30 = new Date(now); in30.setDate(in30.getDate() + 30)
  const last90 = new Date(now); last90.setDate(last90.getDate() - 90)

  const [active, probations, promotions, managerChanges] = await Promise.all([
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true, fullName: true, dob: true, joiningDate: true, hideBirthday: true, hideAnniversary: true,
        departmentId: true,
        reportingManager: { select: { fullName: true } },
      },
    }),
    prisma.probationRecord.findMany({
      where: { status: 'ACTIVE', endDate: { gte: now, lte: in30 } },
      include: { employee: { select: { id: true, fullName: true } } },
      orderBy: { endDate: 'asc' },
    }),
    prisma.promotionRequest.findMany({
      where: { status: 'APPROVED', effectiveDate: { gte: last90 } },
      include: { employee: { select: { id: true, fullName: true, departmentId: true } } },
      orderBy: { effectiveDate: 'desc' },
    }),
    prisma.managerHistory.findMany({
      where: { changedAt: { gte: last90 } },
      include: { employee: { select: { id: true, fullName: true } } },
      orderBy: { changedAt: 'desc' },
    }),
  ])

  // Resolve old/new manager names for managerHistory
  const managerIds = Array.from(new Set(
    managerChanges.flatMap((h) => [h.oldManagerId, h.newManagerId]).filter(Boolean) as string[]
  ))
  const managers = managerIds.length
    ? await prisma.employee.findMany({ where: { id: { in: managerIds } }, select: { id: true, fullName: true } })
    : []
  const managerName = (id: string | null) => id ? (managers.find((m) => m.id === id)?.fullName ?? null) : null

  const birthdays = active
    .filter((e) => !e.hideBirthday && e.dob && new Date(e.dob).getMonth() === thisMonth)
    .map((e) => ({
      id: e.id,
      fullName: e.fullName,
      date: new Date(now.getFullYear(), new Date(e.dob!).getMonth(), new Date(e.dob!).getDate()).toISOString(),
      manager: e.reportingManager?.fullName ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const anniversaries = active
    .filter((e) => !e.hideAnniversary && new Date(e.joiningDate).getMonth() === thisMonth && new Date(e.joiningDate).getFullYear() < now.getFullYear())
    .map((e) => {
      const jd = new Date(e.joiningDate)
      const years = now.getFullYear() - jd.getFullYear()
      const milestone = [1, 3, 5, 7, 10, 15, 20, 25].includes(years)
      return {
        id: e.id,
        fullName: e.fullName,
        date: new Date(now.getFullYear(), jd.getMonth(), jd.getDate()).toISOString(),
        years,
        milestone,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  const probationEnding = probations.map((p) => ({
    id: p.employee.id,
    fullName: p.employee.fullName,
    daysLeft: Math.ceil((p.endDate.getTime() - now.getTime()) / 86_400_000),
    endDate: p.endDate.toISOString(),
  }))

  const promotionsList = promotions.map((p) => ({
    employeeId: p.employee.id,
    employee: p.employee.fullName,
    newDesignation: p.newDesignation,
    effectiveDate: p.effectiveDate.toISOString(),
  }))

  const managerChangesList = managerChanges.map((m) => ({
    employeeId: m.employee.id,
    employee: m.employee.fullName,
    oldManager: managerName(m.oldManagerId),
    newManager: managerName(m.newManagerId),
    changedAt: m.changedAt.toISOString(),
  }))

  // Department transfers — pulled from promotionRequest with newDepartmentId differing from old.
  // The schema doesn't have a dedicated DepartmentHistory; we proxy via promotion requests.
  const deptIds = Array.from(new Set(promotions.map((p) => p.newDepartmentId).filter(Boolean) as string[]))
  const deptMap = deptIds.length
    ? Object.fromEntries((await prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]))
    : {}
  const deptTransfers = promotions
    .filter((p) => p.newDepartmentId && p.newDepartmentId !== p.employee.departmentId)
    .map((p) => ({
      employeeId: p.employee.id,
      employee: p.employee.fullName,
      from: null as string | null,
      to: p.newDepartmentId ? (deptMap[p.newDepartmentId] ?? null) : null,
      at: p.effectiveDate.toISOString(),
    }))

  // Tenure buckets
  const tenure = { lt6: 0, m6to2y: 0, y2to5: 0, y5plus: 0 }
  for (const e of active) {
    const months = (now.getTime() - new Date(e.joiningDate).getTime()) / (30 * 86_400_000)
    if (months < 6) tenure.lt6++
    else if (months < 24) tenure.m6to2y++
    else if (months < 60) tenure.y2to5++
    else tenure.y5plus++
  }

  return NextResponse.json({
    birthdays,
    anniversaries,
    probationEnding,
    promotions: promotionsList,
    managerChanges: managerChangesList,
    deptTransfers,
    tenure,
  })
}
