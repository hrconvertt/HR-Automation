import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const acks = await prisma.policyAcknowledgment.findMany({
    where: { policyId: id },
    include: {
      // employeeId is a plain field, no relation defined → fetch separately
    },
  })

  const empIds = acks.map((a) => a.employeeId)
  const employees = await prisma.employee.findMany({
    where: { id: { in: empIds } },
    select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } },
  })
  const empMap = new Map(employees.map((e) => [e.id, e]))

  const rows = acks.map((a) => ({
    employeeId: a.employeeId,
    fullName: empMap.get(a.employeeId)?.fullName ?? '—',
    employeeCode: empMap.get(a.employeeId)?.employeeCode ?? '—',
    department: empMap.get(a.employeeId)?.department?.name ?? '—',
    status: a.status,
    signedAt: a.signedAt,
    notifiedAt: a.notifiedAt,
    reminderCount: a.reminderCount,
  }))

  return NextResponse.json({ coverage: rows })
}
