import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return { error: 'Unauthorized' as const, status: 401 }
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) return { error: 'Unauthorized' as const, status: 401 }
  const previewRole =
    user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  return {
    actualRole: user.role,
    effectiveRole: previewRole ?? user.role,
    employeeId: user.employee?.id ?? null,
  }
}

// GET /api/goals  â†’  scoped by role
// query: ?employeeId=xxx  (HR/Manager can pass)
export async function GET(request: NextRequest) {
  const access = await resolveAccess(request)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const { searchParams } = new URL(request.url)
  const queryEmpId = searchParams.get('employeeId') ?? ''
  const cycleId = searchParams.get('cycleId') ?? ''

  // Build WHERE clause based on role
  let where: object = {}
  if (access.effectiveRole === 'EMPLOYEE') {
    where = { employeeId: access.employeeId }
  } else if (access.effectiveRole === 'MANAGER' && access.employeeId) {
    // Manager sees: own goals + team goals (where employee.reportingManagerId = me)
    where = {
      OR: [
        { employeeId: access.employeeId },
        { employee: { reportingManagerId: access.employeeId } },
      ],
    }
  } else if (access.effectiveRole === 'HR_ADMIN' || access.effectiveRole === 'EXECUTIVE') {
    // HR/Executive see all (optionally filtered by employeeId)
    where = queryEmpId ? { employeeId: queryEmpId } : {}
  }

  const goals = await prisma.goal.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true, employeeCode: true, fullName: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ goals })
}

// POST /api/goals  â†’  create new goal
// body: { employeeId?, description, kpi?, target?, weight? }
//   - employee creates own: omit employeeId
//   - HR/Manager: pass employeeId (and verify scope for manager)
export async function POST(request: NextRequest) {
  const access = await resolveAccess(request)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = await request.json()
  const { description, kpi, target, weight } = body
  let targetEmployeeId: string | null = body.employeeId ?? null

  if (!description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  // Determine target employee
  if (!targetEmployeeId) {
    targetEmployeeId = access.employeeId
  }
  if (!targetEmployeeId) {
    return NextResponse.json({ error: 'No employee context' }, { status: 400 })
  }

  // Permission check: employee can only create own; manager only for their team; HR for anyone
  if (access.effectiveRole === 'EMPLOYEE' && targetEmployeeId !== access.employeeId) {
    return NextResponse.json({ error: 'Cannot create goals for other employees' }, { status: 403 })
  }
  if (access.effectiveRole === 'MANAGER' && targetEmployeeId !== access.employeeId) {
    const target = await prisma.employee.findUnique({
      where: { id: targetEmployeeId },
      select: { reportingManagerId: true },
    })
    if (!target || target.reportingManagerId !== access.employeeId) {
      return NextResponse.json({ error: 'Can only create goals for your direct reports' }, { status: 403 })
    }
  }

  // Generate a friendly goalId like G-2026-001
  const year = new Date().getFullYear()
  const count = await prisma.goal.count({ where: { goalId: { startsWith: `G-${year}-` } } })
  const goalId = `G-${year}-${String(count + 1).padStart(3, '0')}`

  const goal = await prisma.goal.create({
    data: {
      employeeId: targetEmployeeId,
      goalId,
      description,
      kpi: kpi ?? null,
      target: target ?? null,
      weight: weight ?? 0,
      status: 'NOT_STARTED',
    },
  })

  return NextResponse.json({ goal }, { status: 201 })
}
