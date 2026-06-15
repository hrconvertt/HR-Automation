/**
 * Demo data seeder endpoint — HR-only.
 *
 * POST   → seed demo Attendance/Leave/Policies data (idempotent)
 * DELETE → wipe all demo-marked rows
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, hasRole } from '@/lib/auth'
import { seedDemo, wipeDemo } from '@/lib/demo-seed'

async function requireHR(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!hasRole(payload, 'HR_ADMIN')) {
    return { error: NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 }) }
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'Switch back to HR view to seed demo data' }, { status: 403 }) }
  }
  return {}
}

export async function POST(request: NextRequest) {
  const auth = await requireHR(request)
  if (auth.error) return auth.error
  try {
    const report = await seedDemo()
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    console.error('[seed-demo]', err)
    return NextResponse.json({ error: 'Seeding failed', detail: String(err) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireHR(request)
  if (auth.error) return auth.error
  try {
    const result = await wipeDemo()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[wipe-demo]', err)
    return NextResponse.json({ error: 'Wipe failed', detail: String(err) }, { status: 500 })
  }
}
