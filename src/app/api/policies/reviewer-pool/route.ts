import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

/**
 * Returns the eligible reviewer pool for the policy approval workflow:
 *   - All ACTIVE employees whose linked User has role EXECUTIVE or HR_ADMIN.
 * HR-only endpoint â€” used by the Send-for-Review dialog.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ['EXECUTIVE', 'HR_ADMIN'] },
      employee: { isNot: null },
    },
    select: {
      role: true,
      employee: { select: { id: true, fullName: true, designation: true, status: true } },
    },
  })

  const reviewers = users
    .filter((u) => u.employee && u.employee.status === 'ACTIVE')
    .map((u) => ({
      id: u.employee!.id,
      fullName: u.employee!.fullName,
      designation: u.employee!.designation,
      role: u.role,
    }))
    // Executives first, then HR
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === 'EXECUTIVE' ? -1 : 1
      return a.fullName.localeCompare(b.fullName)
    })

  return NextResponse.json({ reviewers })
}
