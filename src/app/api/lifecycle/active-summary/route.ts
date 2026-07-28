import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { getTeamEmployeeIds } from '@/lib/team-scope'

// Aggregate "Milestones & Moves" feed for the Active phase tab.
// Birthdays + anniversaries this month, probation ends within 30 days,
// last-90-day promotions/manager-changes, and tenure buckets.
//
// Scoping:
//   HR_ADMIN / EXECUTIVE â†’ all employees
//   MANAGER / LEAD       â†’ recursive team (all descendants in reporting tree)
//   EMPLOYEE             â†’ self only
export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const previewRole = user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  const meId = user.employee?.id ?? null

  // Resolve the set of employee IDs this caller can see. `null` means "no filter" (HR/Exec).
  let scopeIds: string[] | null = null
  if (effectiveRole === 'HR_ADMIN' || effectiveRole === 'EXECUTIVE') {
    scopeIds = null
  } else if ((effectiveRole === 'MANAGER' || effectiveRole === 'LEAD') && meId) {
    scopeIds = await getTeamEmployeeIds(meId, { includeSelf: false })
    if (scopeIds.length === 0) {
      // No reports â€” still allow self in the feed? No: a manager with no reports has an empty team feed.
      return NextResponse.json({
        birthdays: [], anniversaries: [], probationEnding: [],
        promotions: [], managerChanges: [], deptTransfers: [],
        tenure: { lt6: 0, m6to2y: 0, y2to5: 0, y5plus: 0 },
      })
    }
  } else if (effectiveRole === 'EMPLOYEE' && meId) {
    scopeIds = [meId]
  } else {
    // Unknown role or missing employee linkage â€” empty payload.
    return NextResponse.json({
      birthdays: [], anniversaries: [], probationEnding: [],
      promotions: [], managerChanges: [], deptTransfers: [],
      tenure: { lt6: 0, m6to2y: 0, y2to5: 0, y5plus: 0 },
    })
  }

  const now = new Date()
  const thisMonth = now.getMonth()
  const in30 = new Date(now); in30.setDate(in30.getDate() + 30)
  const last90 = new Date(now); last90.setDate(last90.getDate() - 90)

  const empFilter = scopeIds ? { id: { in: scopeIds } } : {}
  const empIdFilter = scopeIds ? { employeeId: { in: scopeIds } } : {}

  const [active, probations, promotions, managerChanges] = await Promise.all([
    prisma.employee.findMany({
      where: { status: 'ACTIVE', ...empFilter },
      select: {
        id: true, fullName: true, dob: true, joiningDate: true, hideBirthday: true, hideAnniversary: true,
        departmentId: true,
        position: { select: { level: true } },
        reportingManager: { select: { fullName: true } },
      },
    }),
    prisma.probationRecord.findMany({
      where: { status: 'ACTIVE', endDate: { gte: now, lte: in30 }, ...empIdFilter },
      include: {
        employee: {
          select: {
            id: true, fullName: true,
            position: { select: { level: true } },
          },
        },
      },
      orderBy: { endDate: 'asc' },
    }),
    prisma.promotionRequest.findMany({
      where: { status: 'APPROVED', effectiveDate: { gte: last90 }, ...empIdFilter },
      include: {
        employee: {
          select: {
            id: true, fullName: true, departmentId: true,
            position: { select: { level: true } },
          },
        },
      },
      orderBy: { effectiveDate: 'desc' },
    }),
    prisma.managerHistory.findMany({
      where: { changedAt: { gte: last90 }, ...empIdFilter },
      include: {
        employee: {
          select: {
            id: true, fullName: true,
            position: { select: { level: true } },
          },
        },
      },
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
      level: e.position?.level ?? null,
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
        level: e.position?.level ?? null,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  const probationEnding = probations.map((p) => ({
    id: p.employee.id,
    fullName: p.employee.fullName,
    daysLeft: Math.ceil((p.endDate.getTime() - now.getTime()) / 86_400_000),
    endDate: p.endDate.toISOString(),
    level: p.employee.position?.level ?? null,
  }))

  const promotionsList = promotions.map((p) => ({
    employeeId: p.employee.id,
    employee: p.employee.fullName,
    newDesignation: p.newDesignation,
    effectiveDate: p.effectiveDate.toISOString(),
    level: p.employee.position?.level ?? null,
  }))

  const managerChangesList = managerChanges.map((m) => ({
    employeeId: m.employee.id,
    employee: m.employee.fullName,
    oldManager: managerName(m.oldManagerId),
    newManager: managerName(m.newManagerId),
    changedAt: m.changedAt.toISOString(),
    level: m.employee.position?.level ?? null,
  }))

  // Department transfers â€” pulled from promotionRequest with newDepartmentId differing from old.
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
      level: p.employee.position?.level ?? null,
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
