import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'

// PATCH /api/org-chart/reparent
// Body: { employeeId, newManagerId | null }
// HR_ADMIN only. Updates Employee.reportingManagerId, writes ManagerHistory
// row, and notifies the employee + old manager + new manager.
export async function PATCH(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { employeeId?: string; newManagerId?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { employeeId } = body
  const newManagerId = body.newManagerId ?? null
  if (!employeeId) {
    return NextResponse.json({ error: 'employeeId required' }, { status: 400 })
  }

  if (newManagerId && newManagerId === employeeId) {
    return NextResponse.json(
      { error: 'An employee cannot report to themselves' },
      { status: 400 },
    )
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, fullName: true, reportingManagerId: true, userId: true },
  })
  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  }

  let newManager: { id: string; fullName: string; userId: string | null } | null = null
  if (newManagerId) {
    newManager = await prisma.employee.findUnique({
      where: { id: newManagerId },
      select: { id: true, fullName: true, userId: true },
    })
    if (!newManager) {
      return NextResponse.json({ error: 'New manager not found' }, { status: 404 })
    }

    // Cycle detection â€” walk up new manager's chain; if we hit employeeId,
    // this would close a loop.
    let cursorId: string | null = newManager.id
    const visited = new Set<string>()
    while (cursorId) {
      if (cursorId === employeeId) {
        return NextResponse.json(
          { error: 'This would create a reporting cycle' },
          { status: 400 },
        )
      }
      if (visited.has(cursorId)) break
      visited.add(cursorId)
      const parent: { reportingManagerId: string | null } | null =
        await prisma.employee.findUnique({
          where: { id: cursorId },
          select: { reportingManagerId: true },
        })
      cursorId = parent?.reportingManagerId ?? null
    }
  }

  const oldManagerId = employee.reportingManagerId
  if (oldManagerId === newManagerId) {
    return NextResponse.json({ ok: true, unchanged: true })
  }

  const oldManager = oldManagerId
    ? await prisma.employee.findUnique({
        where: { id: oldManagerId },
        select: { id: true, fullName: true, userId: true },
      })
    : null

  await prisma.$transaction([
    prisma.employee.update({
      where: { id: employeeId },
      data: { reportingManagerId: newManagerId },
    }),
    prisma.managerHistory.create({
      data: {
        employeeId,
        oldManagerId,
        newManagerId,
        changedById: payload.userId,
        reason: 'Org chart reparent',
      },
    }),
  ])

  // Notifications â€” fire-and-forget; notify() swallows errors.
  const newMgrLabel = newManager ? newManager.fullName : 'no manager'
  await Promise.all([
    notify({
      employeeId,
      type: 'GENERAL',
      title: 'Reporting manager updated',
      message: `Your reporting manager is now ${newMgrLabel}.`,
      link: '/dashboard/org-chart',
    }),
    oldManager
      ? notify({
          employeeId: oldManager.id,
          type: 'GENERAL',
          title: 'Team change',
          message: `${employee.fullName} no longer reports to you.`,
          link: '/dashboard/org-chart',
        })
      : Promise.resolve(),
    newManager
      ? notify({
          employeeId: newManager.id,
          type: 'GENERAL',
          title: 'New direct report',
          message: `${employee.fullName} now reports to you.`,
          link: '/dashboard/org-chart',
        })
      : Promise.resolve(),
  ])

  return NextResponse.json({ ok: true })
}
