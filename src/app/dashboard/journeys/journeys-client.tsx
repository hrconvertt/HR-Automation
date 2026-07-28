'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import {
  UserPlus, UserMinus, Plus, CheckCircle2, Clock, ChevronDown, ChevronRight,
  Calendar, Users, Briefcase, Shield, Coffee, Paperclip, Upload, Sparkles, FileText,
} from 'lucide-react'
import {
  ROLE_LABELS, CATEGORY_LABELS, PHASES_ONBOARDING, PHASES_OFFBOARDING,
} from '@/lib/journey-templates'
import { getInitials, formatDate } from '@/lib/utils'
import GenerateDocumentDialog from '@/components/generate-document-dialog'

type JourneyTask = {
  id: string
  title: string
  description: string | null
  category: string
  phase: string
  assignedToRole: string | null
  dueDate: string | null
  status: string
  blocking: boolean
  sortOrder: number
  notes: string | null
}

type Journey = {
  id: string
  employeeId: string
  type: string
  status: string
  reason: string | null
  noticePeriodDays: number | null
  startDate: string
  targetEndDate: string | null
  actualEndDate: string | null
  buddyId: string | null
  successorId: string | null
  notes: string | null
  employee: {
    id: string
    fullName: string
    employeeCode: string
    designation: string
    joiningDate: string | null
    department: { name: string } | null
  }
  tasks: JourneyTask[]
}

type Employee = { id: string; fullName: string; employeeCode: string; status: string }

const OFFBOARDING_REASONS = [
  { value: 'RESIGNATION', label: 'Resignation' },
  { value: 'TERMINATION_PERFORMANCE', label: 'Termination — Performance' },
  { value: 'TERMINATION_MISCONDUCT', label: 'Termination — Misconduct' },
  { value: 'MUTUAL', label: 'Mutual Separation' },
  { value: 'RETIREMENT', label: 'Retirement' },
  { value: 'LAYOFF', label: 'Layoff' },
  { value: 'END_OF_CONTRACT', label: 'End of Contract' },
]

