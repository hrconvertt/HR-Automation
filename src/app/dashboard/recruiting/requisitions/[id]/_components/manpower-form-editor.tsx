'use client'

/**
 * The Manpower Requisition Form, on screen.
 *
 * The paper form is five blocks: the position, the terms of the appointment,
 * the department's existing headcount, the role's requirements, and the
 * approval chain. The screen keeps that order and stacks them full width,
 * because the form is worked top to bottom and nothing on it is a sidebar.
 *
 * The note on the form is not decoration — "all the fields provided are
 * mandatory" — so the header counts what is still blank rather than letting a
 * half-filled form look finished.
 */
import { useState, useCallback, useMemo } from 'react'

export interface ManpowerState {
  jobCode: string; costCenter: string; designation: string
  noOfPositions: string
  appointmentType: string
  sanctioned: boolean | null
  jdAttached: boolean | null
  contractDuration: string
  workDescription: string
  currentPermanent: string; currentTemporary: string; currentConsultants: string
  grade: string; departmentHead: string; reportingHead: string
  requirementNature: string; replacingWhom: string
  qualificationMust: string; qualificationAdditional: string
  desiredExperience: string; skills: string; placeOfWork: string
  fillBy: string
  requestedBy: string; requisitionDate: string
  divisionHead: string; divisionHeadDate: string
  headHr: string; headHrDate: string
  director: string; directorDate: string
  managingDirector: string; managingDirectorDate: string
  status: string
}

const NATURE = [
  { value: 'REPLACEMENT', label: 'Replacement' },
  { value: 'ADDITION', label: 'Addition to existing resource' },
  { value: 'NEW_POSITION', label: 'A new position altogether' },
]

