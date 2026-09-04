/**
 * Job Post Payments — what each role cost to advertise.
 *
 * Reads JobPosting rows. A row appears here on its own the moment a JD is
 * approved and published; HR corrects it from the Edit button when the advert
 * actually went up somewhere else, or was billed in another currency, or the
 * final amount only landed later.
 *
 * Free posts are shown rather than hidden. That a role was advertised at no
 * cost is a fact about the role, and dropping those rows would make
 * cost-per-hire look better than it was.
 *
 * Blank is not zero. A missing amount reads "not set"; a real zero reads
 * "Free". Conflating them would quietly turn unknowns into savings.
 */

import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PLATFORM_LABELS, postingStamp, postingInputValue } from '@/lib/job-posting'
import { PostingEditButton } from '@/components/recruiting/posting-edit-button'
import { SpendViewSelect } from './_components/view-select'
import { AddPostingButton } from '@/components/recruiting/add-posting-button'

const money = (n: number, currency: string) =>
  `${currency} ` + n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Day on top, time under it — and no time at all when none was recorded. */
function Stamp({ at }: { at: Date | null }) {
  const { date, time } = postingStamp(at)
  return (
    <>
      <span className="whitespace-nowrap">{date}</span>
      {time && <span className="block text-[11px] text-slate-400 tabular-nums">{time}</span>}
    </>
  )
}

