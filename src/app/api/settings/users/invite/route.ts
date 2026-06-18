/**
 * Invite a new employee: creates Employee + User + UserRoles + LeaveBalance
 * seed + OnboardingChecklist, then sends a Clerk invitation email.
 *
 * Thin wrapper over inviteEmployee() in src/lib/invite-employee.ts — the
 * same helper is reused by the sign-up-attempt approval flow.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { inviteEmployee, InviteEmployeeError } from '@/lib/invite-employee'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  const body = (await req.json()) as Record<string, unknown>

  try {
    const result = await inviteEmployee({
      fullName: String(body.fullName ?? ''),
      email: String(body.email ?? ''),
      designation: String(body.designation ?? ''),
      departmentId: (body.departmentId as string | null | undefined) ?? null,
      reportingManagerId: (body.reportingManagerId as string | null | undefined) ?? null,
      employeeType: body.employeeType as string | undefined,
      joiningDate: body.joiningDate as string | undefined,
      primaryRole: body.primaryRole as string | undefined,
      additionalRoles: body.additionalRoles as string[] | undefined,
      sendInvite: body.sendInvite as boolean | undefined,
    })
    return NextResponse.json({
      employeeId: result.employeeId,
      employeeCode: result.employeeCode,
      clerkInviteSent: result.clerkInviteSent,
      clerkError: result.clerkError,
    })
  } catch (e) {
    if (e instanceof InviteEmployeeError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
}
