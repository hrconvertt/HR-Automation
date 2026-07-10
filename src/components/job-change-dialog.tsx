'use client'

/**
 * New Job Change dialog — shared by the Job Changes list page and the
 * employee-profile "Change Job" action (which pre-fills the employee).
 *
 * Picker data comes from GET /api/job-changes/options (role-scoped server
 * side: Managers only receive their direct reports). Submission POSTs to
 * /api/job-changes — all validation is re-enforced server-side.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'

const CHANGE_TYPES = [
  { value: 'PROMOTION', label: 'Promotion', hint: 'New designation, optionally a new department/manager' },
  { value: 'TRANSFER', label: 'Transfer', hint: 'Move to a different department' },
  { value: 'MANAGER_CHANGE', label: 'Manager Change', hint: 'Re-assign the reporting manager' },
  { value: 'DESIGNATION_CHANGE', label: 'Designation Change', hint: 'Retitle without a promotion' },
] as const
type ChangeType = (typeof CHANGE_TYPES)[number]['value']

interface OptionEmployee {
  id: string
  fullName: string
  employeeCode: string
  designation: string
  departmentId: string | null
  reportingManagerId: string | null
}
interface Options {
  employees: OptionEmployee[]
  departments: { id: string; name: string }[]
  managers: { id: string; fullName: string; designation: string }[]
}

export default function JobChangeDialog({
  open,
  onClose,
  onCreated,
  presetEmployeeId,
}: {
  open: boolean
  onClose: () => void
  onCreated?: () => void
  presetEmployeeId?: string
}) {
  const [options, setOptions] = useState<Options | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [employeeId, setEmployeeId] = useState(presetEmployeeId ?? '')
  const [changeType, setChangeType] = useState<ChangeType>('PROMOTION')
  const [toDesignation, setToDesignation] = useState('')
  const [toDepartmentId, setToDepartmentId] = useState('')
  const [toManagerId, setToManagerId] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setEmployeeId(presetEmployeeId ?? '')
    setChangeType('PROMOTION')
    setToDesignation('')
    setToDepartmentId('')
    setToManagerId('')
    setEffectiveDate(new Date().toISOString().slice(0, 10))
    setReason('')
    setLoadError(null)
    fetch('/api/job-changes/options', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Failed to load options')
        return r.json()
      })
      .then(setOptions)
      .catch((e) => setLoadError(e.message))
  }, [open, presetEmployeeId])

  const selected = useMemo(
    () => options?.employees.find((e) => e.id === employeeId) ?? null,
    [options, employeeId],
  )

  const needsDesignation = changeType === 'PROMOTION' || changeType === 'DESIGNATION_CHANGE'
  const showDepartment = changeType === 'TRANSFER' || changeType === 'PROMOTION'
  const showManager = changeType === 'MANAGER_CHANGE' || changeType === 'PROMOTION'
  const departmentRequired = changeType === 'TRANSFER'
  const managerRequired = changeType === 'MANAGER_CHANGE'

  const todayStr = new Date().toISOString().slice(0, 10)
  const canSubmit =
    !!employeeId &&
    !!effectiveDate &&
    effectiveDate >= todayStr &&
    (!needsDesignation || toDesignation.trim().length > 0) &&
    (!departmentRequired || !!toDepartmentId) &&
    (!managerRequired || !!toManagerId)

  async function submit() {
    if (!canSubmit || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/job-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          changeType,
          effectiveDate,
          toDesignation: needsDesignation ? toDesignation.trim() : undefined,
          toDepartmentId: showDepartment && toDepartmentId ? toDepartmentId : undefined,
          toManagerId: showManager && toManagerId ? toManagerId : undefined,
          reason: reason.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'Could not create job change', description: data.error ?? 'Unknown error', variant: 'destructive' })
        return
      }
      toast({ title: 'Job change requested', description: 'It is now pending HR approval.' })
      onClose()
      onCreated?.()
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Job Change</DialogTitle>
          <DialogDescription>
            Request a promotion, transfer, manager change, or designation change. HR approves, then enacts on the effective date.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-slate-500 py-4">{loadError}</p>
        ) : !options ? (
          <p className="text-sm text-slate-400 py-4">Loading…</p>
        ) : (
          <div className="space-y-4">
            {/* Employee */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Employee</label>
              <select
                className={inputCls}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                disabled={!!presetEmployeeId}
              >
                <option value="">Select employee…</option>
                {options.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName} ({e.employeeCode}) — {e.designation}
                  </option>
                ))}
              </select>
              {selected && (
                <p className="text-xs text-slate-500 mt-1">
                  Current: {selected.designation}
                </p>
              )}
            </div>

            {/* Change type */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Change type</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CHANGE_TYPES.map((t) => (
                  <label
                    key={t.value}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm ${
                      changeType === t.value
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="jc-type"
                      className="mt-0.5 accent-slate-900"
                      checked={changeType === t.value}
                      onChange={() => setChangeType(t.value)}
                    />
                    <span>
                      <span className="font-medium text-slate-900 block">{t.label}</span>
                      <span className="text-xs text-slate-500">{t.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Conditional targets */}
            {needsDesignation && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  New designation <span className="text-slate-400">(required)</span>
                </label>
                <input
                  className={inputCls}
                  value={toDesignation}
                  onChange={(e) => setToDesignation(e.target.value)}
                  placeholder="e.g. Senior Software Engineer"
                />
              </div>
            )}
            {showDepartment && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  New department{' '}
                  <span className="text-slate-400">{departmentRequired ? '(required)' : '(optional)'}</span>
                </label>
                <select className={inputCls} value={toDepartmentId} onChange={(e) => setToDepartmentId(e.target.value)}>
                  <option value="">{departmentRequired ? 'Select department…' : 'Keep current department'}</option>
                  {options.departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}
            {showManager && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  New manager{' '}
                  <span className="text-slate-400">{managerRequired ? '(required)' : '(optional)'}</span>
                </label>
                <select className={inputCls} value={toManagerId} onChange={(e) => setToManagerId(e.target.value)}>
                  <option value="">{managerRequired ? 'Select manager…' : 'Keep current manager'}</option>
                  {options.managers
                    .filter((m) => m.id !== employeeId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>{m.fullName} — {m.designation}</option>
                    ))}
                </select>
              </div>
            )}

            {/* Effective date */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Effective date</label>
              <input
                type="date"
                className={inputCls}
                min={todayStr}
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
              {effectiveDate && effectiveDate < todayStr && (
                <p className="text-xs text-slate-600 mt-1">Effective date must be today or in the future.</p>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Reason / justification</label>
              <textarea
                className={`${inputCls} min-h-[70px]`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this change being requested?"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || saving || !options}>
            {saving ? 'Submitting…' : 'Submit for approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
