/**
 * Payroll › Pay Cycle Command Center.
 *
 * An additional screen, not a replacement: the existing payroll run, payslips,
 * slip register, advances and configuration pages are untouched, and every
 * action here is a link into one of them. This page reads and shows; it never
 * writes.
 *
 * HR and executives only — it is the whole company's pay on one screen.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  getCommandCenter, listCommandCenterPeriods,
} from '@/lib/queries/pay-cycle-command-center'
import { CommandCenterClient } from './_components/command-center-client'

export default async function PayCycleCommandCenterPage({ searchParams }: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const sp = await searchParams
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  const previewRole = me?.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? me?.role
  if (!['HR_ADMIN', 'EXECUTIVE'].includes(effectiveRole ?? '')) {
    return (
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">
          The Pay Cycle Command Center is HR and executive only.
        </p>
      </div>
    )
  }

  // Default to the newest period that has a run, rather than to today — in the
  // first days of a month there is nothing to command yet.
  const periods = await listCommandCenterPeriods()
  const now = new Date()
  const fallback = periods[0] ?? { month: now.getMonth() + 1, year: now.getFullYear() }

  const month = clamp(parseInt(sp.month ?? '', 10), 1, 12) ?? fallback.month
  const year = clamp(parseInt(sp.year ?? '', 10), 2000, 2100) ?? fallback.year

  const data = await getCommandCenter(month, year)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Pay Cycle Command Center</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Every step of {data.context.period}&rsquo;s pay cycle on one screen — read-only.
          Each row opens the payroll screen that does the work.
        </p>
      </div>
      <CommandCenterClient d={data} />
    </div>
  )
}

/** A query param is whatever somebody typed; null means "use the default". */
function clamp(v: number, min: number, max: number): number | null {
  return Number.isFinite(v) && v >= min && v <= max ? v : null
}
