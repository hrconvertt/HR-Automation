'use client'

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Trash2, Upload, X, Paperclip, RotateCcw } from 'lucide-react'
import { RequestDocumentsButton } from '@/components/request-documents-button'

interface Task {
  id: string
  title: string
  description: string | null
  owner: string
  category: string
  orderIndex: number
  isComplete: boolean
  completedAt: string | null
  status: string                  // PENDING | IN_PROGRESS | COMPLETED | NOT_REQUIRED
  notRequiredReason: string | null
  attachedDocumentId: string | null
  documentType: string | null
  isEmployeeUploadable: boolean
}

interface Props {
  employeeId: string
  checklistId: string
  day1Schedule: string
  /** A draft built from the role, shown when nothing has been saved yet. */
  day1Suggestion?: string
  notes: string
  tasks: Task[]
  canEdit: boolean
  canMarkComplete: boolean
  viewerRole: string
  joiningDate: string
  employeeName: string
  toEmail?: string | null
  documentsRequestedAt?: string | null
  infoFormSubmittedAt?: string | null
}

// "Custom Tasks" (OTHER) deliberately not rendered — HR no longer wants
// ad-hoc task creation in this workspace. Existing OTHER rows in the DB
// are retained (no data deleted) but hidden from the UI.
const CATEGORY_ORDER = ['PRE_ARRIVAL', 'DAY_1', 'WEEK_1_PAPERWORK', 'WEEK_1_IT']
const CATEGORY_LABELS: Record<string, string> = {
  PRE_ARRIVAL: 'Pre-Arrival',
  DAY_1: 'Day 1',
  WEEK_1_PAPERWORK: 'Week 1 — Paperwork',
  WEEK_1_IT: 'Week 1 — IT & Access',
}

// Tasks that look like document uploads — match either by the explicit
// isEmployeeUploadable flag, by documentType being set, or by a keyword in
// the title for the broader Workday-style set (NDA, agreement, offer letter,
// bank details).
function isDocumentTask(t: Task): boolean {
  if (t.isEmployeeUploadable) return true
  if (t.documentType) return true
  const lower = t.title.toLowerCase()
  return (
    lower.includes('cnic') ||
    lower.includes('photo') ||
    lower.includes('address proof') ||
    lower.includes('education') ||
    lower.includes('experience') ||
    lower.includes('nda') ||
    lower.includes('agreement') ||
    lower.includes('offer letter') ||
    lower.includes('bank') ||
    lower.includes('handbook')
  )
}

