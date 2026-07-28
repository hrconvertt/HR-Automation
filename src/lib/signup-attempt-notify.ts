/**
 * HR notification fan-out for a new SignupAttempt.
 *
 * De-dupe: only fire if the attempt hasn't been notified in the last 24h.
 * Stamps `lastNotifiedAt` on the attempt row so repeat retries from the
 * same email don't flood HR's inbox.
 */
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000

export async function notifyHrOfSignupAttempt(attemptId: string, email: string): Promise<void> {
  const attempt = await prisma.signupAttempt.findUnique({ where: { id: attemptId } })
  if (!attempt) return

  if (attempt.lastNotifiedAt && Date.now() - attempt.lastNotifiedAt.getTime() < DEDUPE_WINDOW_MS) {
    return
  }

  // Find all HR_ADMIN employees (primary role OR additional role).
  const admins = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: 'HR_ADMIN' },
        { userRoles: { some: { role: 'HR_ADMIN' } } },
      ],
    },
    select: { employee: { select: { id: true } } },
  })

  const employeeIds = admins
    .map((u) => u.employee?.id)
    .filter((id): id is string => Boolean(id))

  await Promise.all(
    employeeIds.map((empId) =>
      notify({
        employeeId: empId,
        type: 'GENERAL',
        title: 'New sign-up attempt — review needed',
        message: `${email} tried to sign up. Review in Settings → Users → Sign-up Attempts.`,
        link: '/dashboard/settings/users?tab=signup-attempts',
      }),
    ),
  )

  await prisma.signupAttempt.update({
    where: { id: attemptId },
    data: { lastNotifiedAt: new Date() },
  })
}
