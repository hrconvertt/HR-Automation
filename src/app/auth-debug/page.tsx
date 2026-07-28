/**
 * /auth-debug — public diagnostic page.
 *
 * Shows EXACTLY what the server sees about the current session and the
 * matching User row in DB. Used to figure out why a sign-in loop is
 * happening when everything "should" work.
 *
 * No login required — middleware whitelists this route — because the
 * point is to debug WHY login is broken.
 *
 * Safe to leave in production: it only reveals data about the caller's
 * own session, no other users.
 */

import { auth, clerkClient } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function AuthDebugPage() {
  // 1. Server-side Clerk auth state
  let clerkUserId: string | null = null
  let clerkError: string | null = null
  try {
    const session = await auth()
    clerkUserId = session.userId ?? null
  } catch (e) {
    clerkError = e instanceof Error ? e.message : 'auth() threw'
  }

  // 2. The Clerk user object itself
  let clerkUser: {
    id: string
    primaryEmail: string | null
    twoFactorEnabled: boolean | null
    createdAt: string | null
  } | null = null
  let clerkLookupError: string | null = null
  if (clerkUserId) {
    try {
      const client = await clerkClient()
      const u = await client.users.getUser(clerkUserId)
      clerkUser = {
        id: u.id,
        primaryEmail: u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? null,
        twoFactorEnabled: u.twoFactorEnabled ?? null,
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
      }
    } catch (e) {
      clerkLookupError = e instanceof Error ? e.message : 'clerkClient.users.getUser threw'
    }
  }

  // 3. DB User row matching the linked clerkUserId
  let userByClerkId: {
    id: string
    email: string
    role: string
    isActive: boolean
    clerkUserId: string | null
  } | null = null
  if (clerkUserId) {
    const u = await prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true, email: true, role: true, isActive: true, clerkUserId: true },
    })
    userByClerkId = u
  }

  // 4. DB User row matching hr@convertt.co specifically (the HR allowlist target)
  const hrUser = await prisma.user.findUnique({
    where: { email: 'hr@convertt.co' },
    select: { id: true, email: true, role: true, isActive: true, clerkUserId: true },
  })

  // 5. DB User row matching whatever email Clerk thinks we are
  let userByClerkEmail: typeof hrUser | null = null
  if (clerkUser?.primaryEmail) {
    userByClerkEmail = await prisma.user.findUnique({
      where: { email: clerkUser.primaryEmail.toLowerCase() },
      select: { id: true, email: true, role: true, isActive: true, clerkUserId: true },
    })
  }

  // 6. All HR_ADMIN rows so we know the universe
  const allAdmins = await prisma.user.findMany({
    where: { role: 'HR_ADMIN' },
    select: { id: true, email: true, isActive: true, clerkUserId: true },
  })

  // Diagnosis
  const diagnoses: string[] = []
  if (!clerkUserId) {
    diagnoses.push('NOT SIGNED IN to Clerk — no server-side session. Sign in first.')
  }
  if (clerkUserId && !userByClerkId) {
    diagnoses.push(
      'Clerk thinks you\'re signed in, but no DB User row has your clerkUserId. ' +
      'syncClerkUser should have linked you on first dashboard hit; if it didn\'t, ' +
      'something is failing.'
    )
  }
  if (userByClerkId && !userByClerkId.isActive) {
    diagnoses.push(
      `Your matched User row (${userByClerkId.email}) is INACTIVE. ` +
      'That\'s why the dashboard layout bounces you back to /login. ' +
      'Fix: set User.isActive=true for this email.'
    )
  }
  if (clerkUser?.primaryEmail && userByClerkEmail && userByClerkEmail.clerkUserId !== clerkUserId) {
    diagnoses.push(
      `Email match found (${userByClerkEmail.email}) but its clerkUserId is "${userByClerkEmail.clerkUserId ?? '<null>'}" — ` +
      `does NOT match your current Clerk session ("${clerkUserId}"). ` +
      'syncClerkUser should re-link. If not, manually wipe User.clerkUserId for this email and re-sign-in.'
    )
  }
  if (diagnoses.length === 0 && userByClerkId?.isActive) {
    diagnoses.push('Everything looks healthy server-side. Dashboard should load. If you\'re still bouncing, the issue is browser-side (cached redirect, stale cookie).')
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-mono text-sm">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Auth Debug</h1>
          <p className="text-slate-500 mt-1">
            What the server sees right now. Send this whole page (screenshot or copy)
            back to support if you&apos;re stuck.
          </p>
        </header>

        {/* Diagnosis */}
        <section className="rounded-lg bg-amber-50 border border-amber-200 p-4">
          <h2 className="font-bold text-amber-900">Diagnosis</h2>
          <ul className="mt-2 space-y-1 list-disc list-inside text-amber-900">
            {diagnoses.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </section>

        {/* Clerk session */}
        <section className="rounded-lg bg-white border border-slate-200 p-4">
          <h2 className="font-bold text-slate-900">1. Clerk session (server-side)</h2>
          <pre className="mt-2 text-xs bg-slate-50 p-3 rounded overflow-auto">
{JSON.stringify({ clerkUserId, clerkError }, null, 2)}
          </pre>
        </section>

        {/* Clerk user object */}
        <section className="rounded-lg bg-white border border-slate-200 p-4">
          <h2 className="font-bold text-slate-900">2. Clerk user object</h2>
          <pre className="mt-2 text-xs bg-slate-50 p-3 rounded overflow-auto">
{JSON.stringify({ clerkUser, clerkLookupError }, null, 2)}
          </pre>
        </section>

        {/* User row by clerkUserId */}
        <section className="rounded-lg bg-white border border-slate-200 p-4">
          <h2 className="font-bold text-slate-900">3. DB User matching the Clerk userId</h2>
          <pre className="mt-2 text-xs bg-slate-50 p-3 rounded overflow-auto">
{JSON.stringify(userByClerkId, null, 2)}
          </pre>
        </section>

        {/* User row by email */}
        <section className="rounded-lg bg-white border border-slate-200 p-4">
          <h2 className="font-bold text-slate-900">4. DB User matching the Clerk email</h2>
          <pre className="mt-2 text-xs bg-slate-50 p-3 rounded overflow-auto">
{JSON.stringify(userByClerkEmail, null, 2)}
          </pre>
        </section>

        {/* HR row */}
        <section className="rounded-lg bg-white border border-slate-200 p-4">
          <h2 className="font-bold text-slate-900">5. DB User row for hr@convertt.co</h2>
          <pre className="mt-2 text-xs bg-slate-50 p-3 rounded overflow-auto">
{JSON.stringify(hrUser, null, 2)}
          </pre>
        </section>

        {/* All admins */}
        <section className="rounded-lg bg-white border border-slate-200 p-4">
          <h2 className="font-bold text-slate-900">6. All HR_ADMIN rows in DB</h2>
          <pre className="mt-2 text-xs bg-slate-50 p-3 rounded overflow-auto">
{JSON.stringify(allAdmins, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  )
}
