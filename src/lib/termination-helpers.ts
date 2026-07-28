/**
 * Shared helpers for /api/termination/[id]/* action endpoints.
 * Every stage-transition endpoint reuses the same auth guard + activity-log
 * append pattern.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

export interface ActionAccess {
  userId: string
  actorName: string
}

export async function guardHrAction(request: NextRequest): Promise<
  | { ok: true; access: ActionAccess }
  | { ok: false; response: NextResponse }
> {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!hasRole(payload, 'HR_ADMIN')) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return { ok: false, response: NextResponse.json({ error: 'View-only while previewing role' }, { status: 403 }) }
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { email: true, employee: { select: { fullName: true } } },
  })
  const actorName = user?.employee?.fullName ?? user?.email ?? 'HR'
  return { ok: true, access: { userId: payload.userId, actorName } }
}

export function pushActivity(existing: string | null, entry: { at: string; by: string; action: string; note?: string }): string {
  let arr: unknown[] = []
  if (existing) {
    try { const parsed = JSON.parse(existing); if (Array.isArray(parsed)) arr = parsed } catch { /* ignore */ }
  }
  arr.push(entry)
  return JSON.stringify(arr)
}
