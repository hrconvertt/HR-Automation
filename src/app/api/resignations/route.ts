import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import { triggerEmail, employeeVars } from '@/lib/email-triggers'

// Self-serve resignation submission. The employee themselves submits;
// the manager must acknowledge before HR opens an ExitClearance.
export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { employee: { select: { id: true, fullName: true, reportingManagerId: true, employeeType: true } } },
  })
  const me = user?.employee
  if (!me) return NextResponse.json({ error: 'No employee record' }, { status: 400 })

  const body = await request.json()
  const intendedLastDay = body.intendedLastDay ? new Date(body.intendedLastDay) : null
  if (!intendedLastDay || isNaN(intendedLastDay.getTime())) {
    return NextResponse.json({ error: 'intendedLastDay required' }, { status: 400 })
  }

  const existing = await prisma.resignation.findUnique({ where: { employeeId: me.id } })
  if (existing && existing.status !== 'RETRACTED') {
    return NextResponse.json({ error: 'Resignation already submitted' }, { status: 409 })
  }

  const resignation = await prisma.resignation.upsert({
    where: { employeeId: me.id },
    create: {
      employeeId: me.id,
      intendedLastDay,
      reason: body.reason ?? null,
      status: 'PENDING_MANAGER_ACK',
    },
    update: {
      intendedLastDay,
      reason: body.reason ?? null,
      status: 'PENDING_MANAGER_ACK',
      submittedAt: new Date(),
      managerAckedAt: null,
      managerAckedById: null,
    },
  })

  if (me.reportingManagerId) {
    await notify({
      employeeId: me.reportingManagerId,
      type: 'GENERAL',
      title: 'Resignation submitted',
      message: `${me.fullName} submitted resignation. Last day: ${intendedLastDay.toDateString()}.`,
      link: `/dashboard/employees/${me.id}`,
    })
  }

  // OFF-01 resignation.received
  await triggerEmail({
    event: 'resignation.received',
    employeeId: me.id,
    variables: {
      ...employeeVars({ fullName: me.fullName, designation: null, department: null }),
      'Last Working Day': intendedLastDay.toLocaleDateString('en-GB', { dateStyle: 'long' }),
    },
    createdById: payload.userId,
    dedupeSalt: resignation.id,
  })

  return NextResponse.json({ resignation }, { status: 201 })
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Returns ALL pending resignations for HR/Manager workspace; for an EMPLOYEE returns only theirs.
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!user) return NextResponse.json({ error: 'No user' }, { status: 400 })

  const where: { employeeId?: string; employee?: { reportingManagerId: string } } = {}
  if (user.role === 'EMPLOYEE') where.employeeId = user.employee?.id ?? '__none__'
  else if (user.role === 'MANAGER') where.employee = { reportingManagerId: user.employee?.id ?? '__none__' }

  const list = await prisma.resignation.findMany({
    where,
    include: { employee: { select: { id: true, fullName: true, employeeCode: true, designation: true } } },
    orderBy: { submittedAt: 'desc' },
  })
  return NextResponse.json({ resignations: list })
}
