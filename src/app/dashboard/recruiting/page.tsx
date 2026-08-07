import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import { RequestToHireButton } from '@/components/recruiting/request-to-hire-button'
import { DecideRequestButtons } from '@/components/recruiting/decide-request-buttons'
import { AddCandidateButton } from '@/components/recruiting/add-candidate-button'
import { CandidateCard } from '@/components/recruiting/candidate-card'
import { RequisitionStatusMenu } from '@/components/recruiting/requisition-status-menu'
import { JdReviewButton } from '@/components/recruiting/jd-review-button'
import { InterviewFeedbackButton } from '@/components/recruiting/interview-feedback-button'
import { TalentPoolView } from '@/components/recruiting/talent-pool-view'
import { KnockoutEditorButton } from '@/components/recruiting/knockout-editor-button'
import { KnockoutOverrideButton } from '@/components/recruiting/knockout-override-button'
import { BulkPipelineActions } from '@/components/recruiting/bulk-pipeline-actions'
import { BulkJDUpload } from '@/components/recruiting/bulk-jd-upload'
import { BulkResumeUpload } from '@/components/recruiting/bulk-resume-upload'

const AVATAR_PALETTE = [
  'bg-slate-100 text-slate-700', 'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700', 'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700', 'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700', 'bg-slate-100 text-slate-700',
]
function avatarTone(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

const PIPELINE_STAGES = [
  { key: 'APPLIED',    label: 'Applied',    tone: 'bg-slate-50  border-slate-200' },
  { key: 'SCREENING',  label: 'Screening',  tone: 'bg-slate-50/40 border-slate-100' },
  { key: 'INTERVIEW',  label: 'Interview',  tone: 'bg-slate-50/40 border-slate-100' },
  { key: 'OFFER',      label: 'Offer',      tone: 'bg-slate-50/40 border-slate-100' },
  { key: 'HIRED',      label: 'Hired',      tone: 'bg-slate-50/40 border-slate-100' },
  { key: 'REJECTED',   label: 'Rejected',   tone: 'bg-slate-50/40 border-slate-100' },
]

// Offers used to be fetched here for the acceptance-rate KPI. That card is
// gone and the Offers screen loads its own, so the query went with it.
async function getData() {
  const [requisitions, candidates, interviews, poolCandidates] = await Promise.all([
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
    prisma.candidate.findMany({
      where: { inTalentPool: true },
      orderBy: [{ matchScore: 'desc' }, { poolAddedAt: 'desc' }],
      include: { requisition: { select: { title: true } } },
    }),
  ])
  return { requisitions, candidates, interviews, poolCandidates }
}

async function resolveContext(): Promise<{
  role: 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'EXECUTIVE'
  myEmployeeId: string | null
}> {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = await verifyToken(tok)
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
  const { requisitions, candidates, interviews, poolCandidates } = await getData()

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

  const pendingRequests = requestsVisible.filter((r) => r.status === 'PENDING')
  // Workday-style "gate before score": kanban shows only PASSED + OVERRIDDEN.
  // FAILED knockouts live in their own tab.
  const shortlist  = candidates.filter((c) => ['PASSED', 'OVERRIDDEN'].includes(c.knockoutStatus))
  const knockedOut = candidates.filter((c) => c.knockoutStatus === 'FAILED')

  // Which view the sidebar highlights and the shell renders. Resolved on the
  // server from the URL, so no Client Component needs `useSearchParams`.
  const VIEWS = ['requests', 'requisitions', 'pipeline', 'knockouts', 'pool', 'schedule']
  const activeView =
    sp.tab && VIEWS.includes(sp.tab)
      ? sp.tab
      : sp.stage
        ? 'pipeline'
        : (isHR && pendingRequests.length > 0 ? 'requests' : 'pipeline')

  return (
    <div className="space-y-5">
      {/* Actions only. The four KPI cards and the Pipeline Health panel used to
          sit here, above every view — so Talent Pool, Knockouts, My Schedule
          and the requisition board each opened on the same block of numbers
          that had nothing to do with what was below it. Metrics belong beside
          the thing they describe, not stamped on top of everything. */}
      {(isHR || isManager) && (
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <BulkJDUpload />
          <BulkResumeUpload
            openRequisitions={requisitions
              .filter((r) => r.status === 'OPEN')
              .map((r) => ({ id: r.id, title: r.title }))}
          />
          <RequestToHireButton role={isHR ? 'HR_ADMIN' : 'MANAGER'} />
        </div>
      )}

      {/* Resolved once and shared by the sidebar and the content, so the
          highlighted entry and the rendered view can never disagree. */}
      {/* The view list moved to the app sidebar (RECRUITING_NAV) so the board
          gets the full width — it was competing with a column of its own. */}
      <Tabs className="min-w-0" value={activeView}>
        {/* View selection lives in the module sidebar (see _components/module-nav). */}

        {/* Pipeline (kanban) — shortlist only (PASSED + OVERRIDDEN).
            Failed knockouts live in the Knockouts tab. */}
        <TabsContent value="pipeline" className="mt-4">
          <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-900">{shortlist.length}</span> shortlisted candidates across {requisitions.filter((r) => r.status === 'OPEN').length} open {requisitions.filter((r) => r.status === 'OPEN').length === 1 ? 'role' : 'roles'}
                {knockedOut.length > 0 && (
                  <span className="text-slate-700 ml-2">· {knockedOut.length} filtered out</span>
                )}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {(isHR || isManager) && (
                  <BulkPipelineActions
                    // Every requisition, not just the open ones. CRO Strategist
                    // is CLOSED and still has five candidates sitting in
                    // SCREENING — a role closing does not empty its pipeline,
                    // and leaving it out of the list meant those candidates
                    // could be seen but never acted on.
                    openRequisitions={requisitions
                      .map((r) => ({
                        id: r.id,
                        title: r.status === 'OPEN' ? r.title : `${r.title} (${r.status.toLowerCase()})`,
                      }))}
                  />
                )}
                {(isHR || isManager) && (
                  <AddCandidateButton
                    openRequisitions={requisitions
                      .filter((r) => r.status === 'OPEN')
                      .map((r) => ({ id: r.id, title: r.title }))}
                  />
                )}
              </div>
            </div>
            <div className="p-4 bg-slate-50/60 overflow-x-auto">
              <div className="grid gap-3 min-w-[1100px]" style={{ gridTemplateColumns: `repeat(${PIPELINE_STAGES.length}, 1fr)` }}>
                {PIPELINE_STAGES.map((stage) => {
                  const stageCandidates = shortlist.filter((c) => c.stage === stage.key)
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

        {/* Knockouts — candidates that failed hard filters at intake.
            HR can override here; on override they get scored + move to kanban. */}
        {(isHR || isManager) && (
          <TabsContent value="knockouts" className="mt-4">
            <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-900">{knockedOut.length}</span> candidate{knockedOut.length === 1 ? '' : 's'} filtered out by knockout criteria
                </p>
              </div>
              <div className="p-4 space-y-2 bg-slate-50/60">
                {knockedOut.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-10">
                    No knockouts yet. Set up knockout filters on a requisition&apos;s row to start filtering.
                  </p>
                ) : (
                  knockedOut.map((c) => {
                    let reasons: Array<{ type: string; reason: string }> = []
                    if (c.knockoutReasons) {
                      try {
                        const parsed = JSON.parse(c.knockoutReasons)
                        if (Array.isArray(parsed)) reasons = parsed
                      } catch { /* ignore */ }
                    }
                    return (
                      <div key={c.id} className="rounded-lg border border-slate-100 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 text-sm">{c.fullName}</p>
                            <p className="text-[11px] text-slate-500">{c.requisition.title}</p>
                            {reasons.length > 0 && (
                              <ul className="mt-1.5 space-y-0.5">
                                {reasons.map((r, i) => (
                                  <li key={i} className="text-[11px] text-slate-700">· {r.reason}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                          {isHR && (
                            <KnockoutOverrideButton candidateId={c.id} candidateName={c.fullName} />
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </Card>
          </TabsContent>
        )}

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
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <JdReviewButton requisitionId={r.id} title={r.title} jdStatus={r.jdStatus} />
                                <KnockoutEditorButton requisitionId={r.id} title={r.title} jdContent={r.jdContent} />
                              </div>
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
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">€œ{r.requestNote}€</p>
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
                            <p className="text-[11px] text-slate-700 mt-0.5 line-clamp-2">€œ{r.decisionNote}€</p>
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
