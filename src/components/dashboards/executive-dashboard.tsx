/**
 * Executive (CEO) Dashboard — strategic signals only.
 *
 * Designed to answer the questions a CEO actually asks every Monday:
 *   - Are we healthy on margin? (Cost of People % of revenue)
 *   - Is productivity scaling? (Revenue per employee)
 *   - Are we losing people we don't want to lose? (Voluntary attrition trend)
 *   - How fast can we grow? (Time-to-Hire)
 *   - Who do we need to protect? (Top-talent flight risk)
 *   - Any manager stretched too thin? (Span of control)
 *
 * Operational metrics (attendance %, raw open req count, names of
 * recent joiners/exits) deliberately moved out of this view — those
 * belong in HR Workforce.
 */
import Link from 'next/link'
import { computeExecMetrics } from '@/lib/exec-metrics'
import { PoliciesPendingReview } from '@/components/dashboards/policies-pending-review'
import { formatCurrency } from '@/lib/utils'
import {
  Users, Banknote, TrendingUp, TrendingDown, AlertTriangle,
  Clock, Heart, Layers, ArrowRight, Settings,
} from 'lucide-react'

export async function ExecutiveDashboard() {
  const m = await computeExecMetrics()

  return (
    <div className="space-y-5">
      {/* Action prompt: any policies the CEO/Co-Founder needs to review */}
      <PoliciesPendingReview />

      {/* Hero — three signal-driven KPIs that frame the rest. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <HeroCard
          label="Cost of People · % of Revenue"
          value={m.costOfPeoplePct != null ? `${m.costOfPeoplePct.toFixed(1)}%` : '—'}
          sub={m.monthlyRevenue != null
            ? `${formatCurrency(m.monthlyPayrollCost)} payroll · ${formatCurrency(m.monthlyRevenue)} revenue`
            : 'Add monthly revenue in System Health'}
          tone={m.costOfPeoplePct == null ? 'muted' : m.costOfPeoplePct > 60 ? 'red' : m.costOfPeoplePct > 45 ? 'amber' : 'green'}
          configMissing={m.costOfPeoplePct == null}
        />
        <HeroCard
          label="Revenue per Employee"
          value={m.revenuePerEmployee != null ? formatCurrency(m.revenuePerEmployee) : '—'}
          sub={m.monthlyRevenue != null ? `${m.headcount} active people` : 'Needs monthly revenue input'}
          tone={m.revenuePerEmployee == null ? 'muted' : 'green'}
          configMissing={m.revenuePerEmployee == null}
        />
        <HeroCard
          label="Voluntary Attrition · 12mo"
          value={`${m.voluntaryAttritionPct12mo.toFixed(1)}%`}
          sub={m.attritionTrendPp != null
            ? `${m.attritionTrendPp >= 0 ? '↑' : '↓'} ${Math.abs(m.attritionTrendPp).toFixed(1)} pp vs prior 12mo`
            : 'No prior period to compare'}
          tone={m.voluntaryAttritionPct12mo > 15 ? 'red' : m.voluntaryAttritionPct12mo > 8 ? 'amber' : 'green'}
        />
      </div>

      {/* Strategic signals row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <SignalCard
          Icon={Clock}
          label="Time-to-Hire"
          value={m.timeToHireMedianDays != null ? `${m.timeToHireMedianDays}d` : '—'}
          sub={m.timeToHireMedianDays != null
            ? 'median, requisition → offer accepted'
            : 'Not enough hiring data yet'}
          tone="blue"
        />
        <SignalCard
          Icon={AlertTriangle}
          label="Top-Talent Flight Risk"
          value={String(m.flightRiskCount)}
          sub={m.flightRiskNames.length > 0
            ? m.flightRiskNames.slice(0, 3).join(', ') + (m.flightRiskNames.length > 3 ? '…' : '')
            : 'Top performers with no recent comp adjustment'}
          tone={m.flightRiskCount === 0 ? 'green' : m.flightRiskCount > 3 ? 'red' : 'amber'}
        />
        <SignalCard
          Icon={Layers}
          label="Max Manager Span"
          value={String(m.maxSpanOfControl)}
          sub={m.stretchedManagers.length > 0
            ? `${m.stretchedManagers.length} stretched (>7 reports)`
            : 'All managers within healthy 1:7 ratio'}
          tone={m.maxSpanOfControl > 10 ? 'red' : m.maxSpanOfControl > 7 ? 'amber' : 'green'}
        />
      </div>

      {/* Department health heatmap */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-slate-600" />
            <p className="text-sm font-semibold text-slate-900">Department Health</p>
          </div>
          <p className="text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1 mr-3"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Healthy</span>
            <span className="inline-flex items-center gap-1 mr-3"><span className="w-2 h-2 rounded-full bg-amber-500" /> Watch</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Red</span>
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3 bg-slate-50/50">
          {m.deptHealth.length === 0 ? (
            <p className="text-xs text-slate-400 col-span-full text-center py-6">No departments configured.</p>
          ) : (
            m.deptHealth.map((d) => (
              <div
                key={d.dept}
                className={`rounded-lg border p-3 ${
                  d.tone === 'red'   ? 'border-rose-200 bg-rose-50/50' :
                  d.tone === 'watch' ? 'border-amber-200 bg-amber-50/50' :
                                       'border-emerald-200 bg-emerald-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{d.dept}</p>
                  <span className={`w-2 h-2 rounded-full ${
                    d.tone === 'red'   ? 'bg-rose-500' :
                    d.tone === 'watch' ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} />
                </div>
                <div className="flex items-baseline gap-3 mt-1.5 text-xs text-slate-600">
                  <span><span className="font-bold text-slate-900 tabular-nums">{d.headcount}</span> people</span>
                  {d.attrition12mo > 0 && (
                    <span><span className="font-bold text-slate-900 tabular-nums">{d.attrition12mo}%</span> attrition</span>
                  )}
                  {d.openRoles > 0 && (
                    <span><span className="font-bold text-slate-900 tabular-nums">{d.openRoles}</span> open</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Drill-down links */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <p className="text-slate-500">
          Operational details (attendance, individual exits, named hires) live in{' '}
          <Link href="/dashboard/employees" className="text-blue-600 hover:underline">Workforce</Link>.
        </p>
        {(m.monthlyRevenue == null) && (
          <Link href="/dashboard/admin/health" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
            <Settings className="w-3 h-3" /> Configure monthly revenue
          </Link>
        )}
      </div>
    </div>
  )
}

function HeroCard({ label, value, sub, tone, configMissing }: {
  label: string; value: string; sub: string;
  tone: 'green' | 'amber' | 'red' | 'muted';
  configMissing?: boolean
}) {
  const VALUE_TONE: Record<string, string> = {
    green: 'text-slate-900',
    amber: 'text-amber-700',
    red:   'text-rose-700',
    muted: 'text-slate-400',
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1.5 tabular-nums ${VALUE_TONE[tone]}`}>{value}</p>
      <p className={`text-[11px] mt-1.5 ${configMissing ? 'text-amber-700' : 'text-slate-500'}`}>
        {sub}
      </p>
    </div>
  )
}

function SignalCard({ Icon, label, value, sub, tone }: {
  Icon: React.ComponentType<{ className?: string }>
  label: string; value: string; sub: string
  tone: 'green' | 'amber' | 'red' | 'blue'
}) {
  const VALUE_TONE: Record<string, string> = {
    green: 'text-emerald-700',
    amber: 'text-amber-700',
    red:   'text-rose-700',
    blue:  'text-blue-700',
  }
  const ICON_BG: Record<string, string> = {
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red:   'bg-rose-50 text-rose-600',
    blue:  'bg-blue-50 text-blue-600',
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className={`text-xl font-bold mt-1.5 tabular-nums ${VALUE_TONE[tone]}`}>{value}</p>
          <p className="text-[11px] text-slate-500 mt-1.5 truncate">{sub}</p>
        </div>
        <div className={`p-2 rounded-lg ${ICON_BG[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  )
}
