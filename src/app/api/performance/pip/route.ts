import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) return null
  const previewRole =
    user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  return {
    actualRole: user.role,
    effectiveRole: previewRole ?? user.role,
    employeeId: user.employee?.id ?? null,
  }
}

export async function GET(request: NextRequest) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let where: object = {}
  if (access.effectiveRole === 'EMPLOYEE') {
    where = { employeeId: access.employeeId }
  } else if (access.effectiveRole === 'MANAGER' && access.employeeId) {
    where = {
      OR: [
        { employeeId: access.employeeId },
        { employee: { reportingManagerId: access.employeeId } },
      ],
    }
  }

  const pips = await prisma.pIP.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true, employeeCode: true, fullName: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: { startDate: 'desc' },
  })

  return NextResponse.json({ pips })
}

export async function POST(request: NextRequest) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.actualRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Only HR can create PIP' }, { status: 403 })
  }
  if (access.effectiveRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view' }, { status: 403 })
  }

  const body = await request.json()
  const { employeeId, startDate, endDate, objectives, metrics } = body

  if (!employeeId || !startDate || !endDate || !objectives || !metrics) {
    return NextResponse.json({ error: 'employeeId, startDate, endDate, objectives, metrics are required' }, { status: 400 })
  }

  // Find the employee's manager
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { reportingManagerId: true },
  })

  const pip = await prisma.pIP.create({
    data: {
      employeeId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      objectives,
      metrics,
      managerId: emp?.reportingManagerId ?? null,
      hrId: access.employeeId,
      outcome: 'IN_PROGRESS',
    },
  })

  // Notify employee + their manager
  await notify({
    employeeId,
    type: 'PIP_CREATED',
    title: 'âš ï¸ Performance Improvement Plan',
    message: `A PIP has been started for you (${new Date(startDate).toLocaleDateString('en-GB')} â€“ ${new Date(endDate).toLocaleDateString('en-GB')}). Review the objectives in Performance.`,
    link: '/dashboard/performance',
  })
  if (emp?.reportingManagerId) {
    await notify({
      employeeId: emp.reportingManagerId,
      type: 'PIP_CREATED',
      title: 'PIP created for your direct report',
      message: 'A PIP has been initiated. You will need to check-in periodically.',
      link: '/dashboard/performance',
    })
  }

  return NextResponse.json({ pip }, { status: 201 })
}
