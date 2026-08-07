/**
 * Recruiting Analytics.
 *
 * These metrics used to render above every recruiting view, so Talent Pool and
 * My Schedule each opened on time-to-fill and stuck-candidate numbers that had
 * nothing to do with what was below them. They are real numbers and worth
 * having — they just needed a page of their own.
 *
 * Every card states its own sample size. A time-to-fill worked from two filled
 * roles is not the same claim as one worked from twenty, and a metric that
 * hides that invites decisions it cannot support.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'
import {
  Activity, AlertTriangle, BanknoteIcon, FileText, Timer, TrendingUp, Users,
} from 'lucide-react'

const TARGET_TTF_DAYS = 30
const TARGET_OFFER_ACCEPT_PCT = 80

async function getRecruitingKpis() {
  // — Time-to-Fill: createdAt of requisition → first HIRED candidate.
  const filledReqs = await prisma.jobRequisition.findMany({
    where: { status: 'FILLED' },
    select: { createdAt: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  })
  let avgTtfDays: number | null = null
  if (filledReqs.length > 0) {
    const total = filledReqs.reduce((s, r) => s + (r.updatedAt.getTime() - r.createdAt.getTime()), 0)
    avgTtfDays = total / filledReqs.length / 86_400_000
  }
  const ttfLabel = avgTtfDays == null
    ? 'No filled roles yet'
    : avgTtfDays <= TARGET_TTF_DAYS
      ? `Faster than the ${TARGET_TTF_DAYS}-day target`
      : `${(avgTtfDays - TARGET_TTF_DAYS).toFixed(0)}d above the ${TARGET_TTF_DAYS}-day target`

  // — Offer Acceptance Rate (last 10 closed offers)
  const closedOffers = await prisma.jobOffer.findMany({
    where: { status: { in: ['ACCEPTED', 'REJECTED', 'EXPIRED'] } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { status: true },
  })
  const accepted = closedOffers.filter((o) => o.status === 'ACCEPTED').length
  const offerAcceptPct = closedOffers.length > 0 ? (accepted / closedOffers.length) * 100 : null
  const offerLabel = offerAcceptPct == null
    ? 'No closed offers yet'
    : offerAcceptPct >= TARGET_OFFER_ACCEPT_PCT
      ? `On target (≥${TARGET_OFFER_ACCEPT_PCT}%)`
      : `Below the ${TARGET_OFFER_ACCEPT_PCT}% target`

  // — Pipeline Velocity: how long candidates have been sitting in each stage.
  //   Time since the last move, not time in stage — we don't keep stage history.
  const activeCands = await prisma.candidate.findMany({
    where: { stage: { in: ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER'] } },
    select: { stage: true, updatedAt: true },
    take: 500,
  })
  const stageDays: Record<string, number[]> = { APPLIED: [], SCREENING: [], INTERVIEW: [], OFFER: [] }
  for (const c of activeCands) {
    stageDays[c.stage]?.push((Date.now() - c.updatedAt.getTime()) / 86_400_000)
  }
  let worstStage: string | null = null
  let worstAvg = 0
  for (const [stage, arr] of Object.entries(stageDays)) {
    if (arr.length === 0) continue
    const avg = arr.reduce((s, d) => s + d, 0) / arr.length
    if (avg > worstAvg) { worstAvg = avg; worstStage = stage }
  }
  const velocityLabel = worstStage
    ? `${worstStage.toLowerCase()} is slowest (${worstAvg.toFixed(1)}d avg)`
    : 'No active candidates'

  // — Source Quality: average score by where the candidate came from.
  const scoredCands = await prisma.candidate.findMany({
    where: { matchScore: { not: null }, source: { not: null } },
    select: { source: true, matchScore: true },
    take: 1000,
  })
  const bySource = new Map<string, { total: number; count: number }>()
  for (const c of scoredCands) {
    const src = c.source ?? 'Unknown'
    const agg = bySource.get(src) ?? { total: 0, count: 0 }
    agg.total += c.matchScore ?? 0
    agg.count += 1
    bySource.set(src, agg)
  }
  const sources = [...bySource.entries()]
    .map(([source, agg]) => ({ source, avg: agg.total / agg.count, count: agg.count }))
    .sort((a, b) => b.avg - a.avg)
  const best = sources.find((s) => s.count >= 2) ?? null
  const sourceLabel = best
    ? `${best.source} leads (avg ${best.avg.toFixed(0)} over ${best.count})`
    : 'Not enough scored candidates'

  return {
    avgTtfDays, ttfLabel, filledSample: filledReqs.length,
    offerAcceptPct, offerLabel, offerSample: closedOffers.length,
    worstStage, velocityLabel, activeSample: activeCands.length,
    best, sourceLabel, sources, scoredSample: scoredCands.length,
  }
}

async function getPipelineHealth() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000)

  const stuck = await prisma.candidate.count({
    where: { updatedAt: { lt: sevenDaysAgo }, stage: { notIn: ['HIRED', 'REJECTED'] } },
  })

  const screening = await prisma.candidate.findMany({
    where: { stage: 'SCREENING' },
    select: { createdAt: true, updatedAt: true },
    take: 200,
  })
  let avgScreenDays: number | null = null
  if (screening.length > 0) {
    const total = screening.reduce((s, c) => s + (c.updatedAt.getTime() - c.createdAt.getTime()), 0)
    avgScreenDays = total / screening.length / 86_400_000
  }

  const hired = await prisma.candidate.findMany({
    where: { stage: 'HIRED' },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: { createdAt: true, updatedAt: true },
  })
  let avgTimeToHireDays: number | null = null
  if (hired.length > 0) {
    const total = hired.reduce((s, c) => s + (c.updatedAt.getTime() - c.createdAt.getTime()), 0)
    avgTimeToHireDays = total / hired.length / 86_400_000
  }

  return {
    stuck, avgScreenDays, avgTimeToHireDays,
    screeningSample: screening.length, hiredSample: hired.length,
  }
}

/** What advertising cost, which is the other half of source quality. */
async function getSpend() {
  const postings = await prisma.jobPosting.findMany({
    select: { cost: true, currency: true, requisitionId: true, status: true },
  })
  const byCurrency = new Map<string, number>()
  for (const p of postings) {
    if (p.cost == null) continue
    byCurrency.set(p.currency, (byCurrency.get(p.currency) ?? 0) + p.cost)
  }
  const line = byCurrency.size === 0
    ? '—'
    : [...byCurrency]
        .map(([c, n]) => `${c} ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
        .join(' · ')
  const running = postings.filter((p) => p.status === 'ACTIVE').length
  return { line, posts: postings.length, running, roles: new Set(postings.map((p) => p.requisitionId)).size }
}

export default async function RecruitingAnalyticsPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const previewRole = cookieStore.get('hr_preview_role')?.value
  const role = previewRole ?? payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE' && role !== 'MANAGER') {
    redirect('/dashboard/recruiting')
  }

  const [kpis, health, spend] = await Promise.all([
    getRecruitingKpis(), getPipelineHealth(), getSpend(),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Recruiting Analytics</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          How hiring is actually going. Each number says what it is worked from.
        </p>
      </div>

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

      <p className="text-[11px] text-slate-400">
        Stage timings are measured from a candidate&apos;s last update, not from stage history,
        which the system does not keep yet — so they read as &ldquo;how long since anything
        happened&rdquo; rather than exact time in stage.
      </p>
    </div>
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
