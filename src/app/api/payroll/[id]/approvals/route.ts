/**
 * GET /api/payroll/[id]/approvals
 * Returns the approval audit chain for a payroll run.
 *
 * Access: only roles that can act on payroll runs — HR_ADMIN, MANAGER (Finance),
 * EXECUTIVE. Plain EMPLOYEE never sees the approval audit trail.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Re-read role from DB so a downgraded user with a stale token loses access.
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, userRoles: { select: { role: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Accept primary role OR multi-role array (Finance / Manager / Exec / HR)
  const allRoles = new Set([me.role, ...me.userRoles.map((r) => r.role)])
  const allowed = ['HR_ADMIN', 'EXECUTIVE', 'MANAGER', 'FINANCE']
  if (!allowed.some((r) => allRoles.has(r))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const approvals = await prisma.payrollRunApproval.findMany({
    where: { runId: id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ approvals })
}
