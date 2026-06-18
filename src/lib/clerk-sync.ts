/**
 * Clerk → DB sync.
 *
 * Two callers:
 *   1) /api/webhooks/clerk — fires on user.created/updated/deleted
 *   2) verifyToken (defensive) — if a Clerk-authenticated session has no
 *      matching User row, we look it up by email and link clerkUserId.
 *
 * Idempotent. Safe to call repeatedly.
 */
import { clerkClient } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'

export interface ClerkSyncResult {
  userId: string
  created: boolean
  linked: boolean
}

/**
 * Link a Clerk user to a DB User row. If no matching row exists (by email),
 * create one with role=EMPLOYEE. Idempotent.
 */
export async function syncClerkUser(clerkUserId: string): Promise<ClerkSyncResult | null> {
  const client = await clerkClient()
  const clerkUser = await client.users.getUser(clerkUserId).catch(() => null)
  if (!clerkUser) return null

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    null
  if (!email) return null

  // Already linked?
  const linked = await prisma.user.findUnique({ where: { clerkUserId } })
  if (linked) {
    return { userId: linked.id, created: false, linked: true }
  }

  // Match by email
  const byEmail = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (byEmail) {
    const updated = await prisma.user.update({
      where: { id: byEmail.id },
      data: { clerkUserId },
    })
    return { userId: updated.id, created: false, linked: true }
  }

  // No existing User — create. New users default to EMPLOYEE; HR can
  // promote afterwards via the User Management panel.
  const created = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      clerkUserId,
      password: '', // deprecated column, Clerk owns auth
      role: 'EMPLOYEE',
      isActive: true,
      mustChangePass: false,
    },
  })
  return { userId: created.id, created: true, linked: true }
}

/**
 * Handle email change from Clerk webhook. Updates User.email if it changed.
 */
export async function updateClerkUserEmail(clerkUserId: string, newEmail: string): Promise<void> {
  await prisma.user.updateMany({
    where: { clerkUserId },
    data: { email: newEmail.toLowerCase() },
  })
}

/**
 * Soft-delete: mark User inactive. We never hard-delete — audit trail
 * (payroll, leave history, etc.) must stay intact.
 */
export async function deactivateClerkUser(clerkUserId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { clerkUserId },
    data: { isActive: false },
  })
}
