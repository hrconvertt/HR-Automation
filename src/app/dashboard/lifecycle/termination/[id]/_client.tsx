'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { ShieldAlert, Calendar, FileText, ArrowRight, CheckCircle2, X, Printer } from 'lucide-react'

interface Termination {
  id: string
  employeeId: string
  employee: {
    id: string
    fullName: string
    employeeCode: string
    designation: string
    email: string
    joiningDate: string
    department: { name: string } | null
    reportingManager: { fullName: string } | null
  }
  initiatedByName: string | null
  showCauseId: string | null
  reason: string
  reasonCategory: string
  meetingScheduledAt: string | null
  meetingLocation: string | null
  meetingAgenda: string | null
  meetingHeldAt: string | null
  meetingNotes: string | null
  noticeIssuedAt: string | null
  lastWorkingDay: string
  exitClearanceId: string | null
  status: string
  cancelledAt: string | null
  cancellationReason: string | null
  activityLog: string | null
  createdAt: string
}

const STAGES = [
  'INITIATED',
  'MEETING_SCHEDULED',
  'MEETING_HELD',
  'NOTICE_ISSUED',
  'IN_EXIT_CLEARANCE',
  'COMPLETED',
] as const

const STAGE_LABELS: Record<string, string> = {
  INITIATED: 'Initiated',
  MEETING_SCHEDULED: 'Meeting Scheduled',
  MEETING_HELD: 'Meeting Held',
  NOTICE_ISSUED: 'Notice Issued',
  IN_EXIT_CLEARANCE: 'Exit Clearance',
  COMPLETED: 'Completed',
}

interface ActivityEntry { at: string; by: string; action: string; note?: string }

function parseActivity(raw: string | null): ActivityEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as ActivityEntry[]
  } catch { /* ignore */ }
  return []
}