export default async function JobPostSpendPage({ searchParams }: {
  searchParams: Promise<{ view?: string }>
}) {
  // One table, two ways of reading it. By role answers what a hire cost; by
  // post lets a total be checked. Showing both at once made the page a scroll
  // with the same numbers twice.
  const view = ((await searchParams).view === 'post' ? 'post' : 'role') as 'role' | 'post'
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  if (payload.role !== 'HR_ADMIN' && payload.role !== 'EXECUTIVE') {
    redirect('/dashboard/recruiting')
  }
  const canEdit = payload.role === 'HR_ADMIN'

  // Every requisition can be advertised again, closed ones included — a role
  // going quiet does not stop the last advert being billed.
  const requisitionOptions = await prisma.jobRequisition.findMany({
    where: { status: { notIn: ['PENDING', 'REJECTED'] } },
    select: { id: true, title: true, status: true },
    orderBy: { createdAt: 'desc' },
  })

  const postings = await prisma.jobPosting.findMany({
    orderBy: [{ postedAt: 'asc' }, { createdAt: 'asc' }],
    include: {
      requisition: { select: { title: true, status: true, vacancies: true } },
    },
  })

  // Totals are kept per currency. Adding AED to PKR would produce a number
  // that means nothing, and the edit dialog allows either.
  const totals = new Map<string, number>()
  for (const p of postings) {
    if (p.cost == null) continue
    totals.set(p.currency, (totals.get(p.currency) ?? 0) + p.cost)
  }
  const totalLine = totals.size === 0
    ? '—'
    : [...totals].map(([c, n]) => money(n, c)).join(' · ')

  const byRole = new Map<string, {
    posts: number; running: number; unpriced: number; vacancies: number; status: string
    paid: Map<string, number>
  }>()
  for (const p of postings) {
    const role = p.requisition.title
    const cur = byRole.get(role) ?? {
      posts: 0, running: 0, unpriced: 0,
      vacancies: p.requisition.vacancies, status: p.requisition.status,
      paid: new Map<string, number>(),
    }
    cur.posts++
    // "Running" means the post is still up — closedAt is the only field that
    // says so. It used to be inferred from a null cost, which counts a closed
    // free post as live: QA Engineer read "6 +1 running" with all six closed.
    if (p.closedAt == null) cur.running++
    if (p.cost == null) cur.unpriced++
    else cur.paid.set(p.currency, (cur.paid.get(p.currency) ?? 0) + p.cost)
    byRole.set(role, cur)
  }
  const roles = [...byRole.entries()].sort(
    (a, b) => sum(b[1].paid) - sum(a[1].paid),
  )
  const paidPosts = postings.filter((p) => (p.cost ?? 0) > 0).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Job Post Payments</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          What each role cost to advertise — {postings.length} posts, {paidPosts} paid
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total spend" value={totalLine} />
        <Stat label="Posts" value={String(postings.length)} />
        <Stat label="Paid posts" value={`${paidPosts} of ${postings.length}`} />
        <Stat label="Roles advertised" value={String(roles.length)} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-900 mr-2">Spend</h2>
          <SpendViewSelect view={view} />
          {canEdit && (
            <div className="ml-auto">
              <AddPostingButton roles={requisitionOptions} />
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          {postings.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-12">
              No job posts yet. Publishing a job description opens its first row here.
            </p>
          ) : view === 'role' ? (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <Th>Role</Th><Th right>Posts</Th><Th right>Spend</Th>
                  <Th right>Per vacancy</Th><Th>Requisition</Th>
                </tr>
              </thead>
              <tbody>
                {roles.map(([role, t]) => {
                  const vac = t.vacancies || 1
                  return (
                    <tr key={role} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 text-slate-900">{role}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                        {t.posts}
                        {t.running ? <span className="text-amber-700"> · {t.running} still up</span> : null}
                        {t.unpriced ? <span className="text-slate-400"> · {t.unpriced} cost not recorded</span> : null}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-900 tabular-nums whitespace-nowrap">
                        {sum(t.paid) ? [...t.paid].map(([c, n]) => money(n, c)).join(' · ') : <span className="text-slate-400">Free</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums whitespace-nowrap">
                        {sum(t.paid)
                          ? [...t.paid].map(([c, n]) => money(n / vac, c)).join(' · ')
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">
                        {t.status} · {vac} vacanc{vac === 1 ? 'y' : 'ies'}
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-4 py-2.5 text-slate-900">Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{postings.length}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{totalLine}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <Th>Role</Th><Th>Platform</Th><Th>Posted</Th><Th>Closed</Th>
                  <Th right>Budget</Th><Th right>Paid</Th><Th>Status</Th>
                  {canEdit && <Th></Th>}
                </tr>
              </thead>
              <tbody>
                {postings.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-2 text-slate-900">{p.requisition.title}</td>
                    <td className="px-4 py-2 text-slate-600 text-xs">{PLATFORM_LABELS[p.platform] ?? p.platform}</td>
                    <td className="px-4 py-2 text-slate-600"><Stamp at={p.postedAt} /></td>
                    <td className="px-4 py-2 text-slate-600"><Stamp at={p.closedAt} /></td>
                    <td className="px-4 py-2 text-right text-slate-600 tabular-nums whitespace-nowrap">
                      <Amount value={p.budget} currency={p.currency} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                      {p.cost == null && p.status === 'ACTIVE'
                        ? <span className="text-amber-700 text-xs">still running</span>
                        : <Amount value={p.cost} currency={p.currency} />}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2 text-right">
                        <PostingEditButton
                          posting={{
                            id: p.id,
                            role: p.requisition.title,
                            platform: p.platform,
                            currency: p.currency,
                            budget: p.budget,
                            cost: p.cost,
                            postedAt: postingInputValue(p.postedAt),
                            closedAt: postingInputValue(p.closedAt),
                            status: p.status,
                            notes: p.notes,
                          }}
                        />
                      </td>
                    )}
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td colSpan={5} className="px-4 py-2.5 text-slate-900">Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{totalLine}</td>
                  <td colSpan={canEdit ? 2 : 1} />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        A post opens here when its job description is published, and closes when the role is
        filled or closed. Budget is per day on LinkedIn. Per vacancy divides the role&apos;s spend
        by the headcount on its requisition — advertising cost, not cost-per-hire, which would
        also need agency and referral spend.
      </p>
    </div>
  )
}

function sum(m: Map<string, number>): number {
  let n = 0
  for (const v of m.values()) n += v
  return n
}

/** Free and unknown are different facts, and read differently. */
function Amount({ value, currency }: { value: number | null; currency: string }) {
  if (value == null) return <span className="text-slate-400">not set</span>
  if (value === 0) return <span className="text-slate-400">Free</span>
  return <>{money(value, currency)}</>
}


function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
    </div>
  )
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}
