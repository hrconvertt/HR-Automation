/**
 * GET  /api/recruiting/settings — the recruiting module's switches.
 * PATCH                        — change them.
 *
 * Stored as one Config row of JSON rather than a column each. These are
 * preferences, not records: they change often, nothing joins against them, and
 * a migration per toggle is a poor trade.
 *
 * HR and executives read; HR writes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { RECRUITING_SETTING_KEYS, DEFAULT_RECRUITING_SETTINGS } from '@/lib/recruiting-settings'

const CONFIG_KEY = 'recruiting_settings'

async function read() {
  const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } })
  let stored: Record<string, unknown> = {}
  try { stored = row?.value ? JSON.parse(row.value) : {} } catch { stored = {} }
  return { ...DEFAULT_RECRUITING_SETTINGS, ...stored }
}

export async function GET(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN' && payload.role !== 'EXECUTIVE') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }
  return NextResponse.json({ settings: await read() })
}

export async function PATCH(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }
  if (request.cookies.get('hr_preview_role')?.value) {
    return NextResponse.json({ error: 'Leave preview mode to change settings.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const current = await read()
  const next: Record<string, unknown> = { ...current }

  // Only keys we know about, coerced to the type the key expects. An unknown
  // key in the body is ignored rather than stored.
  for (const [key, spec] of Object.entries(RECRUITING_SETTING_KEYS)) {
    if (!(key in body)) continue
    const raw = body[key]
    if (spec.type === 'boolean') next[key] = !!raw
    else if (spec.type === 'number') {
      const n = Number(raw)
      if (!Number.isFinite(n)) continue
      next[key] = Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, n))
    } else {
      next[key] = String(raw ?? '').slice(0, 500)
    }
  }

  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: CONFIG_KEY, value: JSON.stringify(next) },
  })

  return NextResponse.json({ ok: true, settings: next })
}
