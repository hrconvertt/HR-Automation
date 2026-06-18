/**
 * Shared access resolver for /api/leadership-chat/* endpoints.
 *
 * Every endpoint in this module must:
 *   1. Verify the caller is signed in.
 *   2. Verify the caller has an Employee row (DMs are between employees).
 *   3. Verify the caller is senior staff (canUseLeadershipChat).
 *
 * Returns the caller's Employee.id + senior-staff status, or null + a
 * NextResponse with the appropriate 401/403 the route should return.
 */

import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canUseLeadershipChat } from '@/lib/can-message'

export type ChatAccess = {
  employeeId: string
  userId: string
  role: string
  designation: string | null
  positionLevel: string | null
}

export async function requireChatAccess(): Promise<
  | { ok: true; access: ChatAccess }
  | { ok: false; response: NextResponse }
> {
  const payload = await verifyToken()
  if (!payload) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      role: true,
      employee: {
        select: {
          id: true,
          designation: true,
          position: { select: { level: true } },
        },
      },
    },
  })
  if (!user || !user.employee) {
    return { ok: false, response: NextResponse.json({ error: 'No employee record' }, { status: 403 }) }
  }
  const role = user.role
  const designation = user.employee.designation
  const positionLevel = user.employee.position?.level ?? null
  if (!canUseLeadershipChat(role, designation, positionLevel)) {
    return { ok: false, response: NextResponse.json({ error: 'Not authorised' }, { status: 403 }) }
  }
  return {
    ok: true,
    access: {
      employeeId: user.employee.id,
      userId: user.id,
      role,
      designation,
      positionLevel,
    },
  }
}
