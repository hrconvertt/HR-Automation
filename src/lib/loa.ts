// Shared helpers for Leave of Absence (extended leave — medical, maternity,
// sabbatical…). See prisma model `LeaveOfAbsence`. Distinct from day-to-day
// LeaveRequest PTO: an LOA takes the employee off attendance surfaces for the
// whole period (the attendance grid reads this table directly).

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

export const LOA_TYPES = [
  'MEDICAL',
  'MATERNITY',
  'PATERNITY',
  'SABBATICAL',
  'UNPAID_PERSONAL',
] as const
export type LoaType = (typeof LOA_TYPES)[number]

export const LOA_TYPE_LABEL: Record<LoaType, string> = {
  MEDICAL: 'Medical',
  MATERNITY: 'Maternity',
  PATERNITY: 'Paternity',
  SABBATICAL: 'Sabbatical',
  UNPAID_PERSONAL: 'Unpaid Personal',
}

export const LOA_STATUSES = ['ACTIVE', 'RETURNED', 'EXTENDED'] as const
export type LoaStatus = (typeof LOA_STATUSES)[number]

export interface LoaAccess {
  userId: string
  actualRole: string
  effectiveRole: string
  isPreviewMode: boolean
}

/**
 * LOA is HR_ADMIN-only (reads scoped by effective role so HR previewing as
 * another role sees what that role sees — nothing; writes gated on the
 * ACTUAL role and blocked entirely while previewing). Same shape as
 * resolveJobChangeAccess.
 */
export async function requireLoaHR(
  request: NextRequest,
  { write = false }: { write?: boolean } = {},
): Promise<{ access: LoaAccess } | { error: NextResponse }> {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const previewRole =
    payload.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? payload.role
  const isPreviewMode = payload.role === 'HR_ADMIN' && !!previewRole && previewRole !== 'HR_ADMIN'

  if (payload.role !== 'HR_ADMIN' || effectiveRole !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  if (write && isPreviewMode) {
    return { error: NextResponse.json({ error: 'Switch back to HR view to manage leaves of absence' }, { status: 403 }) }
  }
  return {
    access: { userId: payload.userId, actualRole: payload.role, effectiveRole, isPreviewMode },
  }
}

/** Serialise an LOA row (with employee include) for the client. */
export function serializeLoa(l: {
  id: string
  type: string
  startDate: Date
  expectedReturn: Date
  actualReturn: Date | null
  paid: boolean
  notes: string | null
  status: string
  createdAt: Date
  employee: { id: string; fullName: string; employeeCode: string; designation: string }
}) {
  return {
    id: l.id,
    type: l.type,
    typeLabel: LOA_TYPE_LABEL[l.type as LoaType] ?? l.type,
    startDate: l.startDate.toISOString(),
    expectedReturn: l.expectedReturn.toISOString(),
    actualReturn: l.actualReturn?.toISOString() ?? null,
    paid: l.paid,
    notes: l.notes,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
    employee: l.employee,
  }
}

export const LOA_EMPLOYEE_SELECT = {
  id: true, fullName: true, employeeCode: true, designation: true,
} as const
