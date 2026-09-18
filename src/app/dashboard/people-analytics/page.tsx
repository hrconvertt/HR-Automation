/**
 * People Analytics — Overview.
 *
 * The HR version of an executive dashboard: headcount and where it is going,
 * what the workforce costs, who is choosing to leave, and what is overdue.
 * HR and the executive team only; the figures are company-wide.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { talentViewer, seesEveryone } from '@/lib/talent'
import { memoKpi } from '@/lib/kpi-cache'
import { computePeopleOverview, type MonthPoint } from '@/lib/people-analytics'
import { ArrowRight } from 'lucide-react'

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`
const pkrShort = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : String(Math.round(n))

export default async function PeopleAnalyticsPage() {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (!seesEveryone(viewer)) {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">People Analytics is visible to HR and the executive team.</p>
      </div>
    )
  }

  const o = await memoKpi('people-analytics:overview', 60_000, computePeopleOverview)
  const attritionDelta = o.voluntaryAttritionPct != null && o.priorVoluntaryAttritionPct != null
    ? o.voluntaryAttritionPct - o.priorVoluntaryAttritionPct : null
  const maxDeptBill = Math.max(1, ...o.departments.map((d) => d.salaryBillPkr))
  const payrollMonths = o.payrollTrend.filter((p) => p.value != null).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">People Analytics</h1>
        <p className="text-sm text-slate-500 mt-1">
          Overview · company-wide, as of{' '}
          {o.asOf.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          label="Headcount"
          value={String(o.headcount)}
          sub={`${o.joined12mo} joined · ${o.left12mo} left in the last 12 months`}
        />
        <Tile
          label="Planned headcount"
          value={String(o.headcount + o.openRoles)}
          sub={o.openRoles === 0 ? 'No open roles' : `${o.headcount} on board + ${o.openRoles} open ${o.openRoles === 1 ? 'role' : 'roles'}`}
        />
        <Tile
          label="Voluntary attrition · 12 months"
          value={o.voluntaryAttritionPct != null ? `${o.voluntaryAttritionPct.toFixed(1)}%` : '—'}
          sub={attritionDelta != null
            ? `${o.voluntaryLeavers12mo} resigned · ${attritionDelta >= 0 ? 'up' : 'down'} ${Math.abs(attritionDelta).toFixed(1)} pts on the year before`
            : `${o.voluntaryLeavers12mo} resigned · no earlier year to compare`}
        />
        <Tile
          label="Monthly salary bill"
          value={pkr(o.monthlySalaryBillPkr)}
          sub={[
            o.peopleOnPkrSalary > 0 ? `${pkr(o.monthlySalaryBillPkr / o.peopleOnPkrSalary)} per person` : null,
            o.peopleOnAedSalary > 0 ? `plus AED ${Math.round(o.aedSalaryBill).toLocaleString('en-PK')} for ${o.peopleOnAedSalary}` : null,
            o.peopleWithoutSalary > 0 ? `${o.peopleWithoutSalary} with no salary on file` : null,
          ].filter(Boolean).join(' · ') || 'No salaries on file'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Headcount, last 12 months" note="People on the books at each month-end">
          <Columns points={o.headcountTrend} format={(v) => String(v)} />
        </Panel>
        <Panel
          title="Gross payroll, last 12 months"
          note={payrollMonths === 0 ? 'No payroll has gone past draft in this period' : 'Every run past draft, bonuses and arrears included'}
        >
          <Columns points={o.payrollTrend} format={pkrShort} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Salary bill by department" note="Current monthly gross, PKR salaries">
          {o.departments.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No one on the books yet.</p>
          ) : (
            <div className="space-y-2">
              {o.departments.map((d) => (
                <div key={d.name} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-xs">
                  <span className="text-slate-700 truncate" title={d.name}>{d.name}</span>
                  <div className="h-2.5 rounded-sm bg-slate-100 overflow-hidden">
                    <div className="h-full bg-slate-700 rounded-sm" style={{ width: `${(d.salaryBillPkr / maxDeptBill) * 100}%` }} />
                  </div>
                  <span className="text-slate-600 tabular-nums whitespace-nowrap">
                    {pkrShort(d.salaryBillPkr)} · {d.headcount} {d.headcount === 1 ? 'person' : 'people'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Needs attention" note="Open items across HR right now">
          <ul className="divide-y divide-slate-100">
            {o.attention.map((a) => (
              <li key={a.key} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className={`text-lg font-bold tabular-nums w-8 text-right ${a.count > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                    {a.count}
                  </span>
                  <span className="text-sm text-slate-700 truncate">{a.label}</span>
                </div>
                {a.count > 0 && (
                  <Link href={a.href} className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:underline whitespace-nowrap">
                    {a.action} <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1.5 tabular-nums text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500 mt-1.5">{sub}</p>
    </div>
  )
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">{note}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

/** Twelve monthly columns, each labelled with its value. A month with no data shows a dash. */
function Columns({ points, format }: { points: MonthPoint[]; format: (v: number) => string }) {
  const max = Math.max(1, ...points.map((p) => p.value ?? 0))
  return (
    <div className="grid grid-cols-12 gap-1.5 items-end h-44">
      {points.map((p, i) => (
        <div key={`${p.year}-${p.month}`} className="flex flex-col items-center justify-end h-full min-w-0">
          <span className="text-[10px] text-slate-600 tabular-nums mb-1 truncate max-w-full">
            {p.value == null ? '—' : format(p.value)}
          </span>
          <div className="flex-1 w-full flex items-end">
            <div
              className={`w-full rounded-t-sm ${i === points.length - 1 ? 'bg-slate-900' : 'bg-slate-400'}`}
              style={{ height: p.value == null ? 0 : `${Math.max(2, (p.value / max) * 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500 mt-1">{p.label}</span>
        </div>
      ))}
    </div>
  )
}
