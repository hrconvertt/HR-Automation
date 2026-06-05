'use client'

/**
 * Generate-Document dialog — prompts for the fields the doc generator needs.
 *
 * Per document type, only the relevant fields render. If the doc needs no
 * extras (Experience Letter, Confirmation, NDA, Exit Clearance, Exit Interview),
 * the dialog auto-skips and opens the doc immediately on mount.
 *
 * Two actions:
 *   - Preview only            → opens the personalised HTML in a new tab
 *   - Save & open document    → POSTs to /api/documents/save, then opens preview
 */

import { useState, useEffect, useRef } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sparkles, FileCheck2, ExternalLink } from 'lucide-react'

const DOC_TITLES: Record<string, string> = {
  offer_letter:                'Generate Offer Letter',
  employment_agreement:        'Generate Employment Agreement',
  employment_agreement_intern: 'Generate Training/Internship Agreement',
  nda:                         'Generate NDA',
  show_cause_notice:           'Generate Show Cause Notice',
  notice_period_letter:        'Generate Notice Period Letter',
  termination_letter:          'Generate Termination Letter',
  experience_letter:           'Generate Experience Letter',
  confirmation_letter:         'Generate Confirmation Letter',
  exit_clearance_form:         'Generate Exit Clearance Form',
  exit_interview_form:         'Generate Exit Interview Form',
}

// What fields each doc needs (anything not listed auto-fills from employee data)
const FIELDS_BY_TYPE: Record<string, ('concerns' | 'responseWindowDays' | 'lastWorkingDay' | 'terminationReason' | 'fnfAmount' | 'reportingTo' | 'effectiveDate')[]> = {
  offer_letter:                ['effectiveDate', 'reportingTo'],
  employment_agreement:        ['effectiveDate'],
  employment_agreement_intern: ['effectiveDate'],
  nda:                         [],
  show_cause_notice:           ['concerns', 'responseWindowDays'],
  notice_period_letter:        ['lastWorkingDay'],
  termination_letter:          ['lastWorkingDay', 'terminationReason', 'fnfAmount'],
  experience_letter:           [],
  confirmation_letter:         ['effectiveDate'],
  exit_clearance_form:         ['lastWorkingDay'],
  exit_interview_form:         ['lastWorkingDay'],
}

type Extras = {
  concerns?: string
  responseWindowDays?: string
  lastWorkingDay?: string
  terminationReason?: string
  fnfAmount?: string
  reportingTo?: string
  effectiveDate?: string
}

type Props = {
  open: boolean
  onClose: () => void
  type: string
  employeeId: string
  employeeName: string
  // Pre-fill helpers (e.g. last working day from offboarding journey)
  defaults?: Partial<Extras>
  // Auto-skip the dialog when no fields are needed
  autoOpenWhenNoExtras?: boolean
}

