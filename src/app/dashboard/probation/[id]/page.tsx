'use client'

import { useEffect, useState, use } from 'react'
import { toastError } from '@/components/ui/toaster'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { ShieldCheck, Zap, AlertTriangle, CheckCircle, Clock, FileText, Activity } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'

interface ProbationRec {
  id: string
  status: string
  startDate: string
  endDate: string
  durationMonths: number
  settlingCheckInAt: string | null
  settlingFlag: string | null
  settlingNotes: string | null
  packetGeneratedAt: string | null
  packetDaysWorked: number | null
  packetDaysAbsent: number | null
  packetDaysOnLeave: number | null
  packetLateCount: number | null
  packetAvgHours: number | null
  packetGoalScore: number | null
  packetTimeScore: number | null
  packetSuggestedRec: string | null
  managerRecommendation: string | null
  managerReviewNotes: string | null
  managerSubmittedAt: string | null
  hrDecision: string | null
  hrNotes: string | null
  hrDecidedAt: string | null
  extensionMonths: number | null
  overrodeManager: boolean
  meetingScheduledFor: string | null
  outcomeEnactedAt: string | null
  confirmationLetterId: string | null
  isEarlyDecision: boolean
  earlyDecisionReason: string | null
  warningIssuedAt: string | null
  warningNotes: string | null
  warningCount: number
  salaryBumpAmount: number | null
  salaryBumpEffective: string | null
  employee: {
    id: string
    fullName: string
    employeeCode: string
    designation: string
    reportingManagerId: string | null
    department: { name: string } | null
    reportingManager: { id: string; fullName: string } | null
    documents: { id: string; name: string; url: string | null; createdAt: string }[]
  }
  reviews?: {
    id: string
    status: string
    overallAssessment: string | null
    decision: string | null
    managerSignedAt: string | null
    hrSignedAt: string | null
    updatedAt: string
    ratingQuality: number | null
    ratingPunctuality: number | null
    ratingOwnership: number | null
    ratingCommunication: number | null
    ratingAdaptability: number | null
    recommendedPct: number | null
    proposedSalary: number | null
  }[]
}

interface CurrentUser {
  role: string
  employee?: { id: string } | null
}

const ASSESSMENT_LABEL: Record<string, string> = {
  EXCEPTIONAL: 'Exceptional',
  EXCEEDS: 'Exceeds Expectations',
  SATISFACTORY: 'Satisfactory / Meets Expectations',
  NEEDS_IMPROVEMENT: 'Needs Improvement',
  UNSATISFACTORY: 'Unsatisfactory',
}

