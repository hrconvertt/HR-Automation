/**
 * The Recruiting Analytics panels, as they appeared on their own page — the
 * scorecard, pipeline health, advertising, and the note on stage timings.
 *
 * They now render inside the dashboard (see dashboard-view), each placed next
 * to the part of hiring it measures. The markup is the same; only where each
 * panel sits has changed.
 */
import { Card } from '@/components/ui/card'
import {
  Activity, AlertTriangle, BanknoteIcon, FileText, Timer, TrendingUp, Users,
} from 'lucide-react'
import type { RecruitingAnalytics } from '@/lib/queries/recruiting-analytics'

type Kpis = RecruitingAnalytics['kpis']
type Health = RecruitingAnalytics['health']
type Spend = RecruitingAnalytics['spend']

export function AnalyticsKpis({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi
        label="Time-to-Fill"
        value={kpis.avgTtfDays != null ? `${kpis.avgTtfDays.toFixed(0)}d` : '—'}
        sub={kpis.ttfLabel}
        sample={`${kpis.filledSample} filled ${kpis.filledSample === 1 ? 'role' : 'roles'}`}
        Icon={Timer}
      />
      <Kpi
        label="Offer Acceptance"
        value={kpis.offerAcceptPct != null ? `${kpis.offerAcceptPct.toFixed(0)}%` : '—'}
        sub={kpis.offerLabel}
        sample={`${kpis.offerSample} closed ${kpis.offerSample === 1 ? 'offer' : 'offers'}`}
        Icon={FileText}
      />
      <Kpi
        label="Pipeline Velocity"
        value={kpis.worstStage ?? '—'}
        sub={kpis.velocityLabel}
        sample={`${kpis.activeSample} active ${kpis.activeSample === 1 ? 'candidate' : 'candidates'}`}
        Icon={Activity}
      />
      <Kpi
        label="Source Quality"
        value={kpis.best?.source ?? '—'}
        sub={kpis.sourceLabel}
        sample={`${kpis.scoredSample} scored`}
        Icon={TrendingUp}
      />
    </div>
  )
}

export function PipelineHealthCard({ health }: { health: Health }) {
  return (
    <Card className="rounded-xl border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Pipeline Health</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Tile
          label="Stuck Candidates"
          value={String(health.stuck)}
          sub="No movement in over 7 days"
          Icon={AlertTriangle}
          alarm={health.stuck > 0}
        />
        <Tile
          label="Avg Screening"
          value={health.avgScreenDays != null ? `${health.avgScreenDays.toFixed(1)}d` : '—'}
          sub={`Across ${health.screeningSample} in screening`}
          Icon={Timer}
        />
        <Tile
          label="Avg Time to Hire"
          value={health.avgTimeToHireDays != null ? `${health.avgTimeToHireDays.toFixed(1)}d` : '—'}
          sub={`Applied → hired, last ${health.hiredSample}`}
          Icon={TrendingUp}
        />
      </div>
    </Card>
  )
}

export function AdvertisingCard({ spend, kpis }: { spend: Spend; kpis: Kpis }) {
  return (
    <Card className="rounded-xl border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <BanknoteIcon className="w-4 h-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Advertising</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Tile label="Spend" value={spend.line} sub={`${spend.posts} posts across ${spend.roles} roles`} Icon={BanknoteIcon} />
        <Tile label="Live posts" value={String(spend.running)} sub="Still running" Icon={Activity} />
        <Tile
          label="Sources scored"
          value={String(kpis.sources.length)}
          sub={kpis.sources.length ? kpis.sources.map((s) => `${s.source} ${s.avg.toFixed(0)}`).join(' · ') : 'None yet'}
          Icon={Users}
        />
      </div>
    </Card>
  )
}

export function StageTimingNote() {
  return (
    <p className="text-[11px] text-slate-400">
      Stage timings are measured from a candidate&apos;s last update, not from stage history,
      which the system does not keep yet — so they read as &ldquo;how long since anything
      happened&rdquo; rather than exact time in stage.
    </p>
  )
}

function Kpi({ label, value, sub, sample, Icon }: {
  label: string; value: string; sub: string; sample: string
  Icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-lg font-bold text-slate-900 mt-1.5 tabular-nums truncate">{value}</p>
          <p className="text-[11px] text-slate-500 mt-1">{sub}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">from {sample}</p>
        </div>
        <div className="p-2 rounded-lg bg-slate-50 text-slate-700 flex-shrink-0 ml-2">
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value, sub, Icon, alarm }: {
  label: string; value: string; sub: string
  Icon: React.ComponentType<{ className?: string }>; alarm?: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">{label}</p>
        <Icon className={`w-4 h-4 ${alarm ? 'text-slate-600' : 'text-slate-300'}`} />
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums truncate">{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>
    </div>
  )
}
