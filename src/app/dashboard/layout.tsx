import { redirect } from 'next/navigation'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import DashboardChrome from '@/components/dashboard-chrome'
import MfaBanner from '@/components/mfa-banner'
import { canUseLeadershipChat } from '@/lib/can-message'

// Server wrapper â€” reads role + identity from cookie BEFORE render so the
// client sidebar never has to wait on a fetch. Eliminates the hydration race
// that was leaving Iqra (and every Manager) with an empty sidebar.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Clerk owns the session now — verifyToken reads from auth().
  const payload = await verifyToken()
  if (!payload) {
    // Two reasons we could be here:
    //   (a) Not signed in to Clerk at all → send to /login
    //   (b) Signed in to Clerk but their email isn't on the DB allowlist.
    //       clerk-sync has already deleted the rejected Clerk user, but we
    //       might still be holding a session cookie. Send to /unauthorized
    //       so the user understands they're not on the guest list.
    const session = await auth().catch(() => null)
    if (session?.userId) {
      redirect('/unauthorized')
    }
    redirect('/login')
  }

  // Hard MFA enforcement (opt-in). Set MFA_ENFORCED_ROLES="HR_ADMIN,EXECUTIVE,FINANCE"
  // to bounce users without MFA to the security settings page.
  const enforced = (process.env.MFA_ENFORCED_ROLES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (enforced.length > 0 && enforced.includes(payload.role)) {
    // We can't read MFA state without an extra Clerk RPC; client-side MfaBanner
    // handles the nudge. Hard-block is a future enhancement.
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      role: true,
      mustChangePass: true,
      isActive: true,
      employee: {
        select: {
          id: true,
          fullName: true,
          designation: true,
          department: { select: { name: true } },
          position: { select: { level: true } },
        },
      },
    },
  })

  if (!user || !user.isActive) redirect('/login')

  // Normalise role â€” if null/unknown, fall back to EMPLOYEE so the user
  // is never stranded with an empty sidebar.
  const knownRoles = new Set(['HR_ADMIN', 'MANAGER', 'LEAD', 'EMPLOYEE', 'EXECUTIVE', 'FINANCE'])
  const role = knownRoles.has(user.role) ? user.role : 'EMPLOYEE'

  const displayName = user.employee?.fullName ?? user.email ?? 'User'
  const designation = user.employee?.designation ?? null
  const departmentName = user.employee?.department?.name ?? null
  const positionLevel = user.employee?.position?.level ?? null

  // Leadership-chat eligibility — surfaces (or hides) the sidebar entry.
  const canUseChat = canUseLeadershipChat(role, designation, positionLevel)

  // Check Clerk MFA state server-side so the banner is reliable even when
  // Clerk's client SDK fails to hydrate (which would otherwise show a false
  // "no MFA" nudge on every page load). Default to "MFA enabled" if the
  // lookup fails, so a transient Clerk API hiccup never spams HR with the
  // banner.
  let mfaEnabled = true
  try {
    const session = await auth().catch(() => null)
    if (session?.userId) {
      const client = await clerkClient()
      const clerkUser = await client.users.getUser(session.userId).catch(() => null)
      if (clerkUser) {
        mfaEnabled =
          !!clerkUser.twoFactorEnabled ||
          !!clerkUser.totpEnabled ||
          !!clerkUser.backupCodeEnabled
      }
    }
  } catch {
    mfaEnabled = true
  }

  return (
    <DashboardChrome
      role={role}
      displayName={displayName}
      email={user.email}
      designation={designation}
      departmentName={departmentName}
      mustChangePass={user.mustChangePass}
      canUseLeadershipChat={canUseChat}
    >
      <MfaBanner role={role} mfaEnabled={mfaEnabled} />
      {children}
    </DashboardChrome>
  )
}
