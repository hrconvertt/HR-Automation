/**
 * Approve a sign-up attempt: creates the User + Employee using the same
 * helper as the manual Invite flow, sends a Clerk invitation, and marks
 * the attempt APPROVED.
 *
 * HR_ADMIN only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { inviteEmployee, InviteEmployeeError } from '@/lib/invite-employee'

export const runtime = 'nodejs'

interface ApproveBody {
  fullName: string
  designation: string
  departmentId: string
  reportingManagerId?: string
  employeeType?: 'PERMANENT' | 'PROBATION' | 'INTERNSHIP' | 'TRAINING'
  joiningDate?: string
  role?: string
  additionalRoles?: string[]
  notes?: string
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = (await req.json()) as ApproveBody

  const attempt = await prisma.signupAttempt.findUnique({ where: { id } })
  if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  if (attempt.status !== 'PENDING') {
    return NextResponse.json({ error: `Attempt is already ${attempt.status}` }, { status: 409 })
  }

  if (!body.fullName || !body.designation || !body.departmentId) {
    return NextResponse.json(
      { error: 'fullName, designation, departmentId required' },
      { status: 400 },
    )
  }

  let result
  try {
    result = await inviteEmployee({
      fullName: body.fullName,
      email: attempt.email,
      designation: body.designation,
      departmentId: body.departmentId,
      reportingManagerId: body.reportingManagerId ?? null,
      employeeType: body.employeeType ?? 'PROBATION',
      joiningDate: body.joiningDate,
      primaryRole: body.role ?? 'EMPLOYEE',
      additionalRoles: body.additionalRoles ?? [],
      sendInvite: true,
    })
  } catch (e) {
    if (e instanceof InviteEmployeeError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }

  await prisma.signupAttempt.update({
    where: { id },
    data: {
      status: 'APPROVED',
      reviewedAt: new Date(),
      reviewedById: payload.userId,
      resultingUserId: result.userId,
      reviewNotes: body.notes ?? null,
    },
  })

  return NextResponse.json({
    employeeId: result.employeeId,
    userId: result.userId,
    employeeCode: result.employeeCode,
    clerkInviteSent: result.clerkInviteSent,
    clerkError: result.clerkError,
  })
}
