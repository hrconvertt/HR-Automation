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
  // Log a SignupAttempt row BEFORE deleting the Clerk user so HR can review
  // and either approve (creates User/Employee + sends Clerk invite) or
  // dismiss the attempt later.
  console.warn(`[clerk-sync] REJECTED unknown email: ${normalisedEmail} (clerk_id=${clerkUserId})`)
  try {
    await logSignupAttempt({
      email: normalisedEmail,
      clerkUserId,
      firstName: clerkUser.firstName ?? null,
      lastName: clerkUser.lastName ?? null,
    })
  } catch (err) {
    console.error('[clerk-sync] failed to log signup attempt', err)
  }

  try {
    await client.users.deleteUser(clerkUserId)
  } catch (err) {
    console.error('[clerk-sync] failed to delete rejected Clerk user', err)
  }
  return { userId: '', created: false, linked: false, rejected: true }
}

/**
 * Record a rejected sign-up so HR can review later.
 *
 * Idempotent: if there's already an open PENDING attempt for the same email,
 * just bump `attemptedAt`. Notifies HR_ADMINs once per 24h per email (de-dupe
 * via SignupAttempt.lastNotifiedAt).
 */
async function logSignupAttempt(args: {
  email: string
  clerkUserId: string
  firstName: string | null
  lastName: string | null
}): Promise<void> {
  const { notifyHrOfSignupAttempt } = await import('@/lib/signup-attempt-notify')

  const existing = await prisma.signupAttempt.findFirst({
    where: { email: args.email, status: 'PENDING' },
    orderBy: { attemptedAt: 'desc' },
  })

  if (existing) {
    await prisma.signupAttempt.update({
      where: { id: existing.id },
      data: {
        attemptedAt: new Date(),
        clerkUserId: args.clerkUserId,
        firstName: args.firstName ?? existing.firstName,
        lastName: args.lastName ?? existing.lastName,
      },
    })
    await notifyHrOfSignupAttempt(existing.id, args.email)
    return
  }

  const created = await prisma.signupAttempt.create({
    data: {
      email: args.email,
      clerkUserId: args.clerkUserId,
      firstName: args.firstName,
      lastName: args.lastName,
      status: 'PENDING',
    },
  })
  await notifyHrOfSignupAttempt(created.id, args.email)
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