function fmt(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ProbationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [rec, setRec] = useState<ProbationRec | null>(null)
  const [me, setMe] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // The outcome email. Composed from the review by the same endpoint the
  // review form uses, so the letter and the email that carries it never drift.
  const [draft, setDraft] = useState<{ subject: string; text: string; recipient: string | null } | null>(null)
  const [mailing, setMailing] = useState(false)
  const [mailMsg, setMailMsg] = useState('')

  const [adjustOpen, setAdjustOpen] = useState(false)
  const [earlyOpen, setEarlyOpen] = useState(false)
  const [forceOpen, setForceOpen] = useState(false)

  const reload = async () => {
    const r = await fetch(`/api/probation/${id}`)
    const d = await r.json()
    if (r.ok) setRec(d.record)
    setLoading(false)
  }

  useEffect(() => {
    reload()
    fetch('/api/auth/me').then((r) => r.json()).then((d) => setMe(d.user)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function patch(body: Record<string, unknown>) {
    setBusy(true); setErr('')
    try {
      const r = await fetch(`/api/probation/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      // A crashed handler can return non-JSON (an HTML error page); parse safely
      // so this never throws and strands the button in its disabled state.
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || `Request failed (${r.status})`); return false }
      await reload()
      return true
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Network error')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function generateOutcomeEmail() {
    setMailing(true); setErr(''); setMailMsg('')
    try {
      const r = await fetch(`/api/probation/${id}/review/email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Could not build the letter.'); return }
      setDraft({ subject: d.subject, text: d.text, recipient: d.recipient })
    } finally { setMailing(false) }
  }

  async function sendOutcomeEmail() {
    if (!draft) return
    setMailing(true); setMailMsg('')
    try {
      const r = await fetch(`/api/probation/${id}/review/email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send: true, subject: draft.subject, body: draft.text }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMailMsg(d.error || 'Send failed.'); return }
      setMailMsg(d.queued ? `Queued for ${d.to} — no mail server is configured yet.` : `Sent to ${d.to}.`)
    } finally { setMailing(false) }
  }

  if (loading) return <div className="p-8 text-slate-500">Loading…</div>
  if (!rec) return <div className="p-8 text-slate-500">Not found.</div>

  const isHR = me?.role === 'HR_ADMIN'
  const isManager = me?.employee?.id === rec.employee.reportingManagerId
  const daysLeft = Math.floor((new Date(rec.endDate).getTime() - Date.now()) / 86_400_000)
  const elapsed = Math.floor((Date.now() - new Date(rec.startDate).getTime()) / 86_400_000)
  const settlingDue = elapsed >= 30 && rec.settlingCheckInAt == null && rec.durationMonths >= 2

  // The filled-in review, if there is one, and the average of whatever it rated.
  const review = rec.reviews?.[0] ?? null
  const ratedValues = review
    ? [review.ratingQuality, review.ratingPunctuality, review.ratingOwnership,
       review.ratingCommunication, review.ratingAdaptability].filter((n): n is number => typeof n === 'number')
    : []
  const reviewAvg = ratedValues.length
    ? ratedValues.reduce((a, b) => a + b, 0) / ratedValues.length
    : null

  return (
    <div className="space-y-6">
      <BackButton fallback="/dashboard/probation" />
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur flex-shrink-0">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate">{rec.employee.fullName}</h1>
            <p className="text-white/85 mt-1 text-xs md:text-sm break-words">
              {rec.employee.designation} · {rec.employee.employeeCode}
              {rec.employee.department && ` · ${rec.employee.department.name}`}
              {rec.employee.reportingManager && ` · Manager: ${rec.employee.reportingManager.fullName}`}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 bg-white/15 px-3 py-1 rounded-full">
                <Clock className="w-3.5 h-3.5" /> {fmt(rec.startDate)} → {fmt(rec.endDate)}
              </span>
              <span className="inline-flex items-center gap-1.5 bg-white/15 px-3 py-1 rounded-full">
                {daysLeft >= 0 ? `${daysLeft} days remaining` : `${Math.abs(daysLeft)} days overdue`}
              </span>
              <Badge variant="outline" className="bg-white/15 text-white border-white/30">
                {rec.status}
              </Badge>
              {rec.warningCount > 0 && (
                <span className="inline-flex items-center gap-1.5 bg-slate-500/30 px-3 py-1 rounded-full text-white">
                  <AlertTriangle className="w-3.5 h-3.5" /> {rec.warningCount} warning{rec.warningCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          {isHR && rec.status !== 'CONFIRMED' && rec.status !== 'TERMINATED' && (
            <div className="flex flex-col gap-2">
              <Button onClick={() => setAdjustOpen(true)} variant="outline" className="bg-white/10 text-white border-white/30 hover:bg-white/20">Adjust Duration</Button>
              {rec.status === 'ACTIVE' && (
                <Button onClick={() => setEarlyOpen(true)} className="bg-slate-500 hover:bg-slate-700 text-white">
                  <Zap className="w-4 h-4 mr-1" /> Early Decision
                </Button>
              )}
              {rec.status === 'UNDER_REVIEW' && rec.hrDecision == null && daysLeft < -30 && (
                <Button onClick={() => setForceOpen(true)} className="bg-slate-700 hover:bg-slate-700 text-white">
                  <AlertTriangle className="w-4 h-4 mr-1" /> HR Override: Force Enact
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {err && <div className="rounded-md bg-slate-50 border border-slate-100 p-3 text-sm text-slate-900">{err}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        <div className="space-y-5 min-w-0">

      {/* Timeline */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Timeline</h2>
        <div className="flex items-center justify-between gap-2">
          {[
            { label: 'Hire', done: true, sub: fmt(rec.startDate) },
            { label: 'Settling (Day 30)', done: !!rec.settlingCheckInAt, sub: rec.settlingCheckInAt ? fmt(rec.settlingCheckInAt) : settlingDue ? 'Due' : 'Pending' },
            { label: 'Outcome', done: !!rec.outcomeEnactedAt, sub: rec.outcomeEnactedAt ? `${rec.hrDecision} · ${fmt(rec.outcomeEnactedAt)}` : 'Pending' },
          ].map((s, i) => (
            <div key={i} className="flex-1 text-center">
              <div className={`mx-auto w-9 h-9 rounded-full flex items-center justify-center ${s.done ? 'bg-slate-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {s.done ? <CheckCircle className="w-5 h-5" /> : i + 1}
              </div>
              <p className="text-xs font-semibold text-slate-700 mt-2">{s.label}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* The employment letter on file. The probation decision is judged
          against the terms this letter set, so it belongs on the page where
          that decision is made rather than only on the profile. */}
      {rec.employee.documents?.length > 0 && (
        <Card className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Employment Letter</p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {rec.employee.documents[0].name} · uploaded {fmt(rec.employee.documents[0].createdAt)}
              </p>
            </div>
          </div>
          <a
            href={`/api/documents/${rec.employee.documents[0].id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0"
          >
            <Button size="sm" variant="outline">View</Button>
          </a>
        </Card>
      )}

      {/* Day-3 paperwork — the Employment Agreement and the NDA are signed in
          the first days on the job, well before the Day-30 check-in. Each
          document is its own row so it reads as a checklist, not two anonymous
          buttons pinned to the corner. */}
      <Card className="overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">Day-3 Documents</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Signed in the first days on the job. Both open with signature slots for Convertt and the employee.
              </p>
            </div>
          </div>
          <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border whitespace-nowrap flex-shrink-0 ${
            elapsed >= 3
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-slate-50 text-slate-600 border-slate-200'
          }`}>
            {elapsed >= 3
              ? 'Due now'
              : `Due in ${3 - elapsed} day${3 - elapsed === 1 ? '' : 's'}`}
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {[
            {
              type: 'employment_agreement',
              name: 'Employment Agreement',
              sub: 'Appointment, salary, probation, leave and conduct policies',
            },
            {
              type: 'nda',
              name: 'Non-Disclosure Agreement',
              sub: 'Confidentiality, intellectual property and non-solicitation',
            },
          ].map((doc) => (
            <div key={doc.type} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50/60 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{doc.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{doc.sub}</p>
              </div>
              <a
                href={`/api/documents/generate?type=${doc.type}&employeeId=${rec.employee.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0"
              >
                <Button variant="outline" size="sm">Open</Button>
              </a>
            </div>
          ))}
        </div>
      </Card>
      {/* Settling check-in */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">Day-30 Settling Check-in</h2>
        {rec.settlingCheckInAt ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className={
                rec.settlingFlag === 'GREEN' ? 'bg-slate-100 text-slate-900' :
                rec.settlingFlag === 'AMBER' ? 'bg-slate-100 text-slate-900' :
                'bg-slate-100 text-slate-900'
              }>{rec.settlingFlag}</Badge>
              <span className="text-xs text-slate-500">Submitted {fmt(rec.settlingCheckInAt)}</span>
            </div>
            {rec.settlingNotes && <p className="text-sm text-slate-700 bg-slate-50 rounded p-3">{rec.settlingNotes}</p>}
          </div>
        ) : (isHR || isManager) && settlingDue ? (
          <SettlingForm onSubmit={(flag, notes) => patch({ action: 'SETTLING_CHECKIN', flag, notes })} busy={busy} />
        ) : (
          <p className="text-sm text-slate-500">{settlingDue ? 'Awaiting manager check-in.' : `Due on Day 30 (in ${30 - elapsed} days).`}</p>
        )}
      </Card>

      {/* Performance review — the decision packet counts, this one judges. */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Performance Review
          </h2>
          {review ? (
            <a
              href={`/dashboard/probation/${rec.id}/review`}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 text-slate-700 text-xs px-3 py-1.5 hover:bg-slate-50"
            >
              <FileText className="w-3.5 h-3.5" />
              Open review
            </a>
          ) : daysLeft <= 10 ? (
            <a
              href={`/dashboard/probation/${rec.id}/review`}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 text-white text-xs px-3 py-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              Generate performance review
            </a>
          ) : (
            <span className="text-xs text-slate-400">
              Opens in the last 10 days — {daysLeft} to go
            </span>
          )}
        </div>

        {/* Once it is filled in, report what it says. Offering to "generate"
            a review that already exists is how the same one gets written twice. */}
        {review && (
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {reviewAvg != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                Average <strong className="tabular-nums">{reviewAvg.toFixed(1)}</strong> / 4
              </span>
            )}
            {review.overallAssessment && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                {ASSESSMENT_LABEL[review.overallAssessment] ?? review.overallAssessment}
              </span>
            )}
            {review.recommendedPct != null && review.recommendedPct > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                Increment <strong className="tabular-nums">{review.recommendedPct}%</strong>
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
              review.status === 'FINALISED'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              {review.status === 'FINALISED' ? 'Completed' : review.status === 'SUBMITTED' ? 'Submitted — awaiting HR' : 'In progress'}
            </span>
          </div>
        )}
        <p className="text-xs text-slate-500">
          Ratings across five dimensions with the evidence beside each, the overall assessment,
          and the increment it argues for under the 10–15% policy. This is what the confirmation
          or extension is decided on.
        </p>
      </Card>

      {/* The decision packet is gone. It counted attendance and goals and
          then suggested an outcome, which is not a decision anyone should make
          — it read zero absences for Zuhaa, who had taken leave, and still
          suggested CONFIRM. Counting hours cannot tell you whether the work was
          any good, and putting a recommendation next to those numbers invited
          someone to accept it.

          The performance review above replaces it: five rated dimensions with
          the evidence written beside each, an overall assessment, and the
          increment that assessment earns under the 10-15% policy. */}

      {/* Manager review */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">Manager Review</h2>
        {rec.managerSubmittedAt ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-slate-100 text-slate-900">{rec.managerRecommendation}</Badge>
              <span className="text-xs text-slate-500">Submitted {fmt(rec.managerSubmittedAt)}</span>
            </div>
            {rec.managerReviewNotes && <p className="text-sm text-slate-700 bg-slate-50 rounded p-3">{rec.managerReviewNotes}</p>}
          </div>
        ) : (isHR || isManager) && rec.status === 'UNDER_REVIEW' ? (
          <ManagerForm onSubmit={(rec, notes) => patch({ action: 'MANAGER_REVIEW', recommendation: rec, notes })} busy={busy} />
        ) : (
          <p className="text-sm text-slate-500">Awaiting packet + manager.</p>
        )}
      </Card>

      {/* HR decision */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">HR Decision</h2>
          {rec.overrodeManager && <Badge className="bg-slate-100 text-slate-900">OVERRIDE</Badge>}
        </div>
        {rec.hrDecidedAt ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-slate-100 text-slate-900">{rec.hrDecision}</Badge>
              {rec.extensionMonths && <span className="text-xs text-slate-600">+{rec.extensionMonths} month(s)</span>}
              {rec.salaryBumpAmount && <span className="text-xs text-slate-700 font-semibold">+PKR {rec.salaryBumpAmount.toLocaleString('en-PK')} bump</span>}
              <span className="text-xs text-slate-500">Decided {fmt(rec.hrDecidedAt)}</span>
            </div>
            {rec.meetingScheduledFor && !rec.outcomeEnactedAt && (
              <p className="text-xs text-slate-600">Meeting scheduled: <strong>{fmt(rec.meetingScheduledFor)}</strong></p>
            )}
            {rec.hrNotes && <p className="text-sm text-slate-700 bg-slate-50 rounded p-3 whitespace-pre-wrap">{rec.hrNotes}</p>}
            {isHR && !rec.outcomeEnactedAt && (
              <Button disabled={busy} onClick={() => patch({ action: 'ENACT' })}>Enact Now</Button>
            )}
          </div>
        ) : isHR && rec.status === 'UNDER_REVIEW' ? (
          <HRForm onSubmit={(payload) => patch({ action: 'HR_DECIDE', ...payload })} busy={busy} suggested={rec.packetSuggestedRec} managerRec={rec.managerRecommendation} />
        ) : (
          <p className="text-sm text-slate-500">Awaiting manager submission.</p>
        )}
      </Card>

      {/* Outcome */}
      {rec.outcomeEnactedAt && (
        <Card className="p-5 bg-slate-50/40 border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-2">Outcome Enacted</h2>
          <p className="text-sm text-slate-900">
            <strong>{rec.hrDecision}</strong> enacted on {fmt(rec.outcomeEnactedAt)}
            {rec.isEarlyDecision && <span className="ml-2 inline-block bg-slate-100 text-slate-900 text-xs px-2 py-0.5 rounded">EARLY DECISION</span>}
          </p>
          {rec.earlyDecisionReason && <p className="text-xs text-slate-900 mt-1">Reason: {rec.earlyDecisionReason}</p>}
          {rec.confirmationLetterId && (
            <a
              href={`/letters/${rec.confirmationLetterId}/print`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-slate-700 hover:underline mt-2"
            >
              <FileText className="w-4 h-4" /> View confirmation letter
            </a>
          )}
          <div className="mt-3">
            <Button size="sm" variant="outline" disabled={mailing} onClick={generateOutcomeEmail}>
              {mailing ? 'Working…' : 'Generate email'}
            </Button>
            <p className="text-[11px] text-slate-500 mt-1">
              The confirmation letter as an email — edit before it goes.
            </p>
          </div>
        </Card>
      )}

      {/* Draft — edited here, and what is in the box is what goes out. */}
      {draft && (
        <Dialog open onOpenChange={() => { setDraft(null); setMailMsg('') }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Confirmation letter — email</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">To</p>
                <p className="text-sm text-slate-800">{draft.recipient ?? 'No email on file'}</p>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wide text-slate-400">Subject</label>
                <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wide text-slate-400">Body</label>
                <textarea
                  className="w-full min-h-[300px] rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={draft.text}
                  onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                />
              </div>
              {mailMsg && <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-2">{mailMsg}</p>}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => navigator.clipboard?.writeText(draft.text)}>Copy</Button>
              <Button onClick={sendOutcomeEmail} disabled={mailing || !draft.recipient}>
                {mailing ? 'Sending…' : 'Send'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Warning history strip */}
      {rec.warningCount > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">Warnings ({rec.warningCount})</h2>
          {rec.warningIssuedAt && (
            <div className="border-l-2 border-slate-300 pl-3">
              <p className="text-xs text-slate-500">{fmt(rec.warningIssuedAt)}</p>
              {rec.warningNotes && <p className="text-sm text-slate-700 mt-1">{rec.warningNotes}</p>}
            </div>
          )}
        </Card>
      )}

        </div>

        {/* Activity Timeline — right sidebar (chronological audit trail) */}
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start min-w-0">
          <Card className="p-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Activity
            </h2>
            <ActivityTimeline rec={rec} canSeeManagerNotes={isHR || isManager || !!rec.outcomeEnactedAt} />
          </Card>
        </aside>
      </div>

      {/* Adjust Duration Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust Probation Duration</DialogTitle></DialogHeader>
          <AdjustDurationDialog
            current={rec.durationMonths}
            onSubmit={async (newMonths, reason) => {
              const ok = await patch({ action: 'ADJUST_DURATION', newMonths, reason })
              if (ok) setAdjustOpen(false)
            }}
            busy={busy}
          />
        </DialogContent>
      </Dialog>

      {/* Force Enact Dialog */}
      <Dialog open={forceOpen} onOpenChange={setForceOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>HR Override: Force Enact</DialogTitle></DialogHeader>
          <ForceEnactDialog
            onSubmit={async (outcome, reason) => {
              setBusy(true); setErr('')
              const r = await fetch(`/api/admin/probation/${id}/force-enact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ outcome, reason }),
              })
              const d = await r.json().catch(() => ({}))
              setBusy(false)
              if (!r.ok) { setErr(d.error || 'Force-enact failed'); return }
              setForceOpen(false)
              await reload()
            }}
            busy={busy}
          />
        </DialogContent>
      </Dialog>

      {/* Early Decision Dialog */}
      <Dialog open={earlyOpen} onOpenChange={setEarlyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Early Decision</DialogTitle></DialogHeader>
          <EarlyDecisionDialog
            onSubmit={async (payload) => {
              const ok = await patch({ action: 'EARLY_DECISION', ...payload })
              if (ok) setEarlyOpen(false)
            }}
            busy={busy}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Metric({ label, value, suffix }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className="text-lg font-bold text-slate-900 mt-1">{value}<span className="text-xs font-normal text-slate-500 ml-1">{suffix}</span></p>
    </div>
  )
}

function SettlingForm({ onSubmit, busy }: { onSubmit: (flag: string, notes: string) => void; busy: boolean }) {
  const [flag, setFlag] = useState('GREEN')
  const [notes, setNotes] = useState('')
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Flag</label>
        <Select value={flag} onValueChange={setFlag}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="GREEN">🟢 GREEN — settling well</SelectItem>
            <SelectItem value="AMBER">🟡 AMBER — some concerns</SelectItem>
            <SelectItem value="RED">🔴 RED — serious issues</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">One-line note</label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How are they settling in?" />
      </div>
      <Button onClick={() => onSubmit(flag, notes)} disabled={busy}>Submit Check-in</Button>
    </div>
  )
}

function ManagerForm({ onSubmit, busy }: { onSubmit: (rec: string, notes: string) => void; busy: boolean }) {
  const [r, setR] = useState('CONFIRM')
  const [notes, setNotes] = useState('')
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Recommendation</label>
        <Select value={r} onValueChange={setR}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="CONFIRM">CONFIRM — ready for permanent</SelectItem>
            <SelectItem value="EXTEND">EXTEND — needs more time</SelectItem>
            <SelectItem value="TERMINATE">TERMINATE — not a fit</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
        <textarea className="w-full rounded-md border border-slate-300 p-2 text-sm" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button onClick={() => onSubmit(r, notes)} disabled={busy}>Submit Recommendation</Button>
    </div>
  )
}

function ConfirmBumpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Try to fetch employee salary for the live calculator. Best-effort —
  // if it fails (missing endpoint, missing salary), we still show the
  // input + helper text.
  const [monthly, setMonthly] = useState<number | null>(null)
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then(() => {
        // No-op — placeholder. Live calc derived purely from input.
      })
      .catch(() => {})
  }, [])
  const bumpNum = Number(value)
  const newMonthly = monthly != null && !isNaN(bumpNum) ? monthly + bumpNum : null
  const pct = monthly && monthly > 0 && bumpNum > 0 ? Math.round((bumpNum / monthly) * 1000) / 10 : null
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">
        Salary bump (PKR) <span className="text-slate-700">*</span>
      </label>
      <Input type="number" min={0} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Enter 0 if no change" />
      <p className="text-[11px] text-slate-500 mt-1">Required. Enter 0 if no change. Typical confirmation bump is 10-15%.</p>
      {monthly != null && bumpNum > 0 && (
        <p className="text-[11px] text-slate-700 mt-1">
          Current monthly: PKR {monthly.toLocaleString()} · After bump: PKR {newMonthly!.toLocaleString()} (+{pct ?? 0}%)
        </p>
      )}
    </div>
  )
}

function HRForm({ onSubmit, busy, suggested, managerRec }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; suggested: string | null; managerRec: string | null }) {
  const [decision, setDecision] = useState(managerRec ?? suggested ?? 'CONFIRM')
  const [notes, setNotes] = useState('')
  const [extMonths, setExtMonths] = useState(1)
  const [bumpAmount, setBumpAmount] = useState('')
  const [meetingDate, setMeetingDate] = useState('')
  return (
    <div className="space-y-3">
      {managerRec && <p className="text-xs text-slate-500">Manager recommended: <Badge variant="outline">{managerRec}</Badge></p>}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Decision</label>
        <Select value={decision} onValueChange={setDecision}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="CONFIRM">CONFIRM — confirm permanent</SelectItem>
            <SelectItem value="EXTEND">EXTEND — extend probation</SelectItem>
            <SelectItem value="WARNING">WARNING — formal warning, continue</SelectItem>
            <SelectItem value="TERMINATE">TERMINATE — end employment</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {decision === 'EXTEND' && (
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Extension months</label>
          <Input type="number" min={1} max={12} value={extMonths} onChange={(e) => setExtMonths(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
        </div>
      )}
      {decision === 'CONFIRM' && (
        <ConfirmBumpInput value={bumpAmount} onChange={setBumpAmount} />
      )}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Meeting date (default: +3 business days at 11am)</label>
        <Input type="datetime-local" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
        <textarea className="w-full rounded-md border border-slate-300 p-2 text-sm" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button onClick={() => {
        if (decision === 'CONFIRM' && bumpAmount.trim() === '') {
          toastError('Enter a salary bump (0 if no change). Field is required.')
          return
        }
        const payload: Record<string, unknown> = { decision, notes }
        if (decision === 'EXTEND') payload.extensionMonths = extMonths
        if (decision === 'CONFIRM' && Number(bumpAmount) > 0) payload.salaryBump = { amount: Number(bumpAmount) }
        if (meetingDate) payload.meetingDate = meetingDate
        onSubmit(payload)
      }} disabled={busy || (decision === 'CONFIRM' && bumpAmount.trim() === '')}>Submit HR Decision</Button>
    </div>
  )
}

function AdjustDurationDialog({ current, onSubmit, busy }: { current: number; onSubmit: (m: number, reason: string) => void; busy: boolean }) {
  const [m, setM] = useState(current)
  const [reason, setReason] = useState('')
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Current: {current} months. Downstream triggers will recalculate from the new end date.</p>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">New duration (months)</label>
        <Input type="number" min={1} max={12} value={m} onChange={(e) => setM(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Reason (required)</label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why adjust?" />
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(m, reason)} disabled={busy || !reason.trim()}>Adjust</Button>
      </DialogFooter>
    </div>
  )
}

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime()
  const day = 86_400_000
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}w ago`
  if (diff < 0) {
    const future = Math.abs(diff)
    if (future < day) return `in ${Math.floor(future / 3_600_000)}h`
    return `in ${Math.floor(future / day)}d`
  }
  return `${Math.floor(diff / (30 * day))}mo ago`
}

interface TimelineEvent {
  at: string
  label: string
  detail?: string | null
  tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate'
}

function ActivityTimeline({ rec, canSeeManagerNotes }: { rec: ProbationRec; canSeeManagerNotes: boolean }) {
  const events: TimelineEvent[] = []
  events.push({ at: rec.startDate, label: 'Probation started', tone: 'blue', detail: `Duration: ${rec.durationMonths} months` })
  if (rec.settlingCheckInAt) events.push({
    at: rec.settlingCheckInAt,
    label: 'Settling check-in submitted',
    detail: rec.settlingFlag ? `Flag: ${rec.settlingFlag}${rec.settlingNotes ? ` — ${rec.settlingNotes}` : ''}` : rec.settlingNotes,
    tone: rec.settlingFlag === 'RED' ? 'rose' : rec.settlingFlag === 'AMBER' ? 'amber' : 'emerald',
  })
  if (rec.packetGeneratedAt) events.push({
    at: rec.packetGeneratedAt,
    label: 'Decision packet generated',
    detail: rec.packetSuggestedRec ? `Heuristic: ${rec.packetSuggestedRec}` : null,
    tone: 'violet',
  })
  if (rec.managerSubmittedAt) events.push({
    at: rec.managerSubmittedAt,
    label: 'Manager submitted recommendation',
    detail: `Recommendation: ${rec.managerRecommendation}${canSeeManagerNotes && rec.managerReviewNotes ? ` — ${rec.managerReviewNotes}` : ''}`,
    tone: 'blue',
  })
  if (rec.hrDecidedAt) events.push({
    at: rec.hrDecidedAt,
    label: `HR decided: ${rec.hrDecision}`,
    detail: rec.hrNotes,
    tone: 'violet',
  })
  if (rec.meetingScheduledFor) events.push({
    at: rec.meetingScheduledFor,
    label: 'Meeting scheduled',
    detail: null,
    tone: 'amber',
  })
  if (rec.warningIssuedAt) events.push({
    at: rec.warningIssuedAt,
    label: 'Warning issued',
    detail: rec.warningNotes,
    tone: 'rose',
  })
  if (rec.outcomeEnactedAt) events.push({
    at: rec.outcomeEnactedAt,
    label: `Outcome enacted: ${rec.status}`,
    detail: rec.isEarlyDecision ? `Early decision · ${rec.earlyDecisionReason ?? ''}` : null,
    tone: 'emerald',
  })

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  if (events.length === 0) {
    return <p className="text-sm text-slate-500">No activity yet.</p>
  }

  const toneClass: Record<TimelineEvent['tone'], string> = {
    blue: 'bg-slate-500',
    emerald: 'bg-slate-500',
    amber: 'bg-slate-500',
    rose: 'bg-slate-500',
    violet: 'bg-slate-500',
    slate: 'bg-slate-400',
  }

  return (
    <ol className="relative ml-2 min-w-0">
      <div className="absolute left-[5px] top-2 bottom-2 w-px bg-slate-200" aria-hidden />
      {events.map((e, i) => {
        const d = new Date(e.at)
        return (
          <li key={i} className="relative pl-5 pb-3 last:pb-0 min-w-0">
            <span className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full ${toneClass[e.tone]} ring-2 ring-white shadow-sm`} aria-hidden />
            <p className="text-sm font-semibold text-slate-900 break-words">{e.label}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {relativeTime(d)} · {d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
            {e.detail && <p className="text-xs text-slate-700 mt-1 bg-slate-50 rounded px-2 py-1 whitespace-pre-wrap break-words line-clamp-3">{e.detail}</p>}
          </li>
        )
      })}
    </ol>
  )
}

