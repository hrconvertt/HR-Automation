import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function resolveMe(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
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
  const me = await resolveMe(request)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let where: Record<string, unknown> = {}
  if (me.effectiveRole === 'EMPLOYEE' && me.employeeId) {
    where = { employeeId: me.employeeId }
  } else if (me.effectiveRole === 'MANAGER' && me.employeeId) {
    where = {
      OR: [
        { employeeId: me.employeeId },
        { employee: { reportingManagerId: me.employeeId } },
      ],
    }
  }

  const tickets = await prisma.helpDeskTicket.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      employee: { select: { fullName: true, employeeCode: true } },
      _count: { select: { replies: true } },
    },
  })

  return NextResponse.json({ tickets })
}

export async function POST(request: NextRequest) {
  const me = await resolveMe(request)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Block HR in preview mode from creating
  if (me.actualRole === 'HR_ADMIN' && me.effectiveRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to create tickets' }, { status: 403 })
  }

  const empId = me.employeeId
  if (!empId) return NextResponse.json({ error: 'No employee linked' }, { status: 400 })

  const body = await request.json()
  const { subject, category, priority, description } = body

  if (!subject || !description) {
    return NextResponse.json({ error: 'subject and description are required' }, { status: 400 })
  }

  const ticket = await prisma.helpDeskTicket.create({
    data: {
      employeeId: empId,
      subject,
      category: category ?? 'OTHER',
      priority: priority ?? 'MEDIUM',
      description,
      status: 'OPEN',
    },
  })

  return NextResponse.json({ ticket }, { status: 201 })
}
