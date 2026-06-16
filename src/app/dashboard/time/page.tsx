/**
 * Unified "Time & Attendance" page.
 *
 * Single sidebar entry → role-routed view → outer tabs:
 *   My Time          — personal clock-in / calendar
 *   My Leave         — leave application + history
 *   Attendance Grid  — company-wide / team grid (HR / Manager / Lead / Executive)
 *   Approvals        — pending leave + OT inbox (HR / Manager / Lead)
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
  // HR / Exec / Manager / Lead land on the team view by default — that's the
  // page they need 95% of the time (who is clocked in, who's late, who's on
  // leave). They can switch to My Time if they want their personal panel.
  const defaultTab =
    effectiveRole === 'HR_ADMIN' ||
    effectiveRole === 'EXECUTIVE' ||
    effectiveRole === 'MANAGER' ||
    effectiveRole === 'LEAD'
      ? 'team-time'
      : 'my-time'
  const initialTab = tab ?? defaultTab

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

  // Departments are only needed when the user can see the grid tab — fetch
  // them up-front so the client shell doesn't need a second round-trip.
  const canSeeGrid =
    effectiveRole === 'HR_ADMIN' ||
    effectiveRole === 'MANAGER' ||
    effectiveRole === 'LEAD' ||
    effectiveRole === 'EXECUTIVE'
  const departments = canSeeGrid
    ? (await prisma.department.findMany({ select: { name: true }, orderBy: { name: 'asc' } })).map(
        (d) => d.name,
      )
    : []

  return (
    <TimeShell
      role={effectiveRole}
      employeeId={user.employee?.id ?? null}
      employeeName={user.employee?.fullName ?? null}
      initialTab={initialTab}
      departments={departments}
    />
  )
}
