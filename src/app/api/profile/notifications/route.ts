import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

/**
 * GET   /api/profile/notifications â€” list current user's NotificationPreference rows
 * PATCH /api/profile/notifications â€” upsert one or many rows
 *
 * Body for PATCH:
 *   { prefs: [{ category, emailEnabled, inAppEnabled }, â€¦] }
 *
 * Missing rows default to {email:true, inApp:true} on the read side, so an
 * empty DB == "subscribed to everything". HR can flip categories per user.
 */
const CATEGORIES = ['LEAVE', 'PROBATION', 'PERFORMANCE', 'DOCUMENTS', 'CELEBRATIONS', 'PAYROLL', 'LIFECYCLE'] as const

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const rows = await prisma.notificationPreference.findMany({
    where: { userId: payload.userId },
  })
  const byCat = new Map(rows.map((r) => [r.category, r]))
  const prefs = CATEGORIES.map((c) => ({
    category: c,
    emailEnabled: byCat.get(c)?.emailEnabled ?? true,
    inAppEnabled: byCat.get(c)?.inAppEnabled ?? true,
  }))
  return NextResponse.json({ prefs })
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { prefs } = (await request.json().catch(() => ({}))) as {
    prefs?: Array<{ category: string; emailEnabled: boolean; inAppEnabled: boolean }>
  }
  if (!Array.isArray(prefs)) {
    return NextResponse.json({ error: 'prefs[] is required' }, { status: 400 })
  }

  for (const p of prefs) {
    if (!CATEGORIES.includes(p.category as typeof CATEGORIES[number])) continue
    await prisma.notificationPreference.upsert({
      where: { userId_category: { userId: payload.userId, category: p.category } },
      update: { emailEnabled: !!p.emailEnabled, inAppEnabled: !!p.inAppEnabled },
      create: {
        userId: payload.userId,
        category: p.category,
        emailEnabled: !!p.emailEnabled,
        inAppEnabled: !!p.inAppEnabled,
      },
    })
  }
  return NextResponse.json({ success: true })
}
