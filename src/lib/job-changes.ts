// Shared helpers for the Job Change workflow (promote / transfer / manager
// change / designation change). See prisma model `JobChange`.
//
// No salary data flows through job changes — compensation revisions live in
// the Compensation module (`/api/employees/[id]/salary`).

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export const JOB_CHANGE_TYPES = [
  'PROMOTION',
  'TRANSFER',
  'MANAGER_CHANGE',
  'DESIGNATION_CHANGE',
] as const
export type JobChangeType = (typeof JOB_CHANGE_TYPES)[number]

export const JOB_CHANGE_TYPE_LABEL: Record<JobChangeType, string> = {
  PROMOTION: 'Promotion',
  TRANSFER: 'Transfer',
  MANAGER_CHANGE: 'Manager Change',
  DESIGNATION_CHANGE: 'Designation Change',
}

export const JOB_CHANGE_STATUSES = [
  'PENDING_APPROVAL',
  'APPROVED',
  'ENACTED',
  'REJECTED',
  'CANCELLED',
] as const
export type JobChangeStatus = (typeof JOB_CHANGE_STATUSES)[number]

/** Deterministic purpose string linking a promotion LetterRequest back to its job change. */
export function promotionLetterPurpose(jobChangeId: string): string {
  return `Promotion letter — job change ${jobChangeId}`
}

export interface JobChangeAccess {
  userId: string
  actualRole: string
  effectiveRole: string
  isPreviewMode: boolean
  employeeId: string | null
  userName: string
}

/**
 * Standard access resolution (same shape as letters/probation routes):
 * actualRole gates writes, effectiveRole scopes reads, and HR previewing as
 * another role (hr_preview_role cookie) is blocked from all writes.
 */
export async function resolveJobChangeAccess(request: NextRequest): Promise<JobChangeAccess | null> {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, fullName: true } } },
  })
  if (!user) return null
  const previewRole =
    user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  return {
    userId: user.id,
    actualRole: user.role,
    effectiveRole,
    isPreviewMode: user.role === 'HR_ADMIN' && !!previewRole && previewRole !== 'HR_ADMIN',
    employeeId: user.employee?.id ?? null,
    userName: user.employee?.fullName ?? user.email,
  }
}

/** Notify every HR admin (except, optionally, the actor themselves). */
export async function hrAdminEmployeeIds(excludeUserId?: string): Promise<string[]> {
  const hrUsers = await prisma.user.findMany({
    where: { role: 'HR_ADMIN', employee: { isNot: null } },
    select: { id: true, employee: { select: { id: true } } },
  })
  return hrUsers
    .filter((u) => u.id !== excludeUserId)
    .map((u) => u.employee?.id)
    .filter((id): id is string => !!id)
}
