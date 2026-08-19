/**
 * GET   /api/profile/notification-settings — every switch, plus theme and sound.
 * PATCH /api/profile/notification-settings — save any subset of them.
 *
 * One row per (user, notification type) in NotificationPreference, using its
 * `category` column to hold the type. A missing row means "on", so a user who
 * has never opened this screen is subscribed to everything and the table stays
 * empty until somebody actually chooses.
 *
 * Theme and sound live on User because they are not per-notification.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import {
  NOTIFICATION_CATALOG, CATALOG_BY_TYPE, THEMES, NOTIFICATION_SOUNDS,
} from '@/lib/notification-catalog'

export async function GET(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [rows, user] = await Promise.all([
    prisma.notificationPreference.findMany({ where: { userId: payload.userId } }),
    prisma.user.findUnique({
      where: { id: payload.userId },
      select: { theme: true, notificationSound: true },
    }),
  ])

  const byType = new Map(rows.map((r) => [r.category, r]))
  const prefs = NOTIFICATION_CATALOG.map((n) => ({
    type: n.type,
    emailEnabled: byType.get(n.type)?.emailEnabled ?? true,
    inAppEnabled: byType.get(n.type)?.inAppEnabled ?? true,
  }))

  return NextResponse.json({
    prefs,
    theme: user?.theme ?? 'LIGHT',
    sound: user?.notificationSound ?? 'CHIME',
  })
}

export async function PATCH(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))

  const userData: Record<string, string> = {}
  if (typeof body.theme === 'string' && (THEMES as readonly string[]).includes(body.theme)) {
    userData.theme = body.theme
  }
  if (typeof body.sound === 'string' && (NOTIFICATION_SOUNDS as readonly string[]).includes(body.sound)) {
    userData.notificationSound = body.sound
  }
  if (Object.keys(userData).length) {
    await prisma.user.update({ where: { id: payload.userId }, data: userData })
  }

  if (Array.isArray(body.prefs)) {
    // Unknown types are dropped rather than rejected: the catalogue changes as
    // features ship, and a stale tab open in another window should not 400.
    const valid = body.prefs.filter(
      (p: { type?: string }) => typeof p?.type === 'string' && CATALOG_BY_TYPE.has(p.type),
    )
    await prisma.$transaction(
      valid.map((p: { type: string; emailEnabled?: boolean; inAppEnabled?: boolean }) =>
        prisma.notificationPreference.upsert({
          where: { userId_category: { userId: payload.userId, category: p.type } },
          update: { emailEnabled: !!p.emailEnabled, inAppEnabled: !!p.inAppEnabled },
          create: {
            userId: payload.userId,
            category: p.type,
            emailEnabled: !!p.emailEnabled,
            inAppEnabled: !!p.inAppEnabled,
          },
        }),
      ),
      { timeout: 60000 },
    )
  }

  return NextResponse.json({ ok: true })
}