export function ManpowerFormEditor({
  formId, department, canEdit, initial,
}: {
  formId: string
  department: string
  canEdit: boolean
  initial: ManpowerState
}) {
  const [s, setS] = useState<ManpowerState>(initial)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [dirty, setDirty] = useState(false)

  const set = useCallback(<K extends keyof ManpowerState>(k: K, v: ManpowerState[K]) => {
    setS((prev) => ({ ...prev, [k]: v }))
    setDirty(true); setMsg('')
  }, [])

  // Every field on the form is mandatory, so say how many are not yet filled
  // rather than letting a blank one through to the approvers.
  const blanks = useMemo(() => {
    const required: (keyof ManpowerState)[] = [
      'designation', 'noOfPositions', 'appointmentType', 'workDescription',
      'grade', 'departmentHead', 'reportingHead', 'requirementNature',
      'qualificationMust', 'desiredExperience', 'skills', 'placeOfWork',
      'fillBy', 'requestedBy', 'requisitionDate',
    ]
    const empty = required.filter((k) => !String(s[k] ?? '').trim())
    if (s.sanctioned == null) empty.push('sanctioned')
    if (s.jdAttached == null) empty.push('jdAttached')
    if (s.appointmentType === 'TEMPORARY' && !s.contractDuration.trim()) {
      empty.push('contractDuration')
    }
    if (s.requirementNature === 'REPLACEMENT' && !s.replacingWhom.trim()) {
      empty.push('replacingWhom')
    }
    return empty.length
  }, [s])

  async function save(extra: Record<string, unknown> = {}) {
    setSaving(true); setMsg('')
    try {
      const res = await fetch(`/api/manpower-requisitions/${formId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...s,
          noOfPositions: num(s.noOfPositions),
          currentPermanent: num(s.currentPermanent),
          currentTemporary: num(s.currentTemporary),
          currentConsultants: num(s.currentConsultants),
          ...extra,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(d.error ?? 'Could not save.'); return }
      setDirty(false); setMsg('Saved.')
      if (typeof extra.status === 'string') set('status', extra.status)
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      {/* ── The position ─────────────────────────────────────────────── */}
      <Card title="The position">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 px-4 py-3">
          <Field label="Job code (if applicable)" value={s.jobCode}
            onChange={(v) => set('jobCode', v)} disabled={!canEdit} />
          <Field label="No. of positions" value={s.noOfPositions} type="number"
            onChange={(v) => set('noOfPositions', v)} disabled={!canEdit} />
          <Static label="Department" value={department} />
          <Field label="Designation" value={s.designation}
            onChange={(v) => set('designation', v)} disabled={!canEdit} />
          <Field label="Cost centre (if applicable)" value={s.costCenter}
            onChange={(v) => set('costCenter', v)} disabled={!canEdit} />
        </div>
      </Card>

      {/* ── The terms ────────────────────────────────────────────────── */}
      <Card title="The appointment">
        <div className="divide-y divide-slate-50">
          <Row label="State whether the proposed appointment is">
            <Choice value={s.appointmentType} disabled={!canEdit}
              onPick={(v) => set('appointmentType', v)}
              options={[
                { value: 'PERMANENT', label: 'Permanent' },
                { value: 'TEMPORARY', label: 'Temporary' },
              ]} />
          </Row>
          <Row label="Is this a sanctioned position?">
            <YesNo value={s.sanctioned} disabled={!canEdit}
              onPick={(v) => set('sanctioned', v)} />
          </Row>
          <Row label="Has the job description been attached?">
            <YesNo value={s.jdAttached} disabled={!canEdit}
              onPick={(v) => set('jdAttached', v)} />
          </Row>
          {s.appointmentType === 'TEMPORARY' && (
            <Row label="If temporary, the duration of the contract">
              <input value={s.contractDuration} disabled={!canEdit}
                onChange={(e) => set('contractDuration', e.target.value)}
                placeholder="e.g. 6 months"
                className="w-full max-w-sm text-sm rounded-lg border border-slate-200 px-3 py-1.5 disabled:bg-slate-50" />
            </Row>
          )}
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
            Work description / responsibilities
          </label>
          <p className="text-[11px] text-slate-400 mb-2">
            In detail — this is what the role is advertised and screened against, and what a
            manpower consultant is briefed from. The job description is attached separately.
          </p>
          <textarea value={s.workDescription} disabled={!canEdit} rows={7}
            onChange={(e) => set('workDescription', e.target.value)}
            className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 disabled:bg-slate-50" />
        </div>
      </Card>

      {/* ── Existing headcount ───────────────────────────────────────── */}
      <Card title="Manpower currently available in the department"
        sub="Counted from the system when the form was opened — correct it if the department knows better">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 px-4 py-3">
          <Field label="Permanent employees" value={s.currentPermanent} type="number"
            onChange={(v) => set('currentPermanent', v)} disabled={!canEdit} />
          <Field label="Temporary employees" value={s.currentTemporary} type="number"
            onChange={(v) => set('currentTemporary', v)} disabled={!canEdit} />
          <Field label="Consultants, if any" value={s.currentConsultants} type="number"
            onChange={(v) => set('currentConsultants', v)} disabled={!canEdit} />
        </div>
      </Card>

      {/* ── The requirement ──────────────────────────────────────────── */}
      <Card title="The requirement">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 px-4 py-3">
          <Field label="Grade" value={s.grade}
            onChange={(v) => set('grade', v)} disabled={!canEdit} />
          <Field label="Department head" value={s.departmentHead}
            onChange={(v) => set('departmentHead', v)} disabled={!canEdit} />
          <Field label="Reporting head" value={s.reportingHead}
            onChange={(v) => set('reportingHead', v)} disabled={!canEdit} />
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              Replacement, addition, or a new position
            </label>
            <select value={s.requirementNature} disabled={!canEdit}
              onChange={(e) => set('requirementNature', e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-1.5 bg-white disabled:bg-slate-50">
              <option value="">— not set —</option>
              {NATURE.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
            </select>
          </div>
          {s.requirementNature === 'REPLACEMENT' && (
            <Field label="Name and designation of the position being replaced"
              value={s.replacingWhom} onChange={(v) => set('replacingWhom', v)}
              disabled={!canEdit} />
          )}
          <Field label="Educational qualification (must have)" value={s.qualificationMust}
            onChange={(v) => set('qualificationMust', v)} disabled={!canEdit} />
          <Field label="Educational qualification (additional)" value={s.qualificationAdditional}
            onChange={(v) => set('qualificationAdditional', v)} disabled={!canEdit} />
          <Field label="Desired years of experience" value={s.desiredExperience}
            onChange={(v) => set('desiredExperience', v)} disabled={!canEdit} />
          <Field label="Skills" value={s.skills}
            onChange={(v) => set('skills', v)} disabled={!canEdit} />
          <Field label="Place of work" value={s.placeOfWork}
            onChange={(v) => set('placeOfWork', v)} disabled={!canEdit} />
          <Field label="Requirement to be filled by" type="date" value={s.fillBy}
            onChange={(v) => set('fillBy', v)} disabled={!canEdit} />
        </div>
      </Card>

      {/* ── The approval chain ───────────────────────────────────────── */}
      <Card title="Approvals"
        sub="Nothing is processed until this chain is complete — the form says so itself">
        <div className="divide-y divide-slate-50">
          <SignRow label="Requested by" who={s.requestedBy} date={s.requisitionDate}
            dateLabel="Requisition date" disabled={!canEdit}
            onWho={(v) => set('requestedBy', v)} onDate={(v) => set('requisitionDate', v)} />
          <SignRow label="Dept / Division head" who={s.divisionHead} date={s.divisionHeadDate}
            dateLabel="Reviewed date" disabled={!canEdit}
            onWho={(v) => set('divisionHead', v)} onDate={(v) => set('divisionHeadDate', v)} />
          <SignRow label="Head HR" who={s.headHr} date={s.headHrDate}
            dateLabel="Reviewed date" disabled={!canEdit}
            onWho={(v) => set('headHr', v)} onDate={(v) => set('headHrDate', v)} />
          <SignRow label="Director (Personnel / Finance / Technical)" who={s.director}
            date={s.directorDate} dateLabel="Approval date" disabled={!canEdit}
            onWho={(v) => set('director', v)} onDate={(v) => set('directorDate', v)} />
          <SignRow label="Chairman & Managing Director" who={s.managingDirector}
            date={s.managingDirectorDate} dateLabel="Approval date" disabled={!canEdit}
            onWho={(v) => set('managingDirector', v)} onDate={(v) => set('managingDirectorDate', v)} />
        </div>
        <p className="px-4 py-3 border-t border-slate-100 text-[11px] text-slate-400">
          Filling up this form and getting it approved is mandatory even for a temporary
          appointment. All requisitions are processed only after the necessary approvals.
        </p>
      </Card>

      {/* ── Save bar ─────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 shadow-sm">
        <button type="button" onClick={() => save()} disabled={!canEdit || saving}
          className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" disabled={!canEdit || saving}
          onClick={() => save({ status: s.status === 'APPROVED' ? 'SUBMITTED' : 'APPROVED' })}
          className="text-sm px-4 py-2 rounded-lg border border-slate-300 text-slate-900">
          {s.status === 'APPROVED' ? 'Reopen' : 'Mark approved'}
        </button>
        <a href={`/manpower-requisition/${formId}/print`} target="_blank" rel="noreferrer"
          className="text-sm px-4 py-2 rounded-lg border border-slate-300 text-slate-900">
          Print / Save as PDF
        </a>
        <span className="text-[13px] text-slate-500">
          {msg || (dirty ? 'Unsaved changes' : blanks > 0
            ? `${blanks} mandatory ${blanks === 1 ? 'field' : 'fields'} still blank`
            : 'Complete')}
        </span>
        <span className="ml-auto text-[11px] uppercase tracking-wider text-slate-400">
          {s.status}
        </span>
      </div>
    </div>
  )
}

const num = (v: string) => (v.trim() === '' ? null : Number(v))

function Card({ title, sub, children }: {
  title: string; sub?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-slate-700">{label}</span>
      {children}
    </div>
  )
}

function Choice({ value, options, onPick, disabled }: {
  value: string; options: { value: string; label: string }[]
  onPick: (v: string) => void; disabled: boolean
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" disabled={disabled}
          onClick={() => onPick(value === o.value ? '' : o.value)}
          className={`text-[13px] px-3 py-1.5 rounded-lg border ${
            value === o.value
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-300'
          } disabled:opacity-40`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function YesNo({ value, onPick, disabled }: {
  value: boolean | null; onPick: (v: boolean | null) => void; disabled: boolean
}) {
  return (
    <div className="flex gap-2">
      {[true, false].map((v) => (
        <button key={String(v)} type="button" disabled={disabled}
          onClick={() => onPick(value === v ? null : v)}
          className={`text-[13px] px-3 py-1.5 rounded-lg border w-16 ${
            value === v
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-300'
          } disabled:opacity-40`}>
          {v ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  )
}

function Static({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <p className="text-sm text-slate-900 mt-0.5">{value || '—'}</p>
    </div>
  )
}

function Field({ label, value, onChange, disabled, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void
  disabled: boolean; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
        {label}
      </label>
      <input type={type} value={value} disabled={disabled} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm rounded-lg border border-slate-200 px-3 py-1.5 disabled:bg-slate-50 disabled:text-slate-500" />
    </div>
  )
}

function SignRow({ label, who, date, dateLabel, onWho, onDate, disabled }: {
  label: string; who: string; date: string; dateLabel: string
  onWho: (v: string) => void; onDate: (v: string) => void; disabled: boolean
}) {
  return (
    <div className="px-4 py-2.5 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
      <div>
        <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
          {label}
        </label>
        <input value={who} disabled={disabled} onChange={(e) => onWho(e.target.value)}
          placeholder="Name"
          className="w-full text-sm rounded-lg border border-slate-200 px-3 py-1.5 disabled:bg-slate-50" />
      </div>
      <div>
        <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
          {dateLabel}
        </label>
        <input type="date" value={date} disabled={disabled}
          onChange={(e) => onDate(e.target.value)}
          className="text-sm rounded-lg border border-slate-200 px-3 py-1.5 disabled:bg-slate-50" />
      </div>
    </div>
  )
}