export default function GenerateDocumentDialog({
  open, onClose, type, employeeId, employeeName, defaults, autoOpenWhenNoExtras = true,
}: Props) {
  const fields = FIELDS_BY_TYPE[type] ?? []
  const needsInput = fields.length > 0

  const [form, setForm] = useState<Extras>({
    concerns: defaults?.concerns ?? '',
    responseWindowDays: defaults?.responseWindowDays ?? '7',
    lastWorkingDay: defaults?.lastWorkingDay ?? '',
    terminationReason: defaults?.terminationReason ?? '',
    fnfAmount: defaults?.fnfAmount ?? '',
    reportingTo: defaults?.reportingTo ?? '',
    effectiveDate: defaults?.effectiveDate ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const autoOpenedRef = useRef(false)

  function buildUrl() {
    const params = new URLSearchParams({ type, employeeId })
    for (const f of fields) {
      const v = form[f]
      if (v !== undefined && v !== null && String(v).length > 0) params.set(f, String(v))
    }
    return `/api/documents/generate?${params.toString()}`
  }

  function buildExtrasObject() {
    const out: Record<string, string> = {}
    for (const f of fields) {
      const v = form[f]
      if (v !== undefined && String(v).length > 0) out[f] = String(v)
    }
    return out
  }

  // Auto-open if no extras needed
  useEffect(() => {
    if (open && !needsInput && autoOpenWhenNoExtras && !autoOpenedRef.current) {
      autoOpenedRef.current = true
      window.open(buildUrl(), '_blank', 'noopener,noreferrer')
      onClose()
    }
    if (!open) autoOpenedRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, needsInput])

  function validate(): string | null {
    if (type === 'show_cause_notice' && !form.concerns?.trim()) {
      return 'Please describe the specific concerns / alleged conduct.'
    }
    if (type === 'termination_letter' && !form.terminationReason?.trim()) {
      return 'Please provide the termination reason.'
    }
    return null
  }

  function handlePreview() {
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    window.open(buildUrl(), '_blank', 'noopener,noreferrer')
    onClose()
  }

  async function handleSaveAndOpen() {
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setBusy(true)
    const res = await fetch('/api/documents/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, employeeId, extras: buildExtrasObject() }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Failed to save'); return }
    window.open(buildUrl(), '_blank', 'noopener,noreferrer')
    onClose()
  }

  // Don't render the modal at all when there are no fields (auto-open handles it)
  if (!needsInput) return null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            {DOC_TITLES[type] ?? 'Generate Document'}
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">for <strong>{employeeName}</strong></p>
        </DialogHeader>

        <div className="space-y-4">
          {fields.includes('concerns') && (
            <div>
              <Label required>Specific concerns / alleged conduct</Label>
              <textarea
                value={form.concerns}
                onChange={(e) => setForm({ ...form, concerns: e.target.value })}
                rows={4}
                className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
                placeholder="e.g. Repeated unauthorised absences on 12 May, 14 May, and 17 May 2026 despite verbal warning on 10 May. Failure to deliver Project X milestone by agreed deadline of 15 May…"
              />
              <p className="text-[11px] text-slate-500 mt-1">Be specific and factual — dates, incidents, policies breached. This text appears verbatim on the notice.</p>
            </div>
          )}

          {fields.includes('responseWindowDays') && (
            <div>
              <Label>Response window (days)</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={form.responseWindowDays}
                onChange={(e) => setForm({ ...form, responseWindowDays: e.target.value })}
              />
              <p className="text-[11px] text-slate-500 mt-1">Standard is 3–7 days. Up to 1 month for serious matters.</p>
            </div>
          )}

          {fields.includes('lastWorkingDay') && (
            <div>
              <Label>Last working day</Label>
              <Input
                type="date"
                value={form.lastWorkingDay}
                onChange={(e) => setForm({ ...form, lastWorkingDay: e.target.value })}
              />
              <p className="text-[11px] text-slate-500 mt-1">Defaults to today + 30 days if blank.</p>
            </div>
          )}

          {fields.includes('terminationReason') && (
            <div>
              <Label required>Termination reason</Label>
              <textarea
                value={form.terminationReason}
                onChange={(e) => setForm({ ...form, terminationReason: e.target.value })}
                rows={3}
                className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
                placeholder="e.g. Failure to meet performance standards following written warning, breach of confidentiality policy on date X…"
              />
            </div>
          )}

          {fields.includes('fnfAmount') && (
            <div>
              <Label>Full & Final (F&F) settlement amount (PKR)</Label>
              <Input
                type="number"
                min={0}
                value={form.fnfAmount}
                onChange={(e) => setForm({ ...form, fnfAmount: e.target.value })}
                placeholder="Leave blank if not yet calculated"
              />
              <p className="text-[11px] text-slate-500 mt-1">Final salary + unused leave + bonuses − advances − dues.</p>
            </div>
          )}

          {fields.includes('reportingTo') && (
            <div>
              <Label>Reporting Manager (override)</Label>
              <Input
                value={form.reportingTo}
                onChange={(e) => setForm({ ...form, reportingTo: e.target.value })}
                placeholder="Leave blank to use the employee's assigned manager"
              />
            </div>
          )}

          {fields.includes('effectiveDate') && (
            <div>
              <Label>Effective date</Label>
              <Input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
              />
              <p className="text-[11px] text-slate-500 mt-1">Defaults to the employee&apos;s joining date / today.</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
          )}

          <div className="bg-blue-50/50 border border-blue-100 rounded p-3 text-[11px] text-blue-900">
            <strong>Two options:</strong>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li><strong>Preview only</strong> — opens the document for review, doesn&apos;t save a copy.</li>
              <li><strong>Save &amp; open</strong> — records this document in the employee&apos;s file (visible under People → Documents tab) <em>and</em> opens it.</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="outline" onClick={handlePreview} disabled={busy}>
            <ExternalLink className="w-3.5 h-3.5 mr-1" /> Preview only
          </Button>
          <Button onClick={handleSaveAndOpen} disabled={busy} className="bg-blue-600 hover:bg-blue-700 text-white">
            <FileCheck2 className="w-3.5 h-3.5 mr-1" /> {busy ? 'Saving…' : 'Save & open'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">
      {children}{required && <span className="text-red-500"> *</span>}
    </label>
  )
}