export default function TerminationDetailClient({ initial, canAct }: { initial: Termination; canAct: boolean }) {
  const router = useRouter()
  const [t, setT] = useState<Termination>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const stageIdx = STAGES.indexOf(t.status as typeof STAGES[number])
  const isCancelled = t.status === 'CANCELLED'
  const activity = parseActivity(t.activityLog)

  async function callAction(path: string, payload: Record<string, unknown>) {
    setBusy(true); setError('')
    const res = await fetch(`/api/termination/${t.id}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Action failed'); return null }
    if (data.termination) setT(data.termination)
    router.refresh()
    return data
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-slate-700" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Termination — {t.employee.fullName}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {t.employee.employeeCode} · {t.employee.designation}
              {t.employee.department?.name ? ` · ${t.employee.department.name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {t.noticeIssuedAt && (
            <a href={`/termination-notice/${t.id}/print`} target="_blank" rel="noreferrer">
              <Button variant="outline"><Printer className="w-4 h-4 mr-1.5" /> Print Notice</Button>
            </a>
          )}
          <Link href="/dashboard/lifecycle/termination">
            <Button variant="outline">Back</Button>
          </Link>
        </div>
      </div>

      {isCancelled && (
        <div className="mb-4 p-3 border border-slate-200 bg-slate-50 rounded text-sm text-slate-700">
          <strong>Cancelled.</strong> {t.cancellationReason ?? ''} {t.cancelledAt && `on ${new Date(t.cancelledAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}`}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_280px] gap-6">
        <div>
          {/* Stepper */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex items-center gap-1 overflow-x-auto">
                {STAGES.map((s, i) => (
                  <div key={s} className="flex items-center flex-1 min-w-0">
                    <div
                      className={`h-8 flex-1 rounded flex items-center justify-center text-[11px] font-semibold px-2 whitespace-nowrap ${
                        isCancelled
                          ? 'bg-slate-50 text-slate-400'
                          : i < stageIdx
                            ? 'bg-slate-800 text-white'
                            : i === stageIdx
                              ? 'bg-slate-600 text-white'
                              : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {i + 1}. {STAGE_LABELS[s]}
                    </div>
                    {i < STAGES.length - 1 && <ArrowRight className="w-3 h-3 mx-1 text-slate-300 shrink-0" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Facts */}
          <Card className="mb-4">
            <CardContent className="p-4 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Reason category</p>
                  <p className="text-slate-800">{t.reasonCategory.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Last working day</p>
                  <p className="text-slate-800">{new Date(t.lastWorkingDay).toLocaleDateString('en-GB', { dateStyle: 'long' })}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Joined</p>
                  <p className="text-slate-800">{new Date(t.employee.joiningDate).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Reporting manager</p>
                  <p className="text-slate-800">{t.employee.reportingManager?.fullName ?? '—'}</p>
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mt-2">Detailed reason</p>
                <p className="text-slate-700 whitespace-pre-wrap text-sm border-l-2 border-slate-200 pl-3 mt-1">{t.reason}</p>
              </div>
              {t.showCauseId && (
                <p className="text-xs text-slate-600 mt-2">
                  Linked from Show Cause: <Link href={`/dashboard/performance`} className="underline">view</Link>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Stage action card */}
          {!isCancelled && (
            <StageActionCard t={t} canAct={canAct} busy={busy} onAction={callAction} />
          )}

          {error && <p className="mt-3 text-sm text-slate-800 bg-slate-50 border border-slate-200 p-2 rounded">{error}</p>}

          {/* Cancel */}
          {canAct && !isCancelled && ['INITIATED', 'MEETING_SCHEDULED', 'MEETING_HELD'].includes(t.status) && (
            <div className="mt-4">
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  const reason = prompt('Reason for cancelling the termination workflow:')
                  if (reason == null) return
                  if (!confirm('Cancel this termination workflow? This cannot be reopened; a new workflow would need to be started.')) return
                  await callAction('cancel', { reason })
                }}
                className="text-slate-700 border-slate-300"
              >
                <X className="w-4 h-4 mr-1.5" /> Cancel Termination
              </Button>
            </div>
          )}
        </div>

        {/* Activity sidebar */}
        <aside className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Activity</h3>
          <div className="space-y-2">
            {activity.length === 0 && <p className="text-xs text-slate-400">No activity yet.</p>}
            {activity.slice().reverse().map((entry, idx) => (
              <div key={idx} className="border-l-2 border-slate-200 pl-3 pb-2">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">{entry.action.replace(/_/g, ' ')}</p>
                <p className="text-[11px] text-slate-500">{entry.by} · {new Date(entry.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                {entry.note && <p className="text-xs text-slate-700 mt-1">{entry.note}</p>}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

function StageActionCard({ t, canAct, busy, onAction }: {
  t: Termination;
  canAct: boolean;
  busy: boolean;
  onAction: (path: string, payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const [scheduledAt, setScheduledAt] = useState('')
  const [location, setLocation] = useState('')
  const [agenda, setAgenda] = useState('')
  const [heldAt, setHeldAt] = useState('')
  const [meetingNotes, setMeetingNotes] = useState('')

  if (t.status === 'INITIATED') {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Calendar className="w-4 h-4" /> Schedule Meeting</h3>
          <p className="text-xs text-slate-500">Sets a formal meeting with the employee. Employee is notified once scheduled.</p>
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Date & time</label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} disabled={!canAct} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Location (optional)</label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Conference Room B / Google Meet link" disabled={!canAct} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Agenda / notes (optional)</label>
            <textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={3} className="w-full text-sm rounded-md border border-slate-200 px-3 py-2" disabled={!canAct} />
          </div>
          <Button
            disabled={!canAct || busy || !scheduledAt}
            onClick={() => onAction('schedule-meeting', { scheduledAt, location: location || null, notes: agenda || null })}
          >
            {busy ? 'Saving…' : 'Schedule Meeting'}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (t.status === 'MEETING_SCHEDULED') {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Calendar className="w-4 h-4" /> Meeting</h3>
          <div className="text-sm">
            <p><strong>Scheduled for:</strong> {t.meetingScheduledAt && new Date(t.meetingScheduledAt).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}</p>
            {t.meetingLocation && <p><strong>Location:</strong> {t.meetingLocation}</p>}
            {t.meetingAgenda && <p className="whitespace-pre-wrap text-xs text-slate-600 mt-1">{t.meetingAgenda}</p>}
          </div>
          <div className="border-t pt-3">
            <h4 className="text-sm font-semibold text-slate-900 mb-2">Record Meeting Outcome</h4>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Meeting held on</label>
            <Input type="datetime-local" value={heldAt} onChange={(e) => setHeldAt(e.target.value)} disabled={!canAct} />
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1 mt-2">Notes</label>
            <textarea value={meetingNotes} onChange={(e) => setMeetingNotes(e.target.value)} rows={4} className="w-full text-sm rounded-md border border-slate-200 px-3 py-2" placeholder="What was discussed, employee's response, key facts." disabled={!canAct} />
            <Button
              className="mt-3"
              disabled={!canAct || busy || !heldAt || !meetingNotes.trim()}
              onClick={() => onAction('record-meeting', { heldAt, notes: meetingNotes })}
            >
              {busy ? 'Saving…' : 'Record Outcome'}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (t.status === 'MEETING_HELD') {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4" /> Issue Termination Notice</h3>
          <p className="text-xs text-slate-500">Generates a formal Convertt-branded termination letter and stores an activity snapshot. The employee is notified.</p>
          {t.meetingNotes && (
            <div className="text-xs text-slate-700 border-l-2 border-slate-200 pl-3 whitespace-pre-wrap">{t.meetingNotes}</div>
          )}
          <Button
            disabled={!canAct || busy}
            onClick={async () => {
              if (!confirm('Issue formal Termination Notice? The employee will be notified and the notice becomes printable.')) return
              await onAction('issue-notice', {})
            }}
            className="bg-slate-800 hover:bg-slate-800 text-white"
          >
            {busy ? 'Issuing…' : 'Issue Termination Notice'}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (t.status === 'NOTICE_ISSUED') {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4" /> Notice Issued</h3>
          <p className="text-sm text-slate-700">
            Notice issued on <strong>{t.noticeIssuedAt && new Date(t.noticeIssuedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}</strong>.
          </p>
          <div className="flex gap-2 flex-wrap">
            <a href={`/termination-notice/${t.id}/print`} target="_blank" rel="noreferrer">
              <Button variant="outline"><Printer className="w-4 h-4 mr-1.5" /> View Notice</Button>
            </a>
            <Button
              disabled={!canAct || busy}
              onClick={async () => {
                if (!confirm('Open Exit Clearance now? This finalizes the termination side and moves control to the Exit Clearance module. Employee status will flip to TERMINATED.')) return
                await onAction('handoff-clearance', {})
              }}
              className="bg-slate-800 hover:bg-slate-800 text-white"
            >
              {busy ? 'Handing off…' : 'Hand off to Exit Clearance'}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (t.status === 'IN_EXIT_CLEARANCE') {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> In Exit Clearance</h3>
          <p className="text-sm text-slate-700">
            The Exit Clearance module now owns the remainder of this offboarding. Once clearance completes, this workflow moves to Completed.
          </p>
          {t.exitClearanceId && (
            <Link href={`/dashboard/lifecycle/exit`} className="text-sm underline underline-offset-2 text-slate-800">Open Exit Clearance →</Link>
          )}
        </CardContent>
      </Card>
    )
  }

  if (t.status === 'COMPLETED') {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Completed</h3>
          <p className="text-sm text-slate-700">
            Termination workflow closed. Employee exit date on record: {t.employee ? new Date(t.lastWorkingDay).toLocaleDateString('en-GB', { dateStyle: 'long' }) : '—'}.
          </p>
        </CardContent>
      </Card>
    )
  }

  return null
}
