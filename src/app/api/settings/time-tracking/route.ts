import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_MODES = ['BASIC', 'TIMESHEET', 'JOBS'] as const
type Mode = (typeof VALID_MODES)[number]

const DEFAULT_CATEGORIES = 'Dev\nQA\nMeetings\nAdmin'

async function authHR() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = await verifyToken(tok)
  if (!payload) return null
  const user = await prisma.user.findUnique({ where: { id: payload.userId } })
  if (!user || user.role !== 'HR_ADMIN') return null
  return user
}

export async function GET() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = await verifyToken(tok)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const modeRow = await prisma.config.findUnique({ where: { key: 'timeTrackingMode' } })
  const catRow = await prisma.config.findUnique({ where: { key: 'timesheetCategories' } })
  const mode = (VALID_MODES as readonly string[]).includes(modeRow?.value ?? '')
    ? (modeRow!.value as Mode)
    : 'BASIC'
  const categories = catRow?.value ?? DEFAULT_CATEGORIES
  return NextResponse.json({ mode, categories })
}

export async function POST(request: NextRequest) {
  const user = await authHR()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const mode = String(body.mode ?? '').toUpperCase()
  const categories = typeof body.categories === 'string' ? body.categories : DEFAULT_CATEGORIES
  if (!(VALID_MODES as readonly string[]).includes(mode)) {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  }
  await prisma.config.upsert({
    where: { key: 'timeTrackingMode' },
    update: { value: mode },
    create: { key: 'timeTrackingMode', value: mode },
  })
  await prisma.config.upsert({
    where: { key: 'timesheetCategories' },
    update: { value: categories },
    create: { key: 'timesheetCategories', value: categories },
  })
  return NextResponse.json({ ok: true, mode, categories })
}
