import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { notify } from '@/lib/notifications'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const journey = await prisma.employeeJourney.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, fullName: true, employeeCode: true, designation: true, email: true, department: { select: { name: true } }, reportingManagerId: true, joiningDate: true } },
      tasks: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }] },
    },
  })
  if (!journey) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ journey })
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const allowed: Record<string, unknown> = {}
  for (const k of ['status', 'reason', 'noticePeriodDays', 'buddyId', 'successorId', 'notes']) {
    if (body[k] !== undefined) allowed[k] = body[k]
  }
  if (body.targetEndDate !== undefined) {
    allowed.targetEndDate = body.targetEndDate ? new Date(body.targetEndDate) : null
  }
  if (body.actualEndDate !== undefined) {
    allowed.actualEndDate = body.actualEndDate ? new Date(body.actualEndDate) : null
  }

  // If status changes to COMPLETED for offboarding, also set Employee.status
  if (allowed.status === 'COMPLETED') {
    const j = await prisma.employeeJourney.findUnique({ where: { id }, select: { employeeId: true, type: true } })
    if (j?.type === 'OFFBOARDING' && j.employeeId) {
      await prisma.employee.update({
        where: { id: j.employeeId },
        data: { status: 'TERMINATED', exitDate: new Date() },
      })
    }
    allowed.actualEndDate = new Date()

    // Notify employee
    if (j?.employeeId) {
      await notify({
        employeeId: j.employeeId,
        type: 'GENERAL',
        title: j.type === 'ONBOARDING' ? '🎓 Onboarding Complete!' : '✅ Offboarding Complete',
        message: j.type === 'ONBOARDING'
          ? 'Congratulations on completing your onboarding journey!'
          : 'All offboarding tasks have been wrapped up. Best of luck on your next chapter.',
      })
    }
  }

  const journey = await prisma.employeeJourney.update({
    where: { id },
    data: allowed,
    include: { tasks: true },
  })
  return NextResponse.json({ journey })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await prisma.employeeJourney.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
