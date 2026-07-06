import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

/**
 * Culture notification config â€” single row, HR_ADMIN only.
 * Controls fan-out scope for the celebrations cron.
 */

const SCOPES = ['TEAM_ONLY', 'COMPANY_WIDE'] as const

async function getOrCreate() {
  let cfg = await prisma.cultureNotificationConfig.findFirst()
  if (!cfg) cfg = await prisma.cultureNotificationConfig.create({ data: {} })
  return cfg
}

async function requireHR(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return null
  const user = await prisma.user.findUnique({ where: { id: payload.userId } })
  if (!user || user.role !== 'HR_ADMIN') return null
  return user
}

export async function GET(request: NextRequest) {
  const user = await requireHR(request)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const config = await getOrCreate()
  return NextResponse.json({ config })
}

export async function PATCH(request: NextRequest) {
  const user = await requireHR(request)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const data: Record<string, string> = {}

  for (const key of ['birthdayNotificationScope', 'anniversaryNotificationScope', 'eventNotificationScope'] as const) {
    const v = body[key]
    if (typeof v === 'string' && (SCOPES as readonly string[]).includes(v)) {
      data[key] = v
    }
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const existing = await getOrCreate()
  const config = await prisma.cultureNotificationConfig.update({
    where: { id: existing.id },
    data: { ...data, updatedById: user.id },
  })
  return NextResponse.json({ config })
}
