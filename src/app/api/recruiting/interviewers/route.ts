/**
 * GET /api/recruiting/interviewers
 *
 *   Returns the pool of employees who can interview candidates â€” anyone
 *   with the MANAGER, LEAD, or HR_ADMIN role membership, plus any active
 *   employee whose designation mentions "Lead", "Manager", "Head", "HR".
 *
 *   Used by ScheduleInterviewDialog as the interviewer multi-select source.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const roles = await prisma.userRole.findMany({
    where: { role: { in: ['MANAGER', 'LEAD', 'HR_ADMIN'] } },
    select: { userId: true },
  })
  const userIds = roles.map((r) => r.userId)

  const employees = await prisma.employee.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { userId: { in: userIds } },
        { designation: { contains: 'Lead' } },
        { designation: { contains: 'Manager' } },
        { designation: { contains: 'Head' } },
        { designation: { contains: 'HR' } },
      ],
    },
    select: { id: true, fullName: true, designation: true },
    orderBy: { fullName: 'asc' },
    take: 100,
  })

  return NextResponse.json({ interviewers: employees })
}
