import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// GET /api/probation
// Role-scoped list:
//   HR_ADMIN  â†’ all
//   MANAGER   â†’ team's
//   EMPLOYEE  â†’ own
export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const previewRole = user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  const meId = user.employee?.id ?? null

  let where: object = {}
  if (effectiveRole === 'MANAGER' && meId) {
    where = { employee: { reportingManagerId: meId } }
  } else if (effectiveRole === 'EMPLOYEE') {
    if (!meId) return NextResponse.json({ records: [] })
    where = { employeeId: meId }
  } else if (effectiveRole !== 'HR_ADMIN') {
    where = { id: '__none__' }
  }

  const records = await prisma.probationRecord.findMany({
    where,
    orderBy: { endDate: 'asc' },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          department: { select: { name: true } },
          reportingManager: { select: { id: true, fullName: true } },
        },
      },
    },
  })

  return NextResponse.json({ records })
}
