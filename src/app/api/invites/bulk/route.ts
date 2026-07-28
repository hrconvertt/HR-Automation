/**
 * POST /api/invites/bulk — HR_ADMIN only.
 *
 * Sends a login invite to every ACTIVE employee who has an email address and
 * no working login yet (no User row, or a User row with no password set and
 * no Clerk account linked). Returns per-employee results.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { createLoginInvite } from '@/lib/login-invites'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json(
      { error: 'View-only while previewing another role. Switch back to HR view.' },
      { status: 403 },
    )
  }

  const candidates = await prisma.employee.findMany({
    where: {
      status: 'ACTIVE',
      // Must be reachable on at least one address. `email` is required in the
      // schema, but guard against empty strings from legacy imports.
      OR: [{ email: { not: '' } }, { personalEmail: { not: null } }],
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      personalEmail: true,
      user: { select: { id: true, password: true, clerkUserId: true } },
    },
    orderBy: { fullName: 'asc' },
  })

  const uninvited = candidates.filter(
    (e) => !e.user || (!e.user.password && !e.user.clerkUserId),
  )

  const results: Array<{
    employeeId: string
    fullName: string
    ok: boolean
    sentTo?: string
    error?: string
  }> = []

  for (const emp of uninvited) {
    const r = await createLoginInvite({ employeeId: emp.id, createdById: payload.userId })
    results.push({
      employeeId: emp.id,
      fullName: emp.fullName,
      ok: r.ok,
      sentTo: r.sentTo,
      error: r.error,
    })
  }

  return NextResponse.json({
    ok: true,
    total: uninvited.length,
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  })
}
