'use client'

/**
 * Performance Concerns — manager-initiated workflow that can escalate to a
 * formal HR Show Cause.
 *
 *   1. Manager flags concern → requests 1:1 meeting        (MEETING_REQUESTED)
 *   2. Meeting outcome logged                              (MEETING_HELD)
 *   3. Pattern persists → manager escalates to HR          (SHOW_CAUSE_REQUESTED)
 *   4. HR issues formal Show Cause                         (ISSUED)
 *   5. Employee responds                                   (RESPONDED)
 *   6. Resolved or escalated to PIP                        (RESOLVED | ESCALATED_TO_PIP)
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import {
  Plus, AlertTriangle, ArrowUpCircle, CheckCircle2, MessageSquare,
  Calendar, FileWarning, ChevronRight, Clock, Trash2, Printer, ShieldAlert,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface Notice {
  id: string
  issueType: string
  status: string
  occurrenceNo: number
  // Meeting stage
  requestedByName: string | null
  meetingRequestedAt: string | null
  meetingScheduledFor: string | null
  meetingConcerns: string | null
  meetingHeldAt: string | null
  meetingNotes: string | null
  // Escalation
  escalationRequestedAt: string | null
  escalationReason: string | null
  // Formal notice
  issueDate: string | null
  description: string | null
  deadline: string | null
  issuedBy: string | null
  // Response
  employeeResponse: string | null
  responseAt: string | null
  // Outcome
  actionPlan: string | null
  outcome: string | null
  followUpDate: string | null
  createdAt: string
  employee: {
    id: string
    employeeCode: string
    fullName: string
    department: { name: string } | null
  }
}

interface Props {
  role: 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'EXECUTIVE'
  employeeId: string | null
  isPreviewMode?: boolean
}

const ISSUE_TYPES = ['ATTENDANCE', 'MISCONDUCT', 'PERFORMANCE', 'POLICY_VIOLATION', 'OTHER']

const STATUS_META: Record<string, { label: string; tone: 'success' | 'warning' | 'destructive' | 'secondary' | 'default'; icon?: React.ComponentType<{ className?: string }> }> = {
  MEETING_REQUESTED:     { label: 'Meeting Requested',     tone: 'default',     icon: MessageSquare },
  MEETING_HELD:          { label: 'Meeting Held',           tone: 'default',     icon: CheckCircle2 },
  SHOW_CAUSE_REQUESTED:  { label: 'Awaiting HR Review',     tone: 'warning',     icon: ArrowUpCircle },
  ISSUED:                { label: 'Show Cause Issued',      tone: 'warning',     icon: FileWarning },
  RESPONDED:             { label: 'Response Received',      tone: 'default',     icon: MessageSquare },
  RESOLVED:              { label: 'Resolved',                tone: 'success',     icon: CheckCircle2 },
  ESCALATED_TO_PIP:      { label: 'Escalated to PIP',        tone: 'destructive', icon: AlertTriangle },
}

const STAGES = [
  'MEETING_REQUESTED',
  'MEETING_HELD',
  'SHOW_CAUSE_REQUESTED',
  'ISSUED',
  'RESPONDED',
  'RESOLVED',
] as const

export function ShowCausePanel({ role, employeeId, isPreviewMode = false }: Props) {
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [flagOpen, setFlagOpen] = useState(false)
  const [selected, setSelected] = useState<Notice | null>(null)

  const isHR = role === 'HR_ADMIN' && !isPreviewMode
  const isManager = role === 'MANAGER' && !isPreviewMode

  const fetchNotices = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/performance/show-cause')
    const data = await res.json()
    setNotices(data.notices ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchNotices() }, [fetchNotices])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Show Cause</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isManager
              ? 'Flag a concern with a direct report → log the meeting outcome → escalate to HR for a formal Show Cause if the pattern persists.'
              : isHR
                ? 'Review manager-flagged concerns and issue formal Show Cause Notices.'
                : 'View any Show Cause matters raised about you and submit your response.'}
          </p>
        </div>
        {(isHR || isManager) && (
          <Button onClick={() => setFlagOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Flag Concern
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-center text-slate-400 py-8 text-sm">Loading…</p>
      ) : notices.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-slate-400">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No active Show Cause matters. {isManager && 'Click the button to flag one.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notices.map((n) => (
            <NoticeCard
              key={n.id}
              notice={n}
              isHR={isHR}
              isManager={isManager}
              isOwn={n.employee.id === employeeId}
              onClick={() => setSelected(n)}
            />
          ))}
        </div>
      )}

      {flagOpen && (
        <FlagConcernDialog
          isHR={isHR}
          onClose={() => setFlagOpen(false)}
          onCreated={() => { fetchNotices(); setFlagOpen(false) }}
        />
      )}

      {selected && (
        <NoticeDetailDialog
          notice={selected}
          isHR={isHR}
          isManager={isManager}
          isOwn={selected.employee.id === employeeId}
          onClose={() => setSelected(null)}
          onUpdated={() => { fetchNotices(); setSelected(null) }}
        />
      )}
    </div>
  )
}

// ─── Notice card ─────────────────────────────────────────────────────────────

function NoticeCard({ notice, onClick }: {
  notice: Notice; isHR: boolean; isManager: boolean; isOwn: boolean; onClick: () => void;
}) {
  const meta = STATUS_META[notice.status] ?? STATUS_META.MEETING_REQUESTED
  const Icon = meta.icon ?? MessageSquare
  const stageIdx = STAGES.indexOf(notice.status as typeof STAGES[number])
  const totalStages = STAGES.length

  return (
    <Card>
      <button onClick={onClick} className="w-full p-4 text-left hover:bg-slate-50/60">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-slate-900">{notice.employee.fullName}</p>
              <Badge variant="secondary">{notice.issueType.replace('_', ' ')}</Badge>
              <Badge variant={meta.tone}><Icon className="w-3 h-3 mr-1 inline" />{meta.label}</Badge>
              {notice.occurrenceNo > 1 && <span className="text-[10px] text-slate-700 font-semibold">Occurrence #{notice.occurrenceNo}</span>}
            </div>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
              {notice.meetingConcerns || notice.description || notice.escalationReason || 'No description'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {notice.requestedByName && <>Flagged by <strong>{notice.requestedByName}</strong> · </>}
              {new Date(notice.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
        {/* Progress dots */}
        {notice.status !== 'ESCALATED_TO_PIP' && (
          <div className="flex items-center gap-1 mt-2">
            {STAGES.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${
                  i < stageIdx ? 'bg-slate-300' : i === stageIdx ? 'bg-slate-500' : 'bg-slate-200'
                }`}
                title={STATUS_META[s]?.label ?? s}
              />
            ))}
          </div>
        )}
      </button>
    </Card>
  )
}

// ─── Flag dialog ─────────────────────────────────────────────────────────────

function FlagConcernDialog({ isHR, onClose, onCreated }: {
  isHR: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [employees, setEmployees] = useState<{ id: string; fullName: string; employeeCode: string }[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [issueType, setIssueType] = useState('PERFORMANCE')
  const [meetingConcerns, setMeetingConcerns] = useState('')
  const [meetingScheduledFor, setMeetingScheduledFor] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/employees?limit=200&status=ACTIVE')
      .then(r => r.json())
      .then(d => setEmployees(d.employees ?? d.items ?? []))
  }, [])

  async function handleFlag() {
    setError('')
    if (!employeeId || !meetingConcerns.trim()) {
      setError('Pick an employee and describe the concerns.')
      return
    }
    setSaving(true)
    const res = await fetch('/api/performance/show-cause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId, issueType, meetingConcerns,
        meetingScheduledFor: meetingScheduledFor || undefined,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Failed'); return }
    onCreated()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Flag a Show Cause Concern</DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            Records the pattern + schedules a 1:1 meeting. The employee + HR are notified.
            If the pattern persists after the meeting, you can escalate to a formal Show Cause Notice.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Employee</label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder={isHR ? 'Pick any employee' : 'Pick a direct report'} /></SelectTrigger>
              <SelectContent>
                {employees.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Type</label>
            <Select value={issueType} onValueChange={setIssueType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ISSUE_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">
              Pattern / concerns observed
            </label>
            <textarea
              value={meetingConcerns}
              onChange={(e) => setMeetingConcerns(e.target.value)}
              rows={4}
              className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
              placeholder="e.g. Missed 3 deadlines in the last 2 weeks (12 May, 14 May, 17 May). Quality of design output has dropped — 2 client revisions on each delivery. Verbal feedback given on 10 May but no improvement."
            />
            <p className="text-[11px] text-slate-500 mt-1">Be specific, factual, and dated. This is what you'll discuss in the meeting.</p>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">
              Meeting scheduled for (optional)
            </label>
            <Input
              type="datetime-local"
              value={meetingScheduledFor}
              onChange={(e) => setMeetingScheduledFor(e.target.value)}
            />
            <p className="text-[11px] text-slate-500 mt-1">Workday convention: hold the meeting within a few days.</p>
          </div>

          {error && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleFlag} disabled={saving}>
            {saving ? 'Saving…' : 'Flag & Request Meeting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Detail / action dialog ──────────────────────────────────────────────────

function NoticeDetailDialog({ notice, isHR, isManager, isOwn, onClose, onUpdated }: {
  notice: Notice; isHR: boolean; isManager: boolean; isOwn: boolean; onClose: () => void; onUpdated: () => void;
}) {
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [terminateOpen, setTerminateOpen] = useState(false)
  const [form, setForm] = useState({
    meetingNotes: notice.meetingNotes ?? '',
    escalationReason: notice.escalationReason ?? '',
    description: notice.description ?? '',
    deadline: notice.deadline?.split('T')[0] ?? '',
    employeeResponse: notice.employeeResponse ?? '',
    actionPlan: notice.actionPlan ?? '',
    outcome: notice.outcome ?? '',
    followUpDate: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function performAction(action: string, payload: Record<string, unknown>) {
    setBusy(true); setError('')
    const res = await fetch(`/api/performance/show-cause/${notice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Failed'); return }
    onUpdated()
  }

  // Available actions based on current stage + viewer role
  const actions: { id: string; label: string; tone?: 'primary' | 'success' | 'destructive' }[] = []
  if (notice.status === 'MEETING_REQUESTED' && (isHR || isManager)) {
    actions.push({ id: 'LOG_MEETING_OUTCOME', label: '📝 Log meeting outcome', tone: 'primary' })
  }
  if (notice.status === 'MEETING_HELD' && (isHR || isManager)) {
    actions.push({ id: 'RESOLVE', label: '✓ Resolve (improved)', tone: 'success' })
    actions.push({ id: 'ESCALATE_TO_HR', label: '🚩 Escalate to HR (pattern persists)', tone: 'destructive' })
  }
  if (notice.status === 'SHOW_CAUSE_REQUESTED' && isHR) {
    actions.push({ id: 'ISSUE_FORMAL_NOTICE', label: '⚠️ Issue formal Show Cause', tone: 'destructive' })
    actions.push({ id: 'RESOLVE', label: '✓ Resolve without formal notice', tone: 'success' })
  }
  if (notice.status === 'ISSUED' && isOwn) {
    actions.push({ id: 'RESPOND', label: '✍️ Submit my response', tone: 'primary' })
  }
  if (notice.status === 'RESPONDED' && isHR) {
    actions.push({ id: 'RESOLVE', label: '✓ Accept response & resolve', tone: 'success' })
    actions.push({ id: 'ESCALATE_TO_PIP', label: '🚨 Escalate to PIP', tone: 'destructive' })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-slate-700" />
            Show Cause — {notice.employee.fullName}
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            {notice.issueType.replace('_', ' ')} · Occurrence #{notice.occurrenceNo} · {STATUS_META[notice.status]?.label ?? notice.status}
          </p>
        </DialogHeader>

        {/* Timeline */}
        <div className="space-y-3 text-sm">
          {notice.meetingRequestedAt && (
            <TimelineEntry
              icon={MessageSquare}
              tone="blue"
              title="Concern flagged · meeting requested"
              by={notice.requestedByName ?? 'Manager'}
              at={notice.meetingRequestedAt}
              body={notice.meetingConcerns}
              extra={notice.meetingScheduledFor && <>Meeting scheduled for <Calendar className="w-3 h-3 inline" /> {new Date(notice.meetingScheduledFor).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</>}
            />
          )}
          {notice.meetingHeldAt && (
            <TimelineEntry
              icon={CheckCircle2}
              tone="emerald"
              title="Meeting held"
              by="Manager"
              at={notice.meetingHeldAt}
              body={notice.meetingNotes}
            />
          )}
          {notice.escalationRequestedAt && (
            <TimelineEntry
              icon={ArrowUpCircle}
              tone="amber"
              title="Escalated to HR"
              by={notice.requestedByName ?? 'Manager'}
              at={notice.escalationRequestedAt}
              body={notice.escalationReason}
            />
          )}
          {notice.issueDate && (
            <TimelineEntry
              icon={FileWarning}
              tone="amber"
              title="Formal Show Cause Notice issued"
              by={notice.issuedBy ?? 'HR'}
              at={notice.issueDate}
              body={notice.description}
              extra={notice.deadline && <>Response due by <strong>{new Date(notice.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</strong></>}
            />
          )}
          {notice.responseAt && (
            <TimelineEntry
              icon={MessageSquare}
              tone="blue"
              title="Employee response"
              by={notice.employee.fullName}
              at={notice.responseAt}
              body={notice.employeeResponse}
            />
          )}
          {(notice.outcome || notice.actionPlan) && notice.status === 'RESOLVED' && (
            <TimelineEntry
              icon={CheckCircle2}
              tone="emerald"
              title="Resolved"
              by="HR"
              at={null}
              body={notice.outcome ?? notice.actionPlan}
            />
          )}
        </div>

        {/* Active action form */}
        {activeAction && (
          <div className="border-t border-slate-200 pt-4 mt-4 space-y-3">
            {activeAction === 'LOG_MEETING_OUTCOME' && (
              <>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600">
                  What was discussed in the meeting?
                </label>
                <textarea
                  value={form.meetingNotes}
                  onChange={(e) => setForm({ ...form, meetingNotes: e.target.value })}
                  rows={4}
                  className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
                  placeholder="e.g. Discussed specific deadlines missed. Employee acknowledged. Agreed on weekly check-ins for the next month. Will revisit in 2 weeks."
                />
                <div className="flex gap-2">
                  <Button onClick={() => performAction('LOG_MEETING_OUTCOME', { meetingNotes: form.meetingNotes })} disabled={busy}>
                    {busy ? 'Saving…' : 'Save Meeting Notes'}
                  </Button>
                  <Button variant="outline" onClick={() => setActiveAction(null)}>Cancel</Button>
                </div>
              </>
            )}
            {activeAction === 'ESCALATE_TO_HR' && (
              <>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600">
                  Why is the pattern still persisting?
                </label>
                <textarea
                  value={form.escalationReason}
                  onChange={(e) => setForm({ ...form, escalationReason: e.target.value })}
                  rows={4}
                  className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
                  placeholder="e.g. Despite weekly check-ins agreed on 12 May, missed 2 more deadlines on 19 May and 22 May. No improvement in quality. Requesting formal Show Cause."
                />
                <div className="flex gap-2">
                  <Button onClick={() => performAction('ESCALATE_TO_HR', { escalationReason: form.escalationReason })} disabled={busy} className="bg-slate-700 hover:bg-slate-700 text-white">
                    {busy ? 'Escalating…' : 'Send to HR for Show Cause'}
                  </Button>
                  <Button variant="outline" onClick={() => setActiveAction(null)}>Cancel</Button>
                </div>
              </>
            )}
            {activeAction === 'ISSUE_FORMAL_NOTICE' && (
              <>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600">Formal notice text</label>
                <textarea
                  value={form.description || `${notice.meetingConcerns ?? ''}\n\n${notice.escalationReason ?? ''}`.trim()}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={5}
                  className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
                />
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600">Response deadline</label>
                <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
                <div className="flex gap-2">
                  <Button
                    onClick={() => performAction('ISSUE_FORMAL_NOTICE', {
                      description: form.description || `${notice.meetingConcerns ?? ''}\n\n${notice.escalationReason ?? ''}`.trim(),
                      deadline: form.deadline,
                    })}
                    disabled={busy}
                    className="bg-slate-700 hover:bg-slate-700 text-white"
                  >
                    {busy ? 'Issuing…' : 'Issue Show Cause Notice'}
                  </Button>
                  <Button variant="outline" onClick={() => setActiveAction(null)}>Cancel</Button>
                </div>
              </>
            )}
            {activeAction === 'RESPOND' && (
              <>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600">Your response</label>
                <textarea
                  value={form.employeeResponse}
                  onChange={(e) => setForm({ ...form, employeeResponse: e.target.value })}
                  rows={6}
                  className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
                  placeholder="Explain your side, any mitigating circumstances, and your plan to address the concerns."
                />
                <div className="flex gap-2">
                  <Button onClick={() => performAction('RESPOND', { employeeResponse: form.employeeResponse })} disabled={busy}>
                    {busy ? 'Submitting…' : 'Submit Response'}
                  </Button>
                  <Button variant="outline" onClick={() => setActiveAction(null)}>Cancel</Button>
                </div>
              </>
            )}
            {activeAction === 'RESOLVE' && (
              <>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600">Outcome / resolution</label>
                <textarea
                  value={form.outcome}
                  onChange={(e) => setForm({ ...form, outcome: e.target.value })}
                  rows={3}
                  className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
                  placeholder="e.g. Employee has shown clear improvement in the last 4 weeks. Closing the matter."
                />
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600">Action plan (optional)</label>
                <textarea
                  value={form.actionPlan}
                  onChange={(e) => setForm({ ...form, actionPlan: e.target.value })}
                  rows={2}
                  className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
                  placeholder="Any ongoing support / coaching to continue."
                />
                <div className="flex gap-2">
                  <Button onClick={() => performAction('RESOLVE', { outcome: form.outcome, actionPlan: form.actionPlan })} disabled={busy} className="bg-slate-700 hover:bg-slate-700 text-white">
                    {busy ? 'Resolving…' : 'Resolve'}
                  </Button>
                  <Button variant="outline" onClick={() => setActiveAction(null)}>Cancel</Button>
                </div>
              </>
            )}
            {activeAction === 'ESCALATE_TO_PIP' && (
              <>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600">Action plan</label>
                <textarea
                  value={form.actionPlan}
                  onChange={(e) => setForm({ ...form, actionPlan: e.target.value })}
                  rows={3}
                  className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
                  placeholder="Outline the PIP scope — measurable goals, timeline, support, consequences."
                />
                <div className="flex gap-2">
                  <Button onClick={() => performAction('ESCALATE_TO_PIP', { actionPlan: form.actionPlan })} disabled={busy} className="bg-slate-700 hover:bg-slate-700 text-white">
                    {busy ? 'Escalating…' : 'Escalate to PIP'}
                  </Button>
                  <Button variant="outline" onClick={() => setActiveAction(null)}>Cancel</Button>
                </div>
              </>
            )}
            {error && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>}
          </div>
        )}

        {/* Action buttons */}
        {!activeAction && actions.length > 0 && (
          <div className="border-t border-slate-200 pt-4 mt-4 flex flex-wrap gap-2">
            {actions.map(a => (
              <Button
                key={a.id}
                onClick={() => setActiveAction(a.id)}
                variant={a.tone === 'primary' ? 'default' : 'outline'}
                className={
                  a.tone === 'success'    ? 'border-slate-100 text-slate-700 hover:bg-slate-50' :
                  a.tone === 'destructive'? 'border-slate-100 text-slate-700 hover:bg-slate-50' :
                  ''
                }
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}

        <DialogFooter className="border-t border-slate-200 pt-3 mt-4 flex-wrap gap-2 justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Print — visible once formally issued (HR + Exec + own employee). */}
            {notice.issueDate && (
              <Button
                variant="outline"
                onClick={() => window.open(`/show-cause/${notice.id}/print`, '_blank')}
              >
                <Printer className="w-4 h-4 mr-1.5" /> Print Notice
              </Button>
            )}
            {/* Proceed to Termination — HR only, once formally issued. */}
            {isHR && notice.issueDate && notice.status !== 'ESCALATED_TERMINATION' && (
              <Button
                variant="outline"
                onClick={() => setTerminateOpen(true)}
                className="text-red-700 border-red-200 hover:bg-red-50"
              >
                <ShieldAlert className="w-4 h-4 mr-1.5" /> Proceed to Termination
              </Button>
            )}
            {/* Delete — HR only. Used for cleaning up test entries. */}
            {isHR && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  if (!confirm('Permanently delete this Show Cause record? Used for cleaning up test entries — irreversible.')) return
                  if (notice.status === 'ESCALATED_TO_PIP') {
                    if (!confirm('This Show Cause has been escalated to a PIP. Deleting will NOT delete the linked PIP. Continue?')) return
                  }
                  setBusy(true); setError('')
                  const res = await fetch(`/api/performance/show-cause/${notice.id}`, { method: 'DELETE' })
                  setBusy(false)
                  if (!res.ok) {
                    const d = await res.json().catch(() => ({}))
                    setError(d.error ?? 'Delete failed')
                    return
                  }
                  onUpdated()
                }}
                className="text-slate-700 border-slate-300 hover:bg-slate-50"
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> Delete
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>

      {terminateOpen && (
        <ProceedToTerminationDialog
          notice={notice}
          onClose={() => setTerminateOpen(false)}
          onDone={() => { setTerminateOpen(false); onUpdated() }}
        />
      )}
    </Dialog>
  )
}

// ─── Proceed to Termination dialog ───────────────────────────────────────────

function ProceedToTerminationDialog({ notice, onClose, onDone }: {
  notice: Notice; onClose: () => void; onDone: () => void;
}) {
  const router = useRouter()
  const [reasonCategory, setReasonCategory] = useState('MISCONDUCT')
  const [reason, setReason] = useState(
    (notice.description ?? notice.meetingConcerns ?? notice.escalationReason ?? '').trim(),
  )
  const [lastWorkingDay, setLastWorkingDay] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    if (!reason.trim()) return setError('Enter a detailed reason.')
    if (!lastWorkingDay) return setError('Pick a proposed last working day.')
    setSaving(true)
    const res = await fetch('/api/termination', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: notice.employee.id,
        showCauseId: notice.id,
        reason,
        reasonCategory,
        lastWorkingDay,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) return setError(data.error ?? 'Failed to initiate termination.')
    router.push(`/dashboard/lifecycle/termination/${data.termination.id}`)
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-800">
            <ShieldAlert className="w-4 h-4" /> Proceed to Termination
          </DialogTitle>
          <p className="text-xs text-slate-600 mt-1">
            This initiates a formal termination workflow linked to this Show Cause. The employee will be notified
            once you schedule the meeting. Continue only if the Show Cause response has been reviewed and
            termination has been decided.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Reason category</label>
            <Select value={reasonCategory} onValueChange={setReasonCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MISCONDUCT">Misconduct</SelectItem>
                <SelectItem value="PERFORMANCE">Performance</SelectItem>
                <SelectItem value="ATTENDANCE">Attendance</SelectItem>
                <SelectItem value="POLICY_VIOLATION">Policy Violation</SelectItem>
                <SelectItem value="REDUNDANCY">Redundancy</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Detailed reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={5}
              className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
              placeholder="Cite the pattern, prior meetings, Show Cause reference, and response. This forms part of the formal termination notice."
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Proposed last working day</label>
            <Input type="date" value={lastWorkingDay} onChange={(e) => setLastWorkingDay(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-800 bg-red-50 border border-red-100 rounded p-2">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="bg-red-700 hover:bg-red-700 text-white"
          >
            {saving ? 'Initiating…' : 'Initiate Termination'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TimelineEntry({ icon: Icon, tone, title, by, at, body, extra }: {
  icon: React.ComponentType<{ className?: string }>; tone: 'blue' | 'emerald' | 'amber';
  title: string; by: string; at: string | null;
  body: string | null; extra?: React.ReactNode;
}) {
  const tones = {
    blue:    'bg-slate-50 border-slate-100 text-slate-900',
    emerald: 'bg-slate-50 border-slate-100 text-slate-900',
    amber:   'bg-slate-50 border-slate-100 text-slate-900',
  }
  return (
    <div className={`border-l-4 rounded-r-md p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5" />
        <p className="text-sm font-semibold">{title}</p>
        <span className="text-[11px] opacity-70 ml-auto">
          {by}{at && ` · ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
        </span>
      </div>
      {body && <p className="text-sm whitespace-pre-line opacity-90">{body}</p>}
      {extra && <p className="text-xs mt-1 opacity-80">{extra}</p>}
    </div>
  )
}
