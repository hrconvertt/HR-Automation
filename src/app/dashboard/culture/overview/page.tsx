/**
 * Culture Overview — what we spent, what we held, what is coming.
 *
 * The three questions asked of the events programme are always the same: how
 * much has it cost, what did we actually do, and what is next. This answers
 * them in that order.
 *
 * Money is counted two ways on purpose. Estimated is what was proposed and
 * approved; actual is what the receipts said. Reporting only one hides either
 * the overspend or the fact that nobody closed the event out.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CultureHeader } from '../_components/culture-header'
import {
  CATEGORY_LABELS, STATUS_LABELS, STATUS_TONE, COST_CATEGORY_LABELS,
  type EventCategory, type EventStatus, type CostCategory,
} from '@/lib/event-presets'
import { CalendarDays, TrendingUp, Wallet, PartyPopper } from 'lucide-react'

const money = (n: number, c = 'PKR') => `${c} ${Math.round(n).toLocaleString('en-PK')}`
const day = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

export default async function CultureOverviewPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE') {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">
          Event financials are visible to HR and the executive team.
        </p>
      </div>
    )
  }

  const events = await prisma.companyEvent.findMany({
    orderBy: { eventDate: 'desc' },
    include: { costItems: true, _count: { select: { eventRoles: true } } },
  })

  // Today at UTC midnight, so "coming up" does not flip mid-afternoon.
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  const rows = events.map((e) => {
    const budget = e.costItems.reduce((n, c) => n + c.quantity * c.unitCost, 0)
    const anyActual = e.costItems.some((c) => c.actual != null)
    const actual = anyActual ? e.costItems.reduce((n, c) => n + (c.actual ?? 0), 0) : null
    return { ...e, budget, actual, upcoming: e.eventDate >= today }
  })

  const live = rows.filter((r) => r.status !== 'CANCELLED')
  const upcoming = live.filter((r) => r.upcoming).sort((a, b) => +a.eventDate - +b.eventDate)
  const past = live.filter((r) => !r.upcoming)
  const held = past.filter((r) => r.status === 'HELD')

  const totalBudget = live.reduce((n, r) => n + r.budget, 0)
  const totalActual = live.reduce((n, r) => n + (r.actual ?? 0), 0)
  const closedOut = live.filter((r) => r.actual != null)
  const committed = upcoming.reduce((n, r) => n + r.budget, 0)

  // Spend by cost category, across everything with real numbers on it.
  const byCostCategory = new Map<string, number>()
  for (const r of live) {
    for (const c of r.costItems) {
      const v = c.actual ?? c.quantity * c.unitCost
      byCostCategory.set(c.category, (byCostCategory.get(c.category) ?? 0) + v)
    }
  }
  const costCats = [...byCostCategory.entries()].sort((a, b) => b[1] - a[1])
  const costCatMax = costCats[0]?.[1] ?? 0

  // Spend by kind of event — which parts of the programme cost what.
  const byEventCategory = new Map<string, { spend: number; count: number }>()
  for (const r of live) {
    const cur = byEventCategory.get(r.category) ?? { spend: 0, count: 0 }
    byEventCategory.set(r.category, {
      spend: cur.spend + (r.actual ?? r.budget),
      count: cur.count + 1,
    })
  }
  const eventCats = [...byEventCategory.entries()].sort((a, b) => b[1].spend - a[1].spend)

  const avgPerHeldEvent = held.length
    ? held.reduce((n, r) => n + (r.actual ?? r.budget), 0) / held.length
    : 0

  return (
    <div className="space-y-5">
      <CultureHeader subtitle="Everything the events programme has cost, held and has coming." />

      {/* ── The four numbers ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          icon={<Wallet className="w-4 h-4" />}
          label="Spent"
          value={money(totalActual)}
          note={
            closedOut.length === 0
              ? 'No event has actuals recorded yet'
              : `across ${closedOut.length} closed-out event${closedOut.length === 1 ? '' : 's'}`
          }
        />
        <Stat
          icon={<TrendingUp className="w-4 h-4" />}
          label="Budgeted"
          value={money(totalBudget)}
          note={`${live.length} event${live.length === 1 ? '' : 's'} on the books`}
        />
        <Stat
          icon={<CalendarDays className="w-4 h-4" />}
          label="Committed ahead"
          value={money(committed)}
          note={`${upcoming.length} coming up`}
        />
        <Stat
          icon={<PartyPopper className="w-4 h-4" />}
          label="Held"
          value={String(held.length)}
          note={avgPerHeldEvent ? `${money(avgPerHeldEvent)} average` : 'nothing marked held yet'}
        />
      </div>

      {/* ── Coming up ─────────────────────────────────────────────── */}
      <Panel title="Coming up" count={upcoming.length}>
        {upcoming.length === 0 ? (
          <Empty>Nothing scheduled. The catalogue on the Events tab has eight to start from.</Empty>
        ) : (
          <ul className="divide-y divide-slate-50">
            {upcoming.map((e) => (
              <EventLine key={e.id} e={e} showDaysAway today={today} />
            ))}
          </ul>
        )}
      </Panel>

      {/* ── Already celebrated ────────────────────────────────────── */}
      <Panel title="Already celebrated" count={past.length}>
        {past.length === 0 ? (
          <Empty>No past events on record yet.</Empty>
        ) : (
          <ul className="divide-y divide-slate-50">
            {past.map((e) => <EventLine key={e.id} e={e} today={today} />)}
          </ul>
        )}
      </Panel>

      {/* ── Where the money goes ──────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <Panel title="Where the money goes" subtitle="Actual where known, estimate otherwise">
          {costCats.length === 0 ? (
            <Empty>No costs entered on any event yet.</Empty>
          ) : (
            <div className="space-y-2.5">
              {costCats.map(([cat, amt]) => (
                <div key={cat}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-slate-700">
                      {COST_CATEGORY_LABELS[cat as CostCategory] ?? cat}
                    </span>
                    <span className="tabular-nums text-slate-900 font-medium">{money(amt)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full bg-slate-800 rounded-full"
                      style={{ width: `${costCatMax ? (amt / costCatMax) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="By kind of event">
          {eventCats.length === 0 ? (
            <Empty>Nothing to break down yet.</Empty>
          ) : (
            <div className="w-full overflow-x-auto">
                <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="text-left font-semibold py-2">Kind</th>
                    <th className="text-right font-semibold py-2 w-20">Events</th>
                    <th className="text-right font-semibold py-2 w-32">Spend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {eventCats.map(([cat, v]) => (
                    <tr key={cat}>
                      <td className="py-2 text-slate-700">
                        {CATEGORY_LABELS[cat as EventCategory] ?? cat}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-600">{v.count}</td>
                      <td className="py-2 text-right tabular-nums text-slate-900">{money(v.spend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Stat({ icon, label, value, note }: {
  icon: React.ReactNode; label: string; value: string; note: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-bold text-slate-900 mt-1.5 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{note}</p>
    </div>
  )
}

function Panel({ title, subtitle, count, children }: {
  title: string; subtitle?: string; count?: number; children: React.ReactNode
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">
          {title}{count != null && <span className="text-slate-400 font-normal"> · {count}</span>}
        </h2>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400 text-center py-6">{children}</p>
}

function EventLine({ e, showDaysAway, today }: {
  e: {
    id: string; title: string; category: string; status: string
    eventDate: Date; location: string | null
    budget: number; actual: number | null
    _count: { eventRoles: number }
  }
  showDaysAway?: boolean
  today: Date
}) {
  const daysAway = Math.round((+e.eventDate - +today) / 86_400_000)
  const over = e.actual != null && e.actual > e.budget
  return (
    <li>
      <Link
        href={`/dashboard/culture/events/${e.id}`}
        className="flex items-start justify-between gap-4 flex-wrap py-2.5 px-1 -mx-1 rounded hover:bg-slate-50/70 transition-colors"
      >
        <div className="min-w-0">
          <p className="text-sm text-slate-900 flex items-center gap-2 flex-wrap">
            <span className="font-medium">{e.title}</span>
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
              STATUS_TONE[e.status as EventStatus] ?? STATUS_TONE.PLANNING
            }`}>
              {STATUS_LABELS[e.status as EventStatus] ?? e.status}
            </span>
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {day(e.eventDate)}
            {showDaysAway && (daysAway === 0 ? ' · today' : ` · in ${daysAway} day${daysAway === 1 ? '' : 's'}`)}
            {' · '}{CATEGORY_LABELS[e.category as EventCategory] ?? e.category}
            {e.location && ` · ${e.location}`}
            {e._count.eventRoles > 0 && ` · ${e._count.eventRoles} roles`}
          </p>
        </div>
        <div className="text-right flex-shrink-0 tabular-nums">
          <p className="text-sm text-slate-900">
            {e.actual != null
              ? money(e.actual)
              : e.budget
                ? money(e.budget)
                : <span className="text-slate-300">no budget</span>}
          </p>
          {e.actual != null && e.budget > 0 && (
            <p className={`text-[11px] ${over ? 'text-red-600' : 'text-emerald-700'}`}>
              {over ? 'over' : 'under'} by {money(Math.abs(e.actual - e.budget))}
            </p>
          )}
          {e.actual == null && e.budget > 0 && (
            <p className="text-[11px] text-slate-400">estimated</p>
          )}
        </div>
      </Link>
    </li>
  )
}
