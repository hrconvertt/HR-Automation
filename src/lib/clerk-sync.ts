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
  rejected?: boolean   // email not on the allowlist; Clerk user has been deleted
}

/**
 * Link a Clerk user to an existing DB User row by email. INVITE-ONLY:
 * if no matching DB row exists, the Clerk user is REJECTED (deleted) —
 * we don't auto-create new accounts for unknown emails. HR adds employees
 * through the User Management panel, which seeds the DB row first and
 * then sends the Clerk invite.
 *
 * Idempotent.
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
  const normalisedEmail = email.toLowerCase()

  // Already linked?
  const linked = await prisma.user.findUnique({ where: { clerkUserId } })
  if (linked) {
    return { userId: linked.id, created: false, linked: true }
  }

  // Match by email — allowlist check.
  const byEmail = await prisma.user.findUnique({ where: { email: normalisedEmail } })
  if (byEmail) {
    const updated = await prisma.user.update({
      where: { id: byEmail.id },
      data: { clerkUserId },
    })
    return { userId: updated.id, created: false, linked: true }
  }

  // ─── REJECTED — email not on the allowlist ──────────────────────────────
  // Delete the Clerk user immediately so they can't accumulate sessions or
  // retry endlessly. Log the rejection so HR can audit attempts.
  console.warn(`[clerk-sync] REJECTED unknown email: ${normalisedEmail} (clerk_id=${clerkUserId})`)
  try {
    await client.users.deleteUser(clerkUserId)
  } catch (err) {
    console.error('[clerk-sync] failed to delete rejected Clerk user', err)
  }
  return { userId: '', created: false, linked: false, rejected: true }
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