export function OnboardingWorkspace(props: Props) {
  const router = useRouter()
  const [tasks, setTasks] = useState(props.tasks)
  // Start from what is saved; fall back to the generated draft so the box is
  // never blank. Saving is still explicit — leaving the page without touching
  // it writes nothing.
  const [day1, setDay1] = useState(props.day1Schedule || props.day1Suggestion || '')
  const isDraft = !props.day1Schedule && day1 === props.day1Suggestion
  const [notes, setNotes] = useState(props.notes)
  const [pending, startTransition] = useTransition()
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [notRequiredFor, setNotRequiredFor] = useState<Task | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  function applyTask(t: { id: string } & Partial<Task>) {
    setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, ...t } as Task : x))
  }

  async function markComplete(t: Task) {
    setBusyTaskId(t.id)
    const res = await fetch(`/api/onboarding/tasks/${t.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (res.ok) {
      const { task } = await res.json()
      applyTask(task)
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }))
      alert(error || 'Failed to mark complete')
    }
    setBusyTaskId(null)
    startTransition(() => router.refresh())
  }

  async function undoTask(t: Task) {
    setBusyTaskId(t.id)
    // Both /complete and /not-required accept { undo: true }; pick the route
    // based on the current state.
    const endpoint = t.status === 'NOT_REQUIRED'
      ? `/api/onboarding/tasks/${t.id}/not-required`
      : `/api/onboarding/tasks/${t.id}/complete`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ undo: true }),
    })
    if (res.ok) {
      const { task } = await res.json()
      applyTask(task)
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }))
      alert(error || 'Failed to undo')
    }
    setBusyTaskId(null)
    startTransition(() => router.refresh())
  }

  async function uploadForTask(t: Task, file: File) {
    setBusyTaskId(t.id)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`/api/onboarding/tasks/${t.id}/upload`, { method: 'POST', body: fd })
    if (res.ok) {
      const { task } = await res.json()
      applyTask(task)
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Upload failed' }))
      alert(error || 'Upload failed')
    }
    setBusyTaskId(null)
    startTransition(() => router.refresh())
  }

  async function submitNotRequired(t: Task, reason: string) {
    setBusyTaskId(t.id)
    const res = await fetch(`/api/onboarding/tasks/${t.id}/not-required`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    if (res.ok) {
      const { task } = await res.json()
      applyTask(task)
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }))
      alert(error || 'Failed to mark not required')
    }
    setBusyTaskId(null)
    setNotRequiredFor(null)
    startTransition(() => router.refresh())
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return
    const res = await fetch(`/api/onboarding/tasks/${id}`, { method: 'DELETE' })
    if (res.ok) setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  async function saveDay1() {
    await fetch(`/api/onboarding/${props.employeeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day1ScheduleJson: day1, notes }),
    })
    startTransition(() => router.refresh())
  }

  async function markFullyOnboarded() {
    if (!confirm('Mark this employee as fully onboarded?')) return
    const res = await fetch(`/api/onboarding/${props.employeeId}/complete`, { method: 'POST' })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }))
      alert(error || 'Failed')
      return
    }
    startTransition(() => router.refresh())
  }

  async function applyStandardChecklist() {
    if (!confirm('Apply the standard Convertt onboarding checklist to this employee?')) return
    setBusyTaskId('__template__')
    const res = await fetch(`/api/onboarding/${props.employeeId}/apply-template`, { method: 'POST' })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }))
      alert(error || 'Failed to apply checklist')
    }
    setBusyTaskId(null)
    startTransition(() => router.refresh())
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: tasks.filter((t) => t.category === cat).sort((a, b) => a.orderIndex - b.orderIndex),
  })).filter((g) => g.items.length > 0)

  // Compute the precise reason the "Mark Fully Onboarded" button is blocked,
  // so HR sees exactly what's holding them up rather than a silent disabled state.
  // The same gating rules live server-side in /api/onboarding/[employeeId]/complete:
  //   1. Every task must be COMPLETED or NOT_REQUIRED
  //   2. Employee must be ≥ 30 days from joiningDate
  // Hidden OTHER (Custom) tasks still count — server enforces the gate, so we
  // include them in the client-side calculation to keep the tooltip honest.
  const allOnboardingTasks = tasks // includes hidden OTHER rows
  const pendingCount = allOnboardingTasks.filter(
    (t) => !(t.isComplete || t.status === 'COMPLETED' || t.status === 'NOT_REQUIRED'),
  ).length
  const daysSinceJoin = Math.floor(
    (Date.now() - new Date(props.joiningDate).getTime()) / 86400000,
  )
  const daysShort = Math.max(0, 30 - daysSinceJoin)
  const blockerParts: string[] = []
  if (pendingCount > 0) blockerParts.push(`${pendingCount} task${pendingCount === 1 ? '' : 's'} pending`)
  if (daysShort > 0) {
    blockerParts.push(`Employee has been here ${daysSinceJoin} day${daysSinceJoin === 1 ? '' : 's'} (need 30)`)
  }
  const blockerTooltip = blockerParts.length > 0
    ? `Blocked: ${blockerParts.join(' · ')}`
    : ''

  return (
    <div className="space-y-5">
      {/* The information intake and the document request — the first two things
          that happen once the record exists. */}
      <Card className="rounded-xl border-slate-200 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-900">Employee information form</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {props.infoFormSubmittedAt
              ? `Submitted ${new Date(props.infoFormSubmittedAt).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })} — the details are on the record.`
              : 'The five sections from the old Google form — filled once, straight onto the record.'}
          </p>
        </div>
        <Link href={`/dashboard/onboarding/${props.employeeId}/intake`}>
          <Button size="sm" variant={props.infoFormSubmittedAt ? 'outline' : 'default'}>
            {props.infoFormSubmittedAt ? 'View / edit' : 'Open the form'}
          </Button>
        </Link>
      </Card>

      {props.canEdit && (
        <Card className="rounded-xl border-slate-200 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-slate-900">Onboarding documents</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {props.documentsRequestedAt
                ? `Requested ${new Date(props.documentsRequestedAt).toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })} — send a reminder any time.`
                : 'Ask ' + props.employeeName.split(' ')[0] + ' for the papers we still need before Day 1.'}
            </p>
          </div>
          <RequestDocumentsButton
            employeeId={props.employeeId}
            toEmail={props.toEmail}
            variant="default"
            label={props.documentsRequestedAt ? 'Request again' : 'Request documents'}
          />
        </Card>
      )}

      {/* Day-3 paperwork. The letter, the agreement and the NDA are signed in
          the first days on the job, so they belong in onboarding rather than
          on the profile's action row. Each is generated from the record and
          opens editable with signature slots. */}
      {props.canEdit && (
        <Card className="rounded-xl border-slate-200 overflow-hidden">
          <div className="flex items-start justify-between gap-4 p-4 border-b border-slate-100">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Day-3 documents</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Signed in the first days on the job. Generated from the record — edit the wording before printing.
              </p>
            </div>
            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border whitespace-nowrap flex-shrink-0 ${
              daysSinceJoin >= 3
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}>
              {daysSinceJoin >= 3
                ? 'Due now'
                : `Due in ${3 - daysSinceJoin} day${3 - daysSinceJoin === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {[
              { type: 'offer_letter', name: 'Employment Letter', sub: 'Offer and terms, composed from the record' },
              { type: 'employment_agreement', name: 'Employment Agreement', sub: 'Appointment, salary, probation, leave and conduct' },
              { type: 'nda', name: 'NDA', sub: 'Confidentiality, intellectual property and non-disparagement' },
              // Issued at the end of probation rather than on Day 3, but it is
              // the fourth document in the same set, so it is generated from
              // the same place rather than hunted for elsewhere.
              { type: 'confirmation_letter', name: 'Letter of Employment Confirmation', sub: 'Issued once probation is completed — confirms permanent status and notice period' },
            ].map((doc) => (
              <div key={doc.type} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{doc.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{doc.sub}</p>
                </div>
                <a
                  href={`/api/documents/generate?type=${doc.type}&employeeId=${props.employeeId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0"
                >
                  <Button size="sm" variant="outline">Generate</Button>
                </a>
              </div>
            ))}
            {/* The outcome email is written from the review — ratings, overall
                assessment and the salary arithmetic — so it is composed on the
                review form rather than generated from the record like the four
                above. It belongs beside them all the same: the confirmation
                letter and the email that carries it go out together. */}
            <div className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50/60 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">Review outcome email</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Confirmation and salary revision, written from the probation review — edit before sending
                </p>
              </div>
              <Link href={`/dashboard/probation/${props.employeeId}/review`} className="flex-shrink-0">
                <Button size="sm" variant="outline">Open review</Button>
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* Day 1 schedule */}
      <Card className="rounded-xl border-slate-200 p-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
          <h3 className="text-sm font-semibold text-slate-900">Day 1 Schedule</h3>
          {props.canEdit && isDraft && (
            <span className="text-[11px] text-slate-500">
              Drafted from the role — edit anything, then click out to save.
            </span>
          )}
          {props.canEdit && props.day1Suggestion && !isDraft && (
            <button
              type="button"
              onClick={() => setDay1(props.day1Suggestion ?? '')}
              className="text-[11px] text-slate-500 underline hover:text-slate-900"
            >
              Reset to the suggested schedule
            </button>
          )}
        </div>
        {props.canEdit ? (
          <textarea
            value={day1}
            onChange={(e) => setDay1(e.target.value)}
            onBlur={saveDay1}
            placeholder="e.g.&#10;09:00 - Welcome & coffee with manager&#10;10:00 - HR orientation&#10;11:00 - Office tour..."
            className="w-full min-h-[120px] border border-slate-200 rounded-md p-3 text-sm font-mono"
          />
        ) : (
          <pre className="text-xs text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded">{day1 || 'No schedule set yet.'}</pre>
        )}
      </Card>

      {/* Empty workspace — offer the standard template (HR only) */}
      {tasks.length === 0 && (
        <Card className="rounded-xl border-slate-200 border-dashed p-8 text-center">
          <p className="text-sm text-slate-600 font-medium">No onboarding tasks yet.</p>
          <p className="text-xs text-slate-500 mt-1">This checklist was created before per-hire task seeding. Apply the standard 17-item Convertt checklist to get started.</p>
          {props.canEdit && (
            <Button
              className="mt-4"
              disabled={busyTaskId === '__template__' || pending}
              onClick={applyStandardChecklist}
              title="Seed the standard Convertt onboarding checklist for this employee"
            >
              {busyTaskId === '__template__' ? 'Applying…' : 'Apply Standard Checklist'}
            </Button>
          )}
        </Card>
      )}

      {/* Task groups */}
      {grouped.map(({ cat, items }) => {
        const completedCount = items.filter((i) => i.status === 'COMPLETED' || i.status === 'NOT_REQUIRED' || i.isComplete).length
        return (
          <Card key={cat} className="rounded-xl border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">{CATEGORY_LABELS[cat]}</h3>
              <p className="text-xs text-slate-500">{completedCount} / {items.length} done</p>
            </div>
            <div className="space-y-2">
              {items.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No tasks.</p>
              ) : items.map((t) => {
                const isHR = props.viewerRole === 'HR_ADMIN'
                const isExecutive = props.viewerRole === 'EXECUTIVE'
                // Action visibility:
                //   - HR or the assigned manager (canEdit at this layer ≡ HR;
                //     manager visibility is implied by the page-level auth gate).
                //   - The hire themselves for EMPLOYEE-owned or uploadable tasks.
                const canAct = !isExecutive && (props.canEdit
                  || t.owner === props.viewerRole
                  || (t.owner === 'IT' && isHR)
                  || (props.viewerRole === 'EMPLOYEE' && (t.owner === 'EMPLOYEE' || t.isEmployeeUploadable)))
                // "Not required" is HR or the assigned manager only — employees can't
                // skip their own tasks (that's a manager call).
                const canMarkNotRequired = !isExecutive && (isHR || props.viewerRole === 'MANAGER')

                const isDocTask = isDocumentTask(t)
                const isDone = t.status === 'COMPLETED' || t.isComplete
                const isSkipped = t.status === 'NOT_REQUIRED'
                const isPendingState = !isDone && !isSkipped
                const rowBusy = busyTaskId === t.id || pending

                return (
                  <div key={t.id} className={`rounded-lg p-3 border ${isDone ? 'bg-slate-50 border-slate-100' : isSkipped ? 'bg-slate-50/60 border-slate-100' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-start gap-3">
                      {/* No tick box. Mark Done and Not Required are the two
                          actions, and a third control that did the same thing as
                          one of them only invited the question of which was
                          authoritative. Status is on the row already. */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${isDone ? 'line-through text-slate-500' : isSkipped ? 'text-slate-500' : 'text-slate-900'}`}>{t.title}</p>
                        {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                        <p className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">
                          Status: {t.status.replace('_', ' ').toLowerCase()} · Owner: {t.owner}
                          {t.completedAt && (isDone || isSkipped) ? ` · ${new Date(t.completedAt).toLocaleDateString()}` : ''}
                        </p>

                        {isSkipped && t.notRequiredReason && (
                          <p className="text-xs text-slate-600 mt-1 italic">&ldquo;{t.notRequiredReason}&rdquo;</p>
                        )}

                        {isDone && t.attachedDocumentId && (
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <Paperclip className="w-3 h-3 text-slate-500" />
                            <a
                              href={`/api/documents/${t.attachedDocumentId}/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-700 underline hover:text-slate-900"
                            >
                              View document
                            </a>
                          </div>
                        )}

                        {canAct && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {isPendingState && (
                              <>
                                <Button size="sm" variant="outline" disabled={rowBusy} onClick={() => markComplete(t)} title="Mark this task as completed">
                                  <Check className="w-3 h-3 mr-1" /> Mark Done
                                </Button>
                                {isDocTask && (
                                  <>
                                    <input
                                      type="file"
                                      ref={(el) => { fileInputs.current[t.id] = el }}
                                      className="hidden"
                                      accept=".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                      onChange={(e) => {
                                        const f = e.target.files?.[0]
                                        if (f) uploadForTask(t, f)
                                        e.target.value = ''
                                      }}
                                    />
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={rowBusy}
                                      onClick={() => fileInputs.current[t.id]?.click()}
                                      title="Attach a document (PDF, image, or Word) — completes the task"
                                    >
                                      <Upload className="w-3 h-3 mr-1" /> Upload
                                    </Button>
                                  </>
                                )}
                                {canMarkNotRequired && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={rowBusy}
                                    onClick={() => setNotRequiredFor(t)}
                                    title="Skip this task with a reason — counts as resolved"
                                  >
                                    <X className="w-3 h-3 mr-1" /> Not Required
                                  </Button>
                                )}
                              </>
                            )}
                            {(isDone || isSkipped) && (
                              <Button size="sm" variant="ghost" disabled={rowBusy} onClick={() => undoTask(t)} title={isSkipped ? 'Move this task back to pending' : 'Undo completion — move back to pending'}>
                                <RotateCcw className="w-3 h-3 mr-1" /> {isSkipped ? 'Reactivate' : 'Undo'}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      {props.canEdit && (
                        <button
                          type="button"
                          onClick={() => deleteTask(t.id)}
                          className="text-slate-400 hover:text-slate-700 p-1"
                          title="Delete task"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })}

      {/* Custom Tasks (Add Task) — removed per HR request. Existing custom
          task data is retained in the DB but no longer rendered. */}

      {/* Notes */}
      <Card className="rounded-xl border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">Notes</h3>
        {props.canEdit ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveDay1}
            className="w-full min-h-[80px] border border-slate-200 rounded-md p-3 text-sm"
          />
        ) : (
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{notes || '—'}</p>
        )}
      </Card>

      {/* Mark fully onboarded */}
      {props.canEdit && (
        <Card className="rounded-xl border-slate-200 p-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Mark Onboarding Complete</h3>
            <p className="text-xs text-slate-500 mt-1">Enabled when all tasks are done (or marked not required) AND the employee has been here ≥ 30 days.</p>
            {!props.canMarkComplete && blockerTooltip && (
              <p className="text-xs text-slate-700 mt-1 font-medium">{blockerTooltip}</p>
            )}
          </div>
          <Button
            onClick={markFullyOnboarded}
            disabled={!props.canMarkComplete}
            title={!props.canMarkComplete ? (blockerTooltip || 'Not eligible yet.') : 'Mark this hire as fully onboarded'}
          >
            Mark Fully Onboarded
          </Button>
        </Card>
      )}

      {notRequiredFor && (
        <NotRequiredDialog
          task={notRequiredFor}
          onCancel={() => setNotRequiredFor(null)}
          onConfirm={(reason) => submitNotRequired(notRequiredFor, reason)}
        />
      )}
    </div>
  )
}

function NotRequiredDialog({ task, onCancel, onConfirm }: { task: Task; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-slate-900">Mark &ldquo;{task.title}&rdquo; as not required</h3>
        <p className="text-xs text-slate-500 mt-1">This task will be counted as completed for progress %, but no work was done. Useful for things HR doesn&rsquo;t do yet (e.g. ID Cards).</p>
        <label className="block mt-3">
          <span className="text-xs font-medium text-slate-700">Reason (optional)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. We don't issue ID cards yet"
            className="mt-1 w-full border border-slate-200 rounded-md p-2 text-sm"
            rows={3}
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={() => onConfirm(reason)}>Mark Not Required</Button>
        </div>
      </div>
    </div>
  )
}
