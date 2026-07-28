/**
 * GET   /api/settings/daily-logging — read config (any signed-in user)
 * PATCH /api/settings/daily-logging — update config (HR only)
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import {
  getDailyLoggingConfig,
  setDailyLoggingConfig,
  type DailyLoggingConfig,
} from '@/lib/daily-logging-config'

export async function GET() {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const cfg = await getDailyLoggingConfig()
  return NextResponse.json({ config: cfg })
}

export async function PATCH(request: NextRequest) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }
  const body = (await request.json()) as Partial<DailyLoggingConfig>
  const updated = await setDailyLoggingConfig(body)
  return NextResponse.json({ config: updated })
}
