/**
 * PATCH /api/interim-rules — turn one interim rule off, or back on.
 *
 * HR only, and only the rules that have a switch. The rest of the catalogue is
 * there to be read: a practice or a missing credential cannot be toggled, and
 * offering a switch that does nothing would be worse than offering none.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { setInterimFlag, allInterimFlags } from '@/lib/interim-flags'
import { RULE_BY_KEY } from '@/lib/interim-rules'

export async function GET(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ flags: await allInterimFlags() })
}

export async function PATCH(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  let body: { key?: string; enabled?: boolean } = {}
  try { body = await request.json() } catch { /* validated below */ }

  if (typeof body.key !== 'string' || !RULE_BY_KEY.has(body.key)) {
    return NextResponse.json({ error: 'Unknown rule.' }, { status: 400 })
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be true or false.' }, { status: 400 })
  }

  await setInterimFlag(body.key, body.enabled)
  return NextResponse.json({ flags: await allInterimFlags() })
}
