/**
 * How hiring is actually going — the numbers behind the Recruiting dashboard's
 * scorecard, pipeline health, advertising and source panels.
 *
 * These had a page of their own (Recruiting Analytics) after they were taken
 * off the top of every recruiting view. They now sit on the dashboard beside
 * the pipeline ring and the queues, so the state of hiring and the work it is
 * waiting on read as one page. The queries are unchanged from that page.
 *
 * Every figure carries its own sample size. A time-to-fill worked from two
 * filled roles is not the same claim as one worked from twenty, and a metric
 * that hides that invites decisions it cannot support.
 */
import { prisma } from '@/lib/prisma'
import { STAGES } from '@/lib/queries/recruiting-dashboard'

const TARGET_TTF_DAYS = 30
const TARGET_OFFER_ACCEPT_PCT = 80

/** Fixed order, so a source keeps its colour as the counts move. */
export const SOURCE_ORDER = ['REFERRAL', 'LINKEDIN', 'PORTAL', 'CAREERS_PAGE', 'WALK_IN', 'OTHER']

export interface SourceMixData {
  /** Total candidates per source, whatever stage they reached. */
  bySource: { key: string; count: number }[]
  /** Per stage, the count from each source. */
  byStage: { key: string; label: string; total: number; bySource: Record<string, number> }[]
  total: number
}

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

/**
 * Candidates by the channel they came through, and the same cut by stage.
 *
 * A candidate with no source recorded is counted as OTHER rather than dropped:
 * leaving them out would quietly shrink the totals the percentages divide.
 */
async function getSourceMix(): Promise<SourceMixData> {
  const rows = await prisma.candidate.findMany({ select: { source: true, stage: true } })
  const norm = (s: string | null) => {
    const key = (s ?? '').toUpperCase()
    return SOURCE_ORDER.includes(key) ? key : 'OTHER'
  }

  const bySourceCount = new Map<string, number>()
  const byStageCount = new Map<string, Record<string, number>>()
  for (const r of rows) {
    const src = norm(r.source)
    bySourceCount.set(src, (bySourceCount.get(src) ?? 0) + 1)
    const stage = byStageCount.get(r.stage) ?? {}
    stage[src] = (stage[src] ?? 0) + 1
    byStageCount.set(r.stage, stage)
  }

  return {
    total: rows.length,
    bySource: SOURCE_ORDER.map((key) => ({ key, count: bySourceCount.get(key) ?? 0 })),
    byStage: STAGES.map((st) => {
      const counts = byStageCount.get(st.key) ?? {}
      return {
        key: st.key,
        label: st.label,
        total: Object.values(counts).reduce((a, b) => a + b, 0),
        bySource: counts,
      }
    }),
  }
}

export async function recruitingAnalytics() {
  const [kpis, health, spend, sourceMix] = await Promise.all([
    getRecruitingKpis(), getPipelineHealth(), getSpend(), getSourceMix(),
  ])
  return { kpis, health, spend, sourceMix }
}

export type RecruitingAnalytics = Awaited<ReturnType<typeof recruitingAnalytics>>
