import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Briefcase, Users, FileText, ClipboardList, Activity, AlertTriangle, Timer, TrendingUp } from 'lucide-react'
import { RequestToHireButton } from '@/components/recruiting/request-to-hire-button'
import { DecideRequestButtons } from '@/components/recruiting/decide-request-buttons'
import { AddCandidateButton } from '@/components/recruiting/add-candidate-button'
import { CandidateCard } from '@/components/recruiting/candidate-card'
import { RequisitionStatusMenu } from '@/components/recruiting/requisition-status-menu'
import { JdReviewButton } from '@/components/recruiting/jd-review-button'
import { InterviewFeedbackButton } from '@/components/recruiting/interview-feedback-button'
import { TalentPoolView } from '@/components/recruiting/talent-pool-view'

const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700', 'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700',
  'bg-indigo-100 text-indigo-700', 'bg-teal-100 text-teal-700',
]
function avatarTone(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

const PIPELINE_STAGES = [
  { key: 'APPLIED',    label: 'Applied',    tone: 'bg-slate-50  border-slate-200' },
  { key: 'SCREENING',  label: 'Screening',  tone: 'bg-blue-50/40 border-blue-200' },
  { key: 'INTERVIEW',  label: 'Interview',  tone: 'bg-purple-50/40 border-purple-200' },
  { key: 'OFFER',      label: 'Offer',      tone: 'bg-amber-50/40 border-amber-200' },
  { key: 'HIRED',      label: 'Hired',      tone: 'bg-emerald-50/40 border-emerald-200' },
  { key: 'REJECTED',   label: 'Rejected',   tone: 'bg-rose-50/40 border-rose-200' },
]

/**
 * Workable-style top-line KPIs. Each metric carries its own interpretive
 * label so the card answers "is this good?" not just "what's the number?".
 */
async function getRecruitingKpis() {
  const TARGET_TTF_DAYS = 30
  const TARGET_OFFER_ACCEPT_PCT = 80

  // ── Time-to-Fill: createdAt of requisition → first HIRED candidate.
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
    ? 'No data yet'
    : avgTtfDays <= TARGET_TTF_DAYS
      ? `Faster than ${TARGET_TTF_DAYS}-day target`
      : `${(avgTtfDays - TARGET_TTF_DAYS).toFixed(0)}d above ${TARGET_TTF_DAYS}-day target`

  // ── Offer Acceptance Rate (last 10 closed offers)
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
      : `Below ${TARGET_OFFER_ACCEPT_PCT}% target`

  // ── Pipeline Velocity: avg days a candidate spends in each stage today.
  //    Use createdAt vs updatedAt as proxy (we don't yet track stage history).
  const activeCands = await prisma.candidate.findMany({
    where: { stage: { in: ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER'] } },
    select: { stage: true, createdAt: true, updatedAt: true },
    take: 500,
  })
  const stageDays: Record<string, number[]> = { APPLIED: [], SCREENING: [], INTERVIEW: [], OFFER: [] }
  for (const c of activeCands) {
    const days = (Date.now() - c.updatedAt.getTime()) / 86_400_000
    stageDays[c.stage]?.push(days)
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

  // ── Source Quality: avg score by source.
  const scoredCands = await prisma.candidate.findMany({
    where: { matchScore: { not: null }, source: { not: null } },
    select: { source: true, matchScore: true },
    take: 1000,
  })
  const bySource: Record<string, { total: number; count: number }> = {}
  for (const c of scoredCands) {
    const src = c.source ?? 'Unknown'
    if (!bySource[src]) bySource[src] = { total: 0, count: 0 }
    bySource[src].total += c.matchScore ?? 0
    bySource[src].count += 1
  }
  let topSource: string | null = null
  let topAvg = 0
  for (const [src, agg] of Object.entries(bySource)) {
    if (agg.count < 2) continue
    const avg = agg.total / agg.count
    if (avg > topAvg) { topAvg = avg; topSource = src }
  }
  const sourceLabel = topSource
    ? `${topSource} leads (avg ${topAvg.toFixed(0)})`
    : 'Not enough scored data'

  return {
    avgTtfDays, ttfLabel,
    offerAcceptPct, offerLabel,
    worstStage, worstAvg, velocityLabel,
    topSource, topAvg, sourceLabel,
  }
}

async function getPipelineHealth() {
  const now = Date.now()
  const sevenDaysAgo = new Date(now - 7 * 86_400_000)

  // Stuck candidates: updatedAt > 7 days ago AND not HIRED/REJECTED
  const stuck = await prisma.candidate.count({
    where: {
      updatedAt: { lt: sevenDaysAgo },
      stage: { notIn: ['HIRED', 'REJECTED'] },
    },
  })

  // Avg time in SCREENING (createdAt vs current updatedAt for SCREENING candidates)
  const screening = await prisma.candidate.findMany({
    where: { stage: 'SCREENING' },
    select: { createdAt: true, updatedAt: true },
    take: 200,
  })
  let avgScreenDays: number | null = null
  if (screening.length > 0) {
    const total = screening.reduce((sum, c) => sum + (c.updatedAt.getTime() - c.createdAt.getTime()), 0)
    avgScreenDays = total / screening.length / 86_400_000
  }

  // Avg time-to-hire from last 10 HIRED candidates (createdAt → updatedAt as proxy for HIRED transition)
  const hired = await prisma.candidate.findMany({
    where: { stage: 'HIRED' },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: { createdAt: true, updatedAt: true },
  })
  let avgTimeToHireDays: number | null = null
  if (hired.length > 0) {
    const total = hired.reduce((sum, c) => sum + (c.updatedAt.getTime() - c.createdAt.getTime()), 0)
    avgTimeToHireDays = total / hired.length / 86_400_000
  }

  return { stuck, avgScreenDays, avgTimeToHireDays, hiredSampleSize: hired.length }
}

async function getData() {
  const [requisitions, candidates, interviews, offers, poolCandidates] = await Promise.all([
    prisma.jobRequisition.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { requestedBy: { select: { fullName: true } } },
    }),
    prisma.candidate.findMany({
      // Strong matches surface first per column. Within the same score,
      // fall back to recency.
      orderBy: [{ matchScore: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: { requisition: { select: { title: true } } },
    }),
    prisma.interview.findMany({
      orderBy: { scheduledAt: 'desc' },
      take: 30,
      include: { candidate: { select: { fullName: true } } },
    }),
    prisma.jobOffer.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { candidate: { select: { fullName: true } } },
    }),
    prisma.candidate.findMany({
      where: { inTalentPool: true },
      orderBy: [{ matchScore: 'desc' }, { poolAddedAt: 'desc' }],
      include: { requisition: { select: { title: true } } },
    }),
  ])
  return { requisitions, candidates, interviews, offers, poolCandidates }
}

async function resolveContext(): Promise<{
  role: 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'EXECUTIVE'
  myEmployeeId: string | null
}> {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = tok ? verifyToken(tok) : null
  if (!payload) return { role: 'EMPLOYEE', myEmployeeId: null }
  const u = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!u) return { role: 'EMPLOYEE', myEmployeeId: null }
  const preview = u.role === 'HR_ADMIN' ? c.get('hr_preview_role')?.value : undefined
  const role = (preview ?? u.role) as 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'EXECUTIVE'
  return { role, myEmployeeId: u.employee?.id ?? null }
}

const STATUS_TONE: Record<string, 'success' | 'secondary' | 'destructive' | 'warning' | 'default'> = {
  OPEN: 'success',
  FILLED: 'default',
  CLOSED: 'secondary',
  CANCELLED: 'destructive',
  ACCEPTED: 'success',
  REJECTED: 'destructive',
  EXPIRED: 'secondary',
  PENDING: 'warning',
  PASS: 'success',
  FAIL: 'destructive',
}

export default async function RecruitingPage({ searchParams }: { searchParams?: Promise<{ tab?: string; stage?: string }> }) {
  const sp = (await searchParams) ?? {}
  const { role, myEmployeeId } = await resolveContext()
  const { requisitions, candidates, interviews, offers, poolCandidates } = await getData()
  const health = await getPipelineHealth()
  const kpis = await getRecruitingKpis()

  const isHR      = role === 'HR_ADMIN'
  const isManager = role === 'MANAGER'

  // Requests tab scoping:
  //   HR_ADMIN → sees all PENDING/REJECTED requests (decision queue)
  //   MANAGER  → sees only their own (privacy + clutter)
  //   Others   → see nothing here (the tab is hidden anyway)
  const requestsVisible = isHR
    ? requisitions
    : isManager && myEmployeeId
      ? requisitions.filter((r) => r.requestedById === myEmployeeId)
      : []

  const openCount      = requisitions.filter((r) => r.status === 'OPEN').length
  const pendingRequests = requestsVisible.filter((r) => r.status === 'PENDING')
  const activePipeline = candidates.filter((c) => !['HIRED', 'REJECTED'].includes(c.stage)).length
  const upcoming       = interviews.filter((i) => !i.result).length
  const pendingOffers  = offers.filter((o) => o.status === 'PENDING').length

  return (
    <div className="space-y-5">
      {/* Toolbar — KPIs on left, primary action on right */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-1 min-w-0">
          <Kpi
            label="Time-to-Fill"
            value={kpis.avgTtfDays != null ? `${kpis.avgTtfDays.toFixed(0)}d` : '—'}
            sub={kpis.ttfLabel}
            Icon={Timer}
            tone="bg-blue-50 text-blue-600"
          />
          <Kpi
            label="Offer Acceptance"
            value={kpis.offerAcceptPct != null ? `${kpis.offerAcceptPct.toFixed(0)}%` : '—'}
            sub={kpis.offerLabel}
            Icon={FileText}
            tone="bg-emerald-50 text-emerald-600"
          />
          <Kpi
            label="Pipeline Velocity"
            value={kpis.worstStage ? kpis.worstStage : '—'}
            sub={kpis.velocityLabel}
            Icon={Activity}
            tone="bg-purple-50 text-purple-600"
          />
          <Kpi
            label="Source Quality"
            value={kpis.topSource ?? '—'}
            sub={kpis.sourceLabel}
            Icon={TrendingUp}
            tone="bg-amber-50 text-amber-600"
          />
        </div>
        {(isHR || isManager) && (
          <div className="flex-shrink-0">
            <RequestToHireButton role={isHR ? 'HR_ADMIN' : 'MANAGER'} />
          </div>
        )}
      </div>

      {/* Pipeline Health — server-computed flow metrics */}
      {(isHR || isManager) && (
        <Card className="rounded-xl border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900">Pipeline Health</h2>
            </div>
            <p className="text-[11px] text-slate-500">Last 7 days · sample {health.hiredSampleSize}/10</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Stuck Candidates</p>
                <AlertTriangle className={`w-4 h-4 ${health.stuck > 0 ? 'text-amber-500' : 'text-slate-300'}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{health.stuck}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">No movement &gt;7 days</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Avg Screening</p>
                <Timer className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {health.avgScreenDays != null ? `${health.avgScreenDays.toFixed(1)}d` : '—'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Days in screening stage</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Avg Time to Hire</p>
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {health.avgTimeToHireDays != null ? `${health.avgTimeToHireDays.toFixed(1)}d` : '—'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Apply → hired, last 10</p>
            </div>
          </div>
        </Card>
      )}

      {/* Tabs ordered left-to-right by lifecycle:
            Requests (manager → HR) → Requisitions (the live hiring board)
            → Pipeline (candidates flowing through stages) → Interviews → Offers.
          Default tab is the earliest place that needs attention: Requests
          if HR has pending ones, otherwise Pipeline. */}
      <Tabs defaultValue={
        sp.tab && ['requests','requisitions','pipeline','pool','schedule'].includes(sp.tab)
          ? sp.tab
          : sp.stage
            ? 'pipeline'
            : (isHR && pendingRequests.length > 0 ? 'requests' : 'pipeline')
      }>
        <TabsList className="bg-white border border-slate-200 rounded-lg p-1 inline-flex">
          <TabsTrigger value="requests">
            Requests
            {pendingRequests.length > 0 && (
              <span className="ml-1.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full px-1.5 py-0.5 tabular-nums">{pendingRequests.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="requisitions">Job Requisitions</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="pool">
            Talent Pool
            {poolCandidates.length > 0 && (
              <span className="ml-1.5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded-full px-1.5 py-0.5 tabular-nums">{poolCandidates.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="schedule">My Schedule</TabsTrigger>
        </TabsList>

        {/* Pipeline (kanban) */}
        <TabsContent value="pipeline" className="mt-4">
          <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-900">{candidates.length}</span> candidates across {requisitions.filter((r) => r.status === 'OPEN').length} open {requisitions.filter((r) => r.status === 'OPEN').length === 1 ? 'role' : 'roles'}
              </p>
              {(isHR || isManager) && (
                <AddCandidateButton
                  openRequisitions={requisitions
                    .filter((r) => r.status === 'OPEN')
                    .map((r) => ({ id: r.id, title: r.title }))}
                />
              )}
            </div>
            <div className="p-4 bg-slate-50/60 overflow-x-auto">
              <div className="grid gap-3 min-w-[1100px]" style={{ gridTemplateColumns: `repeat(${PIPELINE_STAGES.length}, 1fr)` }}>
                {PIPELINE_STAGES.map((stage) => {
                  const stageCandidates = candidates.filter((c) => c.stage === stage.key)
                  return (
                    <div key={stage.key} className={`rounded-lg border ${stage.tone}`}>
                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200/50">
                        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{stage.label}</p>
                        <span className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 tabular-nums">{stageCandidates.length}</span>
                      </div>
                      <div className="p-2 space-y-2 min-h-[120px]">
                        {stageCandidates.length === 0 ? (
                          <p className="text-[11px] text-slate-400 text-center py-6">No candidates</p>
                        ) : (
                          stageCandidates.map((c) => (
                            <CandidateCard
                              key={c.id}
                              candidate={{
                                id: c.id, fullName: c.fullName, stage: c.stage,
                                matchScore: c.matchScore, scoreReason: c.scoreReason,
                                inTalentPool: c.inTalentPool,
                                requisition: c.requisition,
                              }}
                              canMove={isHR || isManager}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Requisitions — the active hiring board.
            Excludes PENDING + REJECTED (those live in the Requests tab).
            Result: each row appears in exactly one tab, no double-counting. */}
        <TabsContent value="requisitions" className="mt-4">
          {(() => {
            const liveReqs = requisitions.filter((r) => r.status !== 'PENDING' && r.status !== 'REJECTED')
            return (
              <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    <span className="font-semibold text-slate-900">{liveReqs.length}</span> {liveReqs.length === 1 ? 'requisition' : 'requisitions'} on the hiring board
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Vacancies</TableHead>
                      <TableHead>Status</TableHead>
                      {isHR && <TableHead>JD</TableHead>}
                      <TableHead>Closes</TableHead>
                      {isHR && <TableHead></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liveReqs.length === 0 ? (
                      <TableRow><TableCell colSpan={isHR ? 7 : 5} className="text-center py-10 text-slate-400 text-sm">
                        No open requisitions yet. {isHR && 'Click "New Requisition" to add one, or approve a pending request.'}
                      </TableCell></TableRow>
                    ) : (
                      liveReqs.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium text-slate-900">{r.title}</TableCell>
                          <TableCell><Badge variant="secondary">{r.type}</Badge></TableCell>
                          <TableCell className="tabular-nums">{r.vacancies}</TableCell>
                          <TableCell><Badge variant={STATUS_TONE[r.status] ?? 'secondary'}>{r.status}</Badge></TableCell>
                          {isHR && (
                            <TableCell>
                              <JdReviewButton requisitionId={r.id} title={r.title} jdStatus={r.jdStatus} />
                            </TableCell>
                          )}
                          <TableCell className="text-slate-500">{r.closingDate ? formatDate(r.closingDate) : '—'}</TableCell>
                          {isHR && (
                            <TableCell>
                              <RequisitionStatusMenu requisitionId={r.id} status={r.status} title={r.title} />
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            )
          })()}
        </TabsContent>

        {/* Requests — manager-raised, awaiting HR decision */}
        <TabsContent value="requests" className="mt-4">
          <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-xs text-slate-500">
                {isManager && <span className="text-slate-400">Your requests · </span>}
                <span className="font-semibold text-slate-900">{pendingRequests.length}</span> pending {pendingRequests.length === 1 ? 'request' : 'requests'}
                {' · '}{requestsVisible.filter((r) => r.status === 'REJECTED').length} rejected (history)
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  {!isManager && <TableHead>Requested By</TableHead>}
                  <TableHead>Reason</TableHead>
                  <TableHead>Vacancies</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  {isHR && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {requestsVisible.filter((r) => r.status === 'PENDING' || r.status === 'REJECTED').length === 0 ? (
                  <TableRow><TableCell colSpan={isHR ? 7 : isManager ? 5 : 6} className="text-center py-10 text-slate-400 text-sm">
                    {isManager ? 'No hiring requests yet. Click "Request to Hire" to submit one.' : 'No hiring requests yet.'}
                  </TableCell></TableRow>
                ) : (
                  requestsVisible
                    .filter((r) => r.status === 'PENDING' || r.status === 'REJECTED')
                    .map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium text-slate-900">
                          {r.title}
                          {r.requestNote && (
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">“{r.requestNote}”</p>
                          )}
                        </TableCell>
                        {!isManager && (
                          <TableCell className="text-slate-600 text-sm">{r.requestedBy?.fullName ?? '—'}</TableCell>
                        )}
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">{(r.requestReason ?? 'OTHER').toString().replace('_', ' ')}</Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">{r.vacancies}</TableCell>
                        <TableCell className="text-slate-500 text-sm">{formatDate(r.createdAt)}</TableCell>
                        <TableCell>
                          {r.status === 'PENDING' ? (
                            <Badge variant="warning">Pending</Badge>
                          ) : (
                            <Badge variant="destructive">Rejected</Badge>
                          )}
                          {r.status === 'REJECTED' && r.decisionNote && (
                            <p className="text-[11px] text-rose-700 mt-0.5 line-clamp-2">“{r.decisionNote}”</p>
                          )}
                        </TableCell>
                        {isHR && (
                          <TableCell>
                            {r.status === 'PENDING' && (
                              <DecideRequestButtons requisitionId={r.id} title={r.title} />
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Talent Pool — pre-vetted candidates for urgent hires */}
        <TabsContent value="pool" className="mt-4">
          <TalentPoolView
            candidates={poolCandidates.map((c) => ({
              id: c.id,
              fullName: c.fullName,
              email: c.email,
              matchScore: c.matchScore,
              experience: c.experience,
              currentCompany: c.currentCompany,
              currentRole: c.currentRole,
              source: c.source,
              poolTags: c.poolTags,
              poolReason: c.poolReason,
              poolAddedAt: c.poolAddedAt?.toISOString() ?? null,
              updatedAt: c.updatedAt.toISOString(),
              requisition: c.requisition,
            }))}
            openRequisitions={requisitions
              .filter((r) => r.status === 'OPEN')
              .map((r) => ({ id: r.id, title: r.title }))}
          />
        </TabsContent>

        {/* My Schedule — upcoming interviews this week.
            Interview + Offer management now lives inside the candidate
            detail panel (Workable-style), not as separate top-level tabs. */}
        <TabsContent value="schedule" className="mt-4">
          <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-900">
                  {interviews.filter((i) => !i.result && new Date(i.scheduledAt).getTime() >= Date.now()).length}
                </span> upcoming interviews
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Round</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const upcomingIvs = interviews
                    .filter((i) => !i.result && new Date(i.scheduledAt).getTime() >= Date.now() - 86_400_000)
                    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                  if (upcomingIvs.length === 0) {
                    return (
                      <TableRow><TableCell colSpan={5} className="text-center py-10 text-slate-400 text-sm">
                        Nothing scheduled. Use the candidate detail panel to schedule interviews.
                      </TableCell></TableRow>
                    )
                  }
                  return upcomingIvs.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-slate-700 text-sm tabular-nums">{formatDate(i.scheduledAt)}</TableCell>
                      <TableCell className="font-medium text-slate-900">{i.candidate.fullName}</TableCell>
                      <TableCell className="text-slate-500">{i.round}</TableCell>
                      <TableCell><Badge variant="secondary">{i.type}</Badge></TableCell>
                      <TableCell>
                        {(isHR || isManager) ? (
                          <InterviewFeedbackButton
                            interviewId={i.id}
                            candidateName={i.candidate.fullName}
                            round={i.round}
                            type={i.type}
                            initialFeedback={i.feedback}
                            initialRating={i.rating}
                            initialResult={i.result}
                          />
                        ) : (
                          <span className="text-slate-400 text-xs">Pending</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                })()}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Kpi({ label, value, sub, Icon, tone }: {
  label: string
  value: number | string
  sub?: string
  Icon: React.ComponentType<{ className?: string }>
  tone: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-lg font-bold text-slate-900 mt-1.5 tabular-nums truncate">{value}</p>
          {sub && <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${tone} flex-shrink-0 ml-2`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  )
}