export default function JourneysClient({ effectiveRole, myEmployeeId }: { effectiveRole: string; myEmployeeId: string | null }) {
  const [tab, setTab] = useState<'ONBOARDING' | 'OFFBOARDING'>('ONBOARDING')
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const isHR = effectiveRole === 'HR_ADMIN'

  const fetchJourneys = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/journeys?type=${tab}`)
    const data = await res.json()
    setJourneys(data.journeys ?? [])
    setLoading(false)
  }, [tab])

  useEffect(() => { fetchJourneys() }, [fetchJourneys])

  // Auto-expand if employee role and there's exactly one journey (theirs)
  useEffect(() => {
    if (effectiveRole === 'EMPLOYEE' && journeys.length === 1 && !expandedId) {
      setExpandedId(journeys[0].id)
    }
  }, [effectiveRole, journeys, expandedId])

  const active = journeys.filter((j) => j.status === 'IN_PROGRESS')
  const completed = journeys.filter((j) => j.status === 'COMPLETED')

  const titleByTab = {
    ONBOARDING: { name: 'Onboarding', icon: UserPlus, blurb: 'New joiner workflows — pre-boarding through 90-day confirmation' },
    OFFBOARDING: { name: 'Offboarding', icon: UserMinus, blurb: 'Separation workflows — notice, last-day events, F&F settlement' },
  } as const

  return (
    <div className="space-y-5">

      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employee Journeys</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {effectiveRole === 'EMPLOYEE' ? 'Your onboarding & offboarding tasks' :
             effectiveRole === 'MANAGER' ? 'Tasks for your team\'s joiners & leavers' :
             'Business processes — track onboarding & offboarding'}
          </p>
        </div>
        {isHR && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Start {tab === 'ONBOARDING' ? 'Onboarding' : 'Offboarding'}
          </Button>
        )}
      </div>

      {/* ─── Tabs ───────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-200">
        {(['ONBOARDING', 'OFFBOARDING'] as const).map((t) => {
          const Icon = titleByTab[t].icon
          return (
            <button
              key={t}
              onClick={() => { setTab(t); setExpandedId(null) }}
              className={
                'px-5 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ' +
                (tab === t ? 'border-slate-700 text-slate-700' : 'border-transparent text-slate-500 hover:text-slate-700')
              }
            >
              <Icon className="w-4 h-4" />
              {titleByTab[t].name}
              {journeys.length > 0 && tab === t && (
                <span className="text-[10px] bg-slate-200 text-slate-700 rounded-full px-1.5 py-0.5 font-semibold">{journeys.length}</span>
              )}
            </button>
          )
        })}
      </div>

      <p className="text-xs text-slate-500">{titleByTab[tab].blurb}</p>

      {/* ─── Active journeys ────────────────────────────────────── */}
      {loading ? (
        <p className="text-center text-slate-400 py-10">Loading…</p>
      ) : active.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-slate-400">
            {tab === 'ONBOARDING' ? <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-40" /> : <UserMinus className="w-8 h-8 mx-auto mb-2 opacity-40" />}
            <p>No active {tab.toLowerCase()} journeys.</p>
            {isHR && <p className="text-xs mt-2">Click the button above to start one.</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {active.map((j) => (
            <JourneyCard
              key={j.id}
              journey={j}
              expanded={expandedId === j.id}
              onToggle={() => setExpandedId(expandedId === j.id ? null : j.id)}
              onTaskUpdate={fetchJourneys}
              effectiveRole={effectiveRole}
              myEmployeeId={myEmployeeId}
            />
          ))}
        </div>
      )}

      {/* ─── Completed (collapsed below) ────────────────────────── */}
      {completed.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700">
            Completed ({completed.length})
          </summary>
          <div className="space-y-2 mt-3">
            {completed.map((j) => (
              <Card key={j.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-bold">
                      {getInitials(j.employee.fullName)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{j.employee.fullName}</p>
                      <p className="text-[11px] text-slate-500">
                        Completed {j.actualEndDate ? formatDate(new Date(j.actualEndDate)) : '—'}
                      </p>
                    </div>
                  </div>
                  <Badge variant="success">Completed</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}

      {/* ─── Create dialog (HR only) ────────────────────────────── */}
      {isHR && createOpen && (
        <CreateJourneyDialog
          type={tab}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); fetchJourneys() }}
        />
      )}
    </div>
  )
}

// ─── Journey Card ────────────────────────────────────────────────────────────

function JourneyCard({ journey, expanded, onToggle, onTaskUpdate, effectiveRole, myEmployeeId }: {
  journey: Journey; expanded: boolean; onToggle: () => void; onTaskUpdate: () => void;
  effectiveRole: string; myEmployeeId: string | null;
}) {
  const total = journey.tasks.length
  const done = journey.tasks.filter((t) => t.status === 'COMPLETED').length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const blockedCount = journey.tasks.filter((t) => t.blocking && t.status !== 'COMPLETED').length

  const phases = journey.type === 'ONBOARDING' ? PHASES_ONBOARDING : PHASES_OFFBOARDING

  return (
    <Card>
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-4 text-left hover:bg-slate-50/60"
      >
        <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-sm font-bold shrink-0">
          {getInitials(journey.employee.fullName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-900">{journey.employee.fullName}</p>
            <span className="text-xs text-slate-400">{journey.employee.employeeCode}</span>
            {journey.reason && <Badge variant="secondary">{OFFBOARDING_REASONS.find(r => r.value === journey.reason)?.label ?? journey.reason}</Badge>}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {journey.employee.designation} · {journey.employee.department?.name ?? '—'}
            {journey.targetEndDate && (
              <>
                <span className="mx-2">·</span>
                <Calendar className="w-3 h-3 inline mr-0.5" />
                {journey.type === 'ONBOARDING' ? 'Probation ends' : 'Last day'}{' '}
                {formatDate(new Date(journey.targetEndDate))}
              </>
            )}
          </p>
        </div>
        <div className="hidden sm:block w-48">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={pct === 100 ? 'h-full bg-slate-500' : 'h-full bg-slate-500'}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-slate-700 tabular-nums w-12 text-right">{done}/{total}</span>
          </div>
          {blockedCount > 0 && (
            <p className="text-[10px] text-slate-700 mt-1 text-right">{blockedCount} blocking task{blockedCount > 1 ? 's' : ''} open</p>
          )}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-5 space-y-5 bg-slate-50/30">
          {phases.map((p) => {
            const tasks = journey.tasks.filter((t) => t.phase === p.key)
            if (tasks.length === 0) return null
            const phaseDone = tasks.every((t) => t.status === 'COMPLETED')
            return (
              <div key={p.key}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ' +
                    (phaseDone ? 'bg-slate-500 text-white' : 'bg-slate-200 text-slate-600')
                  }>
                    {phaseDone ? '✓' : phases.findIndex((x) => x.key === p.key) + 1}
                  </div>
                  <h3 className="text-[11px] uppercase tracking-[0.2em] text-slate-700 font-semibold">{p.label}</h3>
                  <span className="text-[10px] text-slate-400">{p.description}</span>
                </div>
                <div className="space-y-1.5 ml-7">
                  {tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      journeyId={journey.id}
                      employeeId={journey.employeeId}
                      employeeName={journey.employee.fullName}
                      effectiveRole={effectiveRole}
                      myEmployeeId={myEmployeeId}
                      defaultLastWorkingDay={journey.targetEndDate}
                      defaultEffectiveDate={journey.employee.joiningDate ?? null}
                      onUpdate={onTaskUpdate}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ─── Task Row ────────────────────────────────────────────────────────────────

function TaskRow({
  task, journeyId, employeeId, employeeName, effectiveRole, myEmployeeId,
  defaultLastWorkingDay, defaultEffectiveDate, onUpdate,
}: {
  task: JourneyTask; journeyId: string; employeeId: string; employeeName: string;
  effectiveRole: string; myEmployeeId: string | null;
  defaultLastWorkingDay: string | null; defaultEffectiveDate: string | null;
  onUpdate: () => void;
}) {
  const [busy, setBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Can this viewer complete this task?
  const isHR = effectiveRole === 'HR_ADMIN'
  const isOwner = myEmployeeId === employeeId
  const isManager = effectiveRole === 'MANAGER'
  const canAct = isHR
    || (task.assignedToRole === 'EMPLOYEE' && isOwner)
    || (task.assignedToRole === 'MANAGER' && isManager)

  const done = task.status === 'COMPLETED'
  const isOverdue = !done && task.dueDate && new Date(task.dueDate) < new Date()

  // Parse template metadata from notes JSON
  let templateUrl: string | undefined
  let generateType: string | undefined
  let requiresUpload = false
  if (task.notes) {
    try {
      const meta = JSON.parse(task.notes)
      if (typeof meta?.templateUrl === 'string') templateUrl = meta.templateUrl
      if (typeof meta?.generateType === 'string') generateType = meta.generateType
      if (meta?.requiresUpload === true) requiresUpload = true
    } catch { /* notes might be plain text — ignore */ }
  }


  async function toggle() {
    if (!canAct) return
    setBusy(true)
    await fetch(`/api/journeys/${journeyId}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: done ? 'PENDING' : 'COMPLETED' }),
    })
    setBusy(false)
    onUpdate()
  }

  const roleIcon = task.assignedToRole === 'EMPLOYEE' ? Users :
                   task.assignedToRole === 'MANAGER' ? Briefcase :
                   task.assignedToRole === 'IT' ? Shield :
                   task.assignedToRole === 'FINANCE' ? Briefcase :
                   task.assignedToRole === 'BUDDY' ? Coffee :
                   Users

  const RoleIcon = roleIcon

  return (
    <div className={
      'flex items-start gap-3 p-2.5 rounded-md border ' +
      (done ? 'bg-slate-50/60 border-slate-100' :
       isOverdue ? 'bg-slate-50/60 border-slate-100' :
       'bg-white border-slate-200')
    }>
      <button
        onClick={toggle}
        disabled={!canAct || busy}
        className={
          'mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ' +
          (done ? 'bg-slate-500 border-slate-500 text-white' :
           canAct ? 'border-slate-300 hover:border-slate-500 cursor-pointer' :
           'border-slate-200 cursor-not-allowed opacity-50')
        }
        title={canAct ? (done ? 'Mark incomplete' : 'Mark complete') : 'You don\'t own this task'}
      >
        {done && <CheckCircle2 className="w-3 h-3" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={'text-sm ' + (done ? 'line-through text-slate-500' : 'text-slate-900')}>
          {task.title}
          {task.blocking && !done && <span className="ml-2 text-[10px] bg-slate-100 text-slate-900 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">Blocking</span>}
        </p>
        {task.description && (
          <p className="text-[11px] text-slate-500 mt-0.5">{task.description}</p>
        )}
        {(generateType || templateUrl || requiresUpload) && (
          <div className="flex items-center gap-3 mt-1.5">
            {generateType && (
              <button
                onClick={() => setDialogOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] text-slate-700 bg-slate-50 hover:bg-slate-100 rounded px-2 py-0.5 font-medium"
              >
                <Sparkles className="w-3 h-3" /> Generate document
              </button>
            )}
            {templateUrl && !generateType && (
              <a
                href={templateUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:underline"
              >
                <FileText className="w-3 h-3" /> Reference template
              </a>
            )}
            {requiresUpload && canAct && !done && (
              <button
                disabled
                title="Upload coming soon — for now, tick the box once you've sent the signed copy to HR."
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 cursor-not-allowed"
              >
                <Upload className="w-3 h-3" /> Upload signed copy
              </button>
            )}
          </div>
        )}

        {dialogOpen && generateType && (
          <GenerateDocumentDialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            type={generateType}
            employeeId={employeeId}
            employeeName={employeeName}
            defaults={{
              lastWorkingDay: defaultLastWorkingDay ? defaultLastWorkingDay.split('T')[0] : undefined,
              effectiveDate: defaultEffectiveDate ? defaultEffectiveDate.split('T')[0] : undefined,
            }}
          />
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 text-xs text-slate-500">
        {task.assignedToRole && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            <RoleIcon className="w-3 h-3" />
            {ROLE_LABELS[task.assignedToRole as keyof typeof ROLE_LABELS] ?? task.assignedToRole}
          </span>
        )}
        {task.dueDate && (
          <span className={isOverdue ? 'text-slate-700 font-semibold' : ''}>
            {isOverdue && <Clock className="w-3 h-3 inline mr-0.5" />}
            {formatDate(new Date(task.dueDate))}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Create Dialog ───────────────────────────────────────────────────────────

function CreateJourneyDialog({ type, onClose, onCreated }: {
  type: 'ONBOARDING' | 'OFFBOARDING'; onClose: () => void; onCreated: () => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [reason, setReason] = useState('RESIGNATION')
  const [noticePeriodDays, setNoticePeriodDays] = useState(30)
  const [targetEndDate, setTargetEndDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]
  })
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/employees?limit=200&status=ACTIVE')
      .then((r) => r.json())
      .then((d) => setEmployees((d.employees ?? d.items ?? []).filter((e: Employee) => e.status === 'ACTIVE')))
  }, [])

  async function handleCreate() {
    setError('')
    if (!employeeId) { setError('Pick an employee'); return }
    setSaving(true)
    const res = await fetch('/api/journeys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId, type,
        ...(type === 'OFFBOARDING' ? { reason, noticePeriodDays, targetEndDate } : {}),
        notes,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Failed'); return }
    onCreated()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Start {type === 'ONBOARDING' ? 'Onboarding' : 'Offboarding'} Journey</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Employee *</label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Select an employee…" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === 'OFFBOARDING' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OFFBOARDING_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notice Period (days)</label>
                  <Input type="number" min={0} value={noticePeriodDays} onChange={(e) => setNoticePeriodDays(parseInt(e.target.value) || 0)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Last Working Day</label>
                  <Input type="date" value={targetEndDate} onChange={(e) => setTargetEndDate(e.target.value)} />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
              placeholder="Optional context…"
            />
          </div>

          {error && (
            <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>
          )}

          <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-xs text-slate-900">
            <p className="font-semibold mb-1">What happens next:</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-900">
              <li>{type === 'ONBOARDING' ? 'Up to 25' : 'Up to 17'} tasks created across phases — filtered by employment type{type === 'OFFBOARDING' ? ' and separation reason' : ''}</li>
              <li>Auto-assigned to HR / Manager / IT / Finance / Employee / Buddy</li>
              <li>Documents (offer letter, agreement, NDA, termination, experience letter, exit clearance) auto-generate from employee data — click <strong>✨ Generate document</strong> on any task</li>
              <li>The employee + their manager get an in-app notification</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating…' : `Start ${type === 'ONBOARDING' ? 'Onboarding' : 'Offboarding'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
