/**
 * Unified "Time & Attendance" page.
 *
 * Single sidebar entry → role-routed view → outer tabs:
 *   Today      — attendance / personal timer / team status (depending on role)
 *   Calendar   — unified attendance + leave + holiday grid (Phase 2)
 *   Leave      — existing leave views
 *   Approvals  — unified OT + leave pending inbox, Manager/HR only (Phase 3)
 *
 * The underlying Attendance + Leave modules stay intact; this is composition,
 * not a rewrite of their internals.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TimeShell } from './_components/time-shell'

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function TimePage({ searchParams }: PageProps) {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, fullName: true } } },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role

  const { tab } = await searchParams
  // Default tab is "today" for everyone; HR can deep-link to specific sub-areas.
  const initialTab = tab ?? 'today'

  if (!user.employee && effectiveRole !== 'HR_ADMIN' && effectiveRole !== 'EXECUTIVE') {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-6">
        <h2 className="text-lg font-semibold text-amber-900">Profile setup needed</h2>
        <p className="text-sm text-amber-800 mt-2">
          Your account isn&apos;t linked to an employee record. Contact HR.
        </p>
      </div>
    )
  }

  return (
    <TimeShell
      role={effectiveRole}
      employeeId={user.employee?.id ?? null}
      employeeName={user.employee?.fullName ?? null}
      initialTab={initialTab}
    />
  )
}
