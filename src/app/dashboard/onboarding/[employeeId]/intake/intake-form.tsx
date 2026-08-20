'use client'

/**
 * The intake form the new joiner completes.
 *
 * Saves as they go — Save keeps a draft without claiming it is finished. Submit
 * is the separate, deliberate act that says "this is complete", and it checks
 * the required fields first so a half-filled form is never marked done. The two
 * are different states because "I saved my progress" and "I'm finished" are
 * different promises.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, Loader2, Save, Check, AlertTriangle, Upload, IdCard,
} from 'lucide-react'
import {
  INTAKE_SECTIONS, INTAKE_REQUIRED_KEYS, intakeProgress,
  type IntakeField, type IntakeValues,
} from '@/lib/employee-intake'

const inputCls =
  'w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none '
  + 'focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400'

export function IntakeForm({
  employeeId, employeeName, initialValues, submittedAt, isHR, isSelf,
}: {
  employeeId: string
  employeeName: string
  initialValues: IntakeValues
  submittedAt: string | null
  isHR: boolean
  isSelf: boolean
}) {
  const router = useRouter()
  const [v, setV] = useState<IntakeValues>(initialValues)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<string | null>(submittedAt)
  const [err, setErr] = useState<string | null>(null)
  const [showMissing, setShowMissing] = useState(false)

  const set = (k: string, val: string) => {
    setV((p) => ({ ...p, [k]: val }))
    setSavedAt(null)
  }

  const prog = intakeProgress(v)
  const missing = INTAKE_REQUIRED_KEYS.filter((k) => !(v[k] ?? '').trim())

  async function save(markSubmitted = false): Promise<boolean> {
    const res = await fetch(`/api/employees/${employeeId}/intake`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: v, markSubmitted }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error ?? 'Could not save.')
      return false
    }
    const d = await res.json().catch(() => ({}))
    if (markSubmitted) setSubmitted(d.submittedAt ?? new Date().toISOString())
    setSavedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    router.refresh()
    return true
  }

  async function onSave() {
    setSaving(true); setErr(null)
    await save(false)
    setSaving(false)
  }

  async function onSubmit() {
    setErr(null)
    if (missing.length > 0) {
      setShowMissing(true)
      setErr(`${missing.length} required field${missing.length === 1 ? '' : 's'} still need${missing.length === 1 ? 's' : ''} filling in.`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSubmitting(true)
    await save(true)
    setSubmitting(false)
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow-md">
        <Link
          href={`/dashboard/onboarding/${employeeId}`}
          className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-xs mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to onboarding
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Employee Information</h1>
        <p className="text-white/75 text-sm mt-1">
          {isSelf
            ? 'Welcome! Fill this in once and it goes straight to HR — no paperwork to hand back.'
            : `Intake for ${employeeName}.`}
        </p>
        {submitted && (
          <p className="text-emerald-300 text-xs mt-2 inline-flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            Submitted {new Date(submitted).toLocaleDateString('en-GB', {
              day: '2-digit', month: 'short', year: 'numeric',
            })} — you can still update it.
          </p>
        )}
      </div>

      {err && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" /> {err}
        </p>
      )}

      {/* Progress */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-slate-600">Required fields</span>
          <span className="text-slate-900 font-medium tabular-nums">{prog.done} / {prog.total}</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-slate-900 transition-all" style={{ width: `${prog.pct}%` }} />
        </div>
      </div>

      {/* Sections */}
      {INTAKE_SECTIONS.map((s) => (
        <section key={s.title} className="bg-white border border-slate-200 rounded-xl">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">{s.title}</h2>
            {s.blurb && <p className="text-[11px] text-slate-500 mt-0.5">{s.blurb}</p>}
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {s.fields.map((f) => (
              <Field
                key={f.key}
                f={f}
                value={v[f.key] ?? ''}
                onChange={(val) => set(f.key, val)}
                flagMissing={showMissing && !!f.required && !(v[f.key] ?? '').trim()}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Documents — the uploads live on the onboarding checklist. */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <IdCard className="w-5 h-5 text-slate-400 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-900">CNIC images and photo</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Upload your CNIC (front and back) and a passport-size photograph on your onboarding
              page — they attach to your record there.
            </p>
          </div>
          <Link href={`/dashboard/onboarding/${employeeId}`}>
            <Button size="sm" variant="outline">
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload documents
            </Button>
          </Link>
        </div>
      </section>

      {/* Sticky actions */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 flex-wrap bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
        <p className="text-[11px] text-slate-500">
          {savedAt ? `Saved at ${savedAt}` : submitted ? 'Submitted — edits will update your record.' : 'Your progress is not saved until you press Save.'}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onSave} disabled={saving || submitting}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Save draft
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={saving || submitting}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
            {submitted ? 'Save & re-submit' : 'Submit'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({ f, value, onChange, flagMissing }: {
  f: IntakeField; value: string; onChange: (v: string) => void; flagMissing: boolean
}) {
  const cls = `${inputCls} ${flagMissing ? 'border-red-300 ring-2 ring-red-100' : ''}`
  return (
    <label className={`block ${f.half ? '' : 'sm:col-span-2'}`}>
      <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
        {f.label}{f.required && <span className="text-red-500"> *</span>}
      </span>
      {f.help && <span className="block text-[11px] text-slate-400 mt-0.5">{f.help}</span>}
      <div className="mt-1">
        {f.kind === 'select' ? (
          <select className={`${cls} bg-white`} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">Select…</option>
            {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : f.kind === 'textarea' ? (
          <textarea rows={2} className={cls} value={value} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input
            type={f.kind === 'email' ? 'email' : f.kind === 'tel' ? 'tel' : f.kind === 'date' ? 'date' : 'text'}
            className={cls}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </label>
  )
}
