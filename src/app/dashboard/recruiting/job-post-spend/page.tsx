/**
 * Job Post Payments — what each role cost to advertise.
 *
 * Reads the rows recorded from the LinkedIn payments sheet. There is no
 * JobPostSpend table yet, so this reads the `linkedin_job_post_spend` config
 * key; when the table exists, only the query below changes.
 *
 * Free posts are shown rather than hidden. That a role was advertised at no
 * cost is a fact about the role, and dropping those rows would make
 * cost-per-hire look better than it was.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface SpendRow {
  role: string
  platform: string
  from: string | null
  to: string | null
  currency: string
  dailyAmount: number
  paid: number | null
}

const aed = (n: number) =>
  'AED ' + n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default async function JobPostSpendPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  if (payload.role !== 'HR_ADMIN' && payload.role !== 'EXECUTIVE') {
    redirect('/dashboard/recruiting')
  }

  const cfg = await prisma.config.findUnique({
    where: { key: 'linkedin_job_post_spend' },
    select: { value: true },
  })
  let rows: SpendRow[] = []
  try { rows = cfg?.value ? JSON.parse(cfg.value) : [] } catch { rows = [] }

  // Which requisition each role belongs to, so spend can sit against a hire.
  const reqs = await prisma.jobRequisition.findMany({
    select: { title: true, status: true, vacancies: true },
  })
  const reqBy = new Map(reqs.map((r) => [r.title, r]))

  const byRole = new Map<string, { posts: number; paid: number; running: number }>()
  for (const r of rows) {
    const cur = byRole.get(r.role) ?? { posts: 0, paid: 0, running: 0 }
    cur.posts++
    if (r.paid == null) cur.running++
    else cur.paid += r.paid
    byRole.set(r.role, cur)
  }
  const roles = [...byRole.entries()].sort((a, b) => b[1].paid - a[1].paid)
  const total = roles.reduce((n, [, t]) => n + t.paid, 0)
  const paidPosts = rows.filter((r) => (r.paid ?? 0) > 0).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Job Post Payments</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          What each role cost to advertise — {rows.length} posts, {paidPosts} paid
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total spend" value={aed(total)} />
        <Stat label="Posts" value={String(rows.length)} />
        <Stat label="Paid posts" value={`${paidPosts} of ${rows.length}`} />
        <Stat label="Roles advertised" value={String(roles.length)} />
      </div>

      {/* By role — the number anyone actually asks for. */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">By role</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <Th>Role</Th><Th right>Posts</Th><Th right>Spend</Th>
                <Th right>Per vacancy</Th><Th>Requisition</Th>
              </tr>
            </thead>
            <tbody>
              {roles.map(([role, t]) => {
                const req = reqBy.get(role)
                const vac = req?.vacancies ?? 1
                return (
                  <tr key={role} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 text-slate-900">{role}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                      {t.posts}{t.running ? <span className="text-amber-700"> +{t.running} running</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-900 tabular-nums whitespace-nowrap">
                      {t.paid ? aed(t.paid) : <span className="text-slate-400">Free</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums whitespace-nowrap">
                      {t.paid ? aed(t.paid / vac) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {req ? `${req.status} · ${vac} vacanc${vac === 1 ? 'y' : 'ies'}` : 'no requisition'}
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-2.5 text-slate-900">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{rows.length}</td>
                <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{aed(total)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Every post, in order, so a total can be checked rather than trusted. */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Every post</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <Th>Role</Th><Th>Platform</Th><Th>Start</Th><Th>End</Th>
                <Th right>Daily</Th><Th right>Paid</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-2 text-slate-900">{r.role}</td>
                  <td className="px-4 py-2 text-slate-600 text-xs">{r.platform}</td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{day(r.from)}</td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{day(r.to)}</td>
                  <td className="px-4 py-2 text-right text-slate-600 tabular-nums whitespace-nowrap">
                    {r.dailyAmount ? aed(r.dailyAmount) : <span className="text-slate-400">Free</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                    {r.paid == null
                      ? <span className="text-amber-700 text-xs">still running</span>
                      : r.paid ? aed(r.paid) : <span className="text-slate-400">Free</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        Per vacancy divides the role&apos;s spend by the headcount on its requisition — it is
        advertising cost, not cost-per-hire, which would also need agency and referral spend.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}
