'use client'

import { useEffect, useState, use } from 'react'
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
  }
}

interface CurrentUser {
  role: string
  employee?: { id: string } | null
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
    const r = await fetch(`/api/probation/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await r.json()
    setBusy(false)
    if (!r.ok) { setErr(d.error || 'Failed'); return false }
    await reload()
    return true
  }

  if (loading) return <div className="p-8 text-slate-500">Loading…</div>
  if (!rec) return <div className="p-8 text-slate-500">Not found.</div>

  const isHR = me?.role === 'HR_ADMIN'
  const isManager = me?.employee?.id === rec.employee.reportingManagerId
  const daysLeft = Math.floor((new Date(rec.endDate).getTime() - Date.now()) / 86_400_000)
  const elapsed = Math.floor((Date.now() - new Date(rec.startDate).getTime()) / 86_400_000)
  const settlingDue = elapsed >= 30 && rec.settlingCheckInAt == null && rec.durationMonths >= 2

  return (
    <div className="space-y-6">
      <BackButton fallback="/dashboard/probation" />
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600 p-6 text-white shadow-md">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{rec.employee.fullName}</h1>
            <p className="text-white/85 mt-1 text-sm">
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
                <span className="inline-flex items-center gap-1.5 bg-orange-500/30 px-3 py-1 rounded-full text-white">
                  <AlertTriangle className="w-3.5 h-3.5" /> {rec.warningCount} warning{rec.warningCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          {isHR && rec.status !== 'CONFIRMED' && rec.status !== 'TERMINATED' && (
            <div className="flex flex-col gap-2">
              <Button onClick={() => setAdjustOpen(true)} variant="outline" className="bg-white/10 text-white border-white/30 hover:bg-white/20">Adjust Duration</Button>
              {rec.status === 'ACTIVE' && (
                <Button onClick={() => setEarlyOpen(true)} className="bg-amber-500 hover:bg-amber-600 text-white">
                  <Zap className="w-4 h-4 mr-1" /> Early Decision
                </Button>
              )}
              {rec.status === 'UNDER_REVIEW' && rec.hrDecision == null && daysLeft < -30 && (
                <Button onClick={() => setForceOpen(true)} className="bg-rose-600 hover:bg-rose-700 text-white">
                  <AlertTriangle className="w-4 h-4 mr-1" /> HR Override: Force Enact
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {err && <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">{err}</div>}

      {/* Timeline */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Timeline</h2>
        <div className="flex items-center justify-between gap-2">
          {[
            { label: 'Hire', done: true, sub: fmt(rec.startDate) },
            { label: 'Settling (Day 30)', done: !!rec.settlingCheckInAt, sub: rec.settlingCheckInAt ? fmt(rec.settlingCheckInAt) : settlingDue ? 'Due' : 'Pending' },
            { label: 'Decision Packet', done: !!rec.packetGeneratedAt, sub: rec.packetGeneratedAt ? fmt(rec.packetGeneratedAt) : 'Pending' },
            { label: 'Outcome', done: !!rec.outcomeEnactedAt, sub: rec.outcomeEnactedAt ? `${rec.hrDecision} · ${fmt(rec.outcomeEnactedAt)}` : 'Pending' },
          ].map((s, i) => (
            <div key={i} className="flex-1 text-center">
              <div className={`mx-auto w-9 h-9 rounded-full flex items-center justify-center ${s.done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {s.done ? <CheckCircle className="w-5 h-5" /> : i + 1}
              </div>
              <p className="text-xs font-semibold text-slate-700 mt-2">{s.label}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{s.sub}</p>
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
                rec.settlingFlag === 'GREEN' ? 'bg-emerald-100 text-emerald-800' :
                rec.settlingFlag === 'AMBER' ? 'bg-amber-100 text-amber-800' :
                'bg-rose-100 text-rose-800'
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

      {/* Decision packet */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Decision Packet</h2>
          {!rec.packetGeneratedAt && (isHR || isManager) && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => patch({ action: 'GENERATE_PACKET' })}>Generate Now</Button>
          )}
        </div>
        {rec.packetGeneratedAt ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric label="Days Worked" value={rec.packetDaysWorked ?? '—'} />
              <Metric label="Days Absent" value={rec.packetDaysAbsent ?? '—'} />
              <Metric label="Late Arrivals" value={rec.packetLateCount ?? '—'} />
              <Metric label="Avg Hours/Day" value={rec.packetAvgHours?.toFixed(1) ?? '—'} />
              <Metric label="Time Score" value={rec.packetTimeScore?.toFixed(1) ?? '—'} suffix="/ 5" />
              <Metric label="Goal Score" value={rec.packetGoalScore?.toFixed(1) ?? '—'} suffix={rec.packetGoalScore != null ? '/ 5' : ''} />
            </div>
            {rec.packetSuggestedRec && (
              <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 text-sm">
                <span className="text-violet-900 font-semibold">Heuristic suggestion: </span>
                <Badge className="bg-violet-600 text-white">{rec.packetSuggestedRec}</Badge>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Packet auto-generates at Day-(end-30). HR/manager can force-generate above.</p>
        )}
      </Card>

      {/* Manager review */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">Manager Review</h2>
        {rec.managerSubmittedAt ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-100 text-blue-800">{rec.managerRecommendation}</Badge>
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
          {rec.overrodeManager && <Badge className="bg-orange-100 text-orange-800">OVERRIDE</Badge>}
        </div>
        {rec.hrDecidedAt ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-violet-100 text-violet-800">{rec.hrDecision}</Badge>
              {rec.extensionMonths && <span className="text-xs text-slate-600">+{rec.extensionMonths} month(s)</span>}
              {rec.salaryBumpAmount && <span className="text-xs text-emerald-700 font-semibold">+PKR {rec.salaryBumpAmount.toLocaleString('en-PK')} bump</span>}
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
        <Card className="p-5 bg-emerald-50/40 border-emerald-200">
          <h2 className="text-sm font-semibold text-emerald-900 uppercase tracking-wider mb-2">Outcome Enacted</h2>
          <p className="text-sm text-emerald-900">
            <strong>{rec.hrDecision}</strong> enacted on {fmt(rec.outcomeEnactedAt)}
            {rec.isEarlyDecision && <span className="ml-2 inline-block bg-amber-200 text-amber-900 text-xs px-2 py-0.5 rounded">EARLY DECISION</span>}
          </p>
          {rec.earlyDecisionReason && <p className="text-xs text-emerald-800 mt-1">Reason: {rec.earlyDecisionReason}</p>}
          {rec.confirmationLetterId && (
            <a
              href={`/letters/${rec.confirmationLetterId}/print`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2"
            >
              <FileText className="w-4 h-4" /> View confirmation letter
            </a>
          )}
        </Card>
      )}

      {/* Warning history strip */}
      {rec.warningCount > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">Warnings ({rec.warningCount})</h2>
          {rec.warningIssuedAt && (
            <div className="border-l-2 border-orange-400 pl-3">
              <p className="text-xs text-slate-500">{fmt(rec.warningIssuedAt)}</p>
              {rec.warningNotes && <p className="text-sm text-slate-700 mt-1">{rec.warningNotes}</p>}
            </div>
          )}
        </Card>
      )}

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

      {/* Activity Timeline — chronological audit trail */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4" /> Activity
        </h2>
        <ActivityTimeline rec={rec} canSeeManagerNotes={isHR || isManager || !!rec.outcomeEnactedAt} />
      </Card>

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
        Salary bump (PKR) <span className="text-rose-600">*</span>
      </label>
      <Input type="number" min={0} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Enter 0 if no change" />
      <p className="text-[11px] text-slate-500 mt-1">Required. Enter 0 if no change. Typical confirmation bump is 10-15%.</p>
      {monthly != null && bumpNum > 0 && (
        <p className="text-[11px] text-emerald-700 mt-1">
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
          alert('Enter a salary bump (0 if no change). Field is required.')
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
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    violet: 'bg-violet-500',
    slate: 'bg-slate-400',
  }

  return (
    <ol className="relative ml-3">
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" aria-hidden />
      {events.map((e, i) => {
        const d = new Date(e.at)
        return (
          <li key={i} className="relative pl-6 pb-5 last:pb-0">
            <span className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full ${toneClass[e.tone]} ring-4 ring-white shadow-sm`} aria-hidden />
            <p className="text-sm font-semibold text-slate-900">{e.label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {relativeTime(d)} · {d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
            {e.detail && <p className="text-xs text-slate-700 mt-1 bg-slate-50 rounded px-2 py-1.5 whitespace-pre-wrap">{e.detail}</p>}
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
      <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded p-2">
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
        <Button onClick={() => onSubmit(outcome, reason)} disabled={busy || !reason.trim()} className="bg-rose-600 hover:bg-rose-700 text-white">Force Enact</Button>
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
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
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
