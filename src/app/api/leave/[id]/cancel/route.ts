/**
 * POST /api/leave/[id]/cancel
 * Cancel a PENDING leave request.
 *
 * Rules:
 *   - Only the request's own owner can cancel (no proxy cancel by manager / HR here).
 *   - Only PENDING requests can be cancelled. Already-APPROVED leave goes through
 *     HR (different flow with balance restoration — out of scope for this endpoint).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  const myEmpId = me?.employee?.id ?? null
  if (!myEmpId) return NextResponse.json({ error: 'No employee linked' }, { status: 400 })

  const { id } = await params
  const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } })
  if (!leaveRequest) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (leaveRequest.employeeId !== myEmpId) {
    return NextResponse.json(
      { error: 'You can only cancel your own leave requests.' },
      { status: 403 },
    )
  }
  if (leaveRequest.status !== 'PENDING' && leaveRequest.status !== 'PENDING_HR') {
    return NextResponse.json(
      { error: 'Only pending requests can be cancelled.' },
      { status: 400 },
    )
  }

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: 'CANCELLED' },
  })

  return NextResponse.json({ success: true })
}
