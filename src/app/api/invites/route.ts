/**
 * POST /api/invites — HR_ADMIN only.
 *
 * Body: { employeeId, sendTo?: 'work' | 'personal' }
 * Sends a one-time "set your password" link to the chosen address.
 * The raw token is NEVER returned to the client.
 */
import { NextRequest, NextResponse } from 'next/server'
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

  let body: { employeeId?: string; sendTo?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const employeeId = String(body.employeeId ?? '').trim()
  if (!employeeId) {
    return NextResponse.json({ error: 'employeeId is required' }, { status: 400 })
  }
  const sendTo =
    body.sendTo === 'personal' ? 'personal' : body.sendTo === 'work' ? 'work' : undefined

  const result = await createLoginInvite({
    employeeId,
    sendTo,
    createdById: payload.userId,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 })
  }
  return NextResponse.json({ ok: true, sentTo: result.sentTo })
}
