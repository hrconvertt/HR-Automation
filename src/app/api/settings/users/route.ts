/**
 * User Management API — HR_ADMIN only.
 *
 * GET  /api/settings/users        — list all users with Clerk MFA + active state
 * POST /api/settings/users/invite — create Employee + User + Clerk invite
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { clerkClient } from '@clerk/nextjs/server'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    where: {}, // include inactive so HR can re-activate
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      clerkUserId: true,
      lastLogin: true,
      userRoles: { select: { role: true } },
      employee: {
        select: {
          id: true,
          fullName: true,
          designation: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: [{ isActive: 'desc' }, { email: 'asc' }],
  })

  // Enrich with Clerk MFA status (best-effort — if Clerk is down, return null)
  const client = await clerkClient().catch(() => null)
  const rows = await Promise.all(
    users.map(async (u) => {
      let mfaEnabled: boolean | null = null
      if (client && u.clerkUserId) {
        try {
          const clerkUser = await client.users.getUser(u.clerkUserId)
          mfaEnabled = clerkUser.twoFactorEnabled ?? false
        } catch {
          mfaEnabled = null
        }
      }
      return {
        id: u.id,
        email: u.email,
        fullName: u.employee?.fullName ?? u.email,
        designation: u.employee?.designation ?? null,
        department: u.employee?.department?.name ?? null,
        primaryRole: u.role,
        roles: Array.from(new Set([u.role, ...u.userRoles.map((r) => r.role)])),
        isActive: u.isActive,
        clerkLinked: !!u.clerkUserId,
        clerkUserId: u.clerkUserId,
        mfaEnabled,
        lastLogin: u.lastLogin,
      }
    }),
  )

  return NextResponse.json({ rows })
}
