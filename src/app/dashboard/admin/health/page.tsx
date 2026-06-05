import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runHealthScan } from '@/lib/self-heal'
import { HealthPanel } from '@/components/admin/health-panel'
import { MonthlyRevenueCard } from '@/components/admin/monthly-revenue-card'

/**
 * /dashboard/admin/health — System Health page.
 *
 *   Server-renders the initial scan, then a client component lets HR
 *   re-scan and trigger individual auto-fixes.
 *   HR_ADMIN only.
 */
export const dynamic = 'force-dynamic'

export default async function HealthPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
  if (!payload) redirect('/login')

  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me || me.role !== 'HR_ADMIN') redirect('/dashboard')

  const initialReport = await runHealthScan()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">System Health</h1>
        <p className="text-sm text-slate-500 mt-1">
          Self-healing reconciler. Scans for common data drift and offers one-click fixes for the safe ones.
        </p>
      </div>
      <HealthPanel initial={initialReport} />

      {/* Inputs that the Executive dashboard depends on. */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mt-3 mb-2">Executive Inputs</h2>
        <MonthlyRevenueCard />
      </div>
    </div>
  )
}
