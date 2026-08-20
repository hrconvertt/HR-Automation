'use client'

/**
 * The Employment Letter builder.
 *
 * Pick a person and the fields fill from their record. Preview and Print open
 * the finished letter (with the e-sign and print controls on it); Save draft
 * keeps this version so the profile button and a re-open show it rather than
 * the untouched template.
 *
 * The edited fields ride to the letter as one base64 param, so a Preview link
 * carries the whole form without a mile-long query string.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileText, Loader2, Eye, Printer, Save, Check, Mail } from 'lucide-react'

interface Staff { id: string; fullName: string; employeeCode: string; designation: string | null }

interface Fields {
  designation: string
  cnic: string
  city: string
  effectiveDate: string
  grossSalary: string | number
  conveyance: string | number
  probationMonths: string | number
  noticeConfirmed: string
  benefits: string
}

const inputCls =
  'w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none '
  + 'focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400'

const EMPTY: Fields = {
  designation: '', cnic: '', city: '', effectiveDate: '',
  grossSalary: '', conveyance: 5000, probationMonths: 3,
  noticeConfirmed: '', benefits: '',
}

export function EmploymentLetterBuilder({ staff }: { staff: Staff[] }) {
  const [employeeId, setEmployeeId] = useState('')
  const [employeeName, setEmployeeName] = useState('')
  const [f, setF] = useState<Fields>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = (k: keyof Fields, v: string | number) => {
    setF((p) => ({ ...p, [k]: v }))
    setSaved(false)
  }

  async function pick(id: string) {
    setEmployeeId(id); setErr(null); setSaved(false)
    if (!id) { setF(EMPTY); setEmployeeName(''); return }
    setLoading(true)
    const res = await fetch(`/api/documents/offer-defaults?employeeId=${id}`)
    const d = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setErr(d.error ?? 'Could not load that employee.'); return }
    setEmployeeName(d.employeeName ?? '')
    setF({ ...EMPTY, ...d.fields })
  }

  /** Pack the fields for the Preview / Print link. */
  function packed(): string {
    const payload = {
      designation: f.designation,
      cnic: f.cnic,
      city: f.city,
      effectiveDate: f.effectiveDate,
      noticeConfirmed: f.noticeConfirmed,
      benefits: f.benefits,
      grossSalary: Number(f.grossSalary) || 0,
      conveyance: Number(f.conveyance) || 0,
      probationMonths: Number(f.probationMonths) || 3,
    }
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
  }

  function open(print: boolean) {
    if (!employeeId) return
    const url = `/api/documents/generate?type=offer_letter&employeeId=${employeeId}&fields=${encodeURIComponent(packed())}`
    const w = window.open(url, '_blank')
    if (print && w) {
      // Give the letter a moment to lay out before the print dialog.
      w.addEventListener('load', () => setTimeout(() => w.print(), 400))
    }
  }

  async function saveDraft() {
    if (!employeeId) return
    setSaving(true); setErr(null)
    const res = await fetch('/api/documents/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'offer_letter',
        employeeId,
        fields: {
          designation: f.designation, cnic: f.cnic, city: f.city,
          effectiveDate: f.effectiveDate, noticeConfirmed: f.noticeConfirmed,
          benefits: f.benefits,
          grossSalary: Number(f.grossSalary) || 0,
          conveyance: Number(f.conveyance) || 0,
          probationMonths: Number(f.probationMonths) || 3,
        },
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error ?? 'Could not save the draft.')
      return
    }
    setSaved(true)
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow-md">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Employment Letter</h1>
            <p className="text-white/80 text-sm mt-1">
              Pick an employee, the fields fill in, then save a draft, preview or print.
            </p>
          </div>
        </div>
      </div>

      {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</p>}

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Employee</span>
          <select className={`${inputCls} mt-1`} value={employeeId} onChange={(e) => pick(e.target.value)}>
            <option value="">Pick who the letter is for…</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName} — {s.employeeCode}{s.designation ? ` · ${s.designation}` : ''}
              </option>
            ))}
          </select>
        </label>
      </section>

      {loading && (
        <p className="text-sm text-slate-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading {employeeName || 'their details'}…
        </p>
      )}

      {employeeId && !loading && (
        <>
          <section className="bg-white border border-slate-200 rounded-xl">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">The offer</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Pre-filled from {employeeName}&rsquo;s record — change only what differs for this offer.
              </p>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Designation" full>
                <input className={inputCls} value={f.designation} onChange={(e) => set('designation', e.target.value)} />
              </Field>
              <Field label="Gross salary (PKR / month)">
                <input type="number" className={inputCls} value={f.grossSalary}
                  onChange={(e) => set('grossSalary', e.target.value)} />
              </Field>
              <Field label="Conveyance allowance (PKR / month)">
                <input type="number" className={inputCls} value={f.conveyance}
                  onChange={(e) => set('conveyance', e.target.value)} />
              </Field>
              <Field label="Joining date">
                <input type="date" className={inputCls} value={f.effectiveDate}
                  onChange={(e) => set('effectiveDate', e.target.value)} />
              </Field>
              <Field label="Probation (months)">
                <input type="number" className={inputCls} value={f.probationMonths}
                  onChange={(e) => set('probationMonths', e.target.value)} />
              </Field>
              <Field label="CNIC">
                <input className={inputCls} value={f.cnic} onChange={(e) => set('cnic', e.target.value)} />
              </Field>
              <Field label="City">
                <input className={inputCls} value={f.city} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <Field label="Notice period once confirmed" hint="e.g. two (2) months">
                <input className={inputCls} value={f.noticeConfirmed}
                  onChange={(e) => set('noticeConfirmed', e.target.value)} />
              </Field>
              <Field label="Benefits" hint="Leave blank for the standard package" full>
                <textarea rows={2} className={inputCls} value={f.benefits}
                  placeholder="Standard: group health insurance, OPD, EOBI, paid holidays, leave per policy"
                  onChange={(e) => set('benefits', e.target.value)} />
              </Field>
            </div>
          </section>

          <div className="sticky bottom-0 flex items-center justify-between gap-3 flex-wrap bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
            <p className="text-[11px] text-slate-500">
              {saved ? 'Draft saved — reopening the letter shows this version.' : 'Preview and Print open the finished letter, where you can also e-sign.'}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={saveDraft} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : saved ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                {saved ? 'Saved' : 'Save draft'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => open(false)}>
                <Eye className="w-3.5 h-3.5 mr-1.5" /> Preview
              </Button>
              <Button size="sm" onClick={() => open(true)}>
                <Printer className="w-3.5 h-3.5 mr-1.5" /> Print
              </Button>
            </div>
          </div>
        </>
      )}

      {!employeeId && !loading && (
        <div className="text-center py-10 text-slate-400">
          <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">Pick an employee to start the letter.</p>
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, full, children }: {
  label: string; hint?: string; full?: boolean; children: React.ReactNode
}) {
  return (
    <label className={`block ${full ? 'sm:col-span-2' : ''}`}>
      <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">{label}</span>
      {hint && <span className="block text-[11px] text-slate-400 mt-0.5">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  )
}