function ForceEnactDialog({ onSubmit, busy }: { onSubmit: (outcome: string, reason: string) => void; busy: boolean }) {
  const [outcome, setOutcome] = useState('CONFIRM')
  const [reason, setReason] = useState('')
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-900 bg-slate-50 border border-slate-100 rounded p-2">
        Use only when the probation is stuck past its end date with no manager or HR decision. The override reason is logged for audit.
      </p>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Outcome</label>
        <Select value={outcome} onValueChange={setOutcome}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="CONFIRM">CONFIRM</SelectItem>
            <SelectItem value="EXTEND">EXTEND</SelectItem>
            <SelectItem value="WARNING">WARNING</SelectItem>
            <SelectItem value="TERMINATE">TERMINATE</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Override reason (required)</label>
        <textarea className="w-full rounded-md border border-slate-300 p-2 text-sm" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is HR forcing this enactment?" />
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(outcome, reason)} disabled={busy || !reason.trim()} className="bg-slate-700 hover:bg-slate-700 text-white">Force Enact</Button>
      </DialogFooter>
    </div>
  )
}

function EarlyDecisionDialog({ onSubmit, busy }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean }) {
  const [decision, setDecision] = useState('CONFIRM')
  const [reason, setReason] = useState('')
  const [extMonths, setExtMonths] = useState(1)
  const [bumpAmount, setBumpAmount] = useState('')
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">
        Early decisions skip remaining lifecycle stages and enact immediately.
      </p>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Decision</label>
        <Select value={decision} onValueChange={setDecision}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="CONFIRM">CONFIRM</SelectItem>
            <SelectItem value="EXTEND">EXTEND</SelectItem>
            <SelectItem value="WARNING">WARNING</SelectItem>
            <SelectItem value="TERMINATE">TERMINATE</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {decision === 'EXTEND' && (
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Extension months</label>
          <Input type="number" min={1} max={12} value={extMonths} onChange={(e) => setExtMonths(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
        </div>
      )}
      {decision === 'CONFIRM' && (
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Optional salary bump (PKR)</label>
          <Input type="number" min={0} value={bumpAmount} onChange={(e) => setBumpAmount(e.target.value)} />
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Reason (required)</label>
        <textarea className="w-full rounded-md border border-slate-300 p-2 text-sm" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <DialogFooter>
        <Button onClick={() => {
          const payload: Record<string, unknown> = { decision, reason }
          if (decision === 'EXTEND') payload.extensionMonths = extMonths
          if (decision === 'CONFIRM' && Number(bumpAmount) > 0) payload.salaryBump = { amount: Number(bumpAmount) }
          onSubmit(payload)
        }} disabled={busy || !reason.trim()}>Enact Now</Button>
      </DialogFooter>
    </div>
  )
}
