'use client'

/**
 * The promotion form.
 *
 * Ordered the way the Playbook orders the decision — the move, then the money,
 * then the four gates, then the signature, then the letter — because filling
 * it top to bottom is the process, not just data entry.
 *
 * The salary check warns rather than blocks. Playbook 4.3 allows out-of-band
 * with the Founder's written approval, and a form that refuses to save the
 * exception just means the exception gets made somewhere the system cannot see.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SignaturePad } from '@/components/signature-pad'
import {
  ArrowLeft, Loader2, Save, Trash2, FileText, Printer, Check, AlertTriangle, X,
} from 'lucide-react'
import {
  LEVELS, LEVEL_SPECS, LEVEL_LABEL, GATES, gateStates, needsBusinessCase,
  checkPromotionSalary, noticeChanges,
  PROMOTION_INCREMENT_MIN_PCT, PROMOTION_INCREMENT_MAX_PCT,
  type Level,
} from '@/lib/promotion'
import { LOGO_DATA_URI } from '@/lib/brand-logo'

interface Employee {
  fullName: string; employeeCode: string | null; designation: string | null
  department: string | null; managerName: string | null; joiningDate: string | null
}
export interface PromotionState {
  id: string; status: string; effectiveDate: string
  fromDesignation: string; newDesignation: string
  fromLevel: string; toLevel: string
  fromSalaryAmount: number | null; newSalaryAmount: number | null
  bandMin: number | null; bandMax: number | null
  reason: string; evidence: string
  sponsorName: string; sponsorship: string
  fairnessNote: string; fairnessCheckedBy: string
  businessNeed: string
  signedByName: string; signedByTitle: string
  signatureDataUrl: string | null; signedAt: string | null
  letterBody: string | null; letterGeneratedAt: string | null
}

const money = (n: number | null) => (n == null ? '—' : `PKR ${Math.round(n).toLocaleString('en-PK')}`)
const inputCls =
  'w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none '
  + 'focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400'

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">{label}</span>
      {hint && <span className="block text-[11px] text-slate-400 mt-0.5">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  )
}

function Card({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl">
      <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function PromotionForm({ employee, promotion }: {
  employee: Employee; promotion: PromotionState
}) {
  const router = useRouter()
  const [f, setF] = useState<PromotionState>(promotion)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const set = <K extends keyof PromotionState>(k: K, v: PromotionState[K]) => {
    setF((p) => ({ ...p, [k]: v }))
    setSavedAt(null)
  }

  const check = checkPromotionSalary({
    fromSalary: f.fromSalaryAmount, toSalary: f.newSalaryAmount,
    bandMin: f.bandMin, bandMax: f.bandMax,
  })
  const states = gateStates(f)
  const metCount = states.filter((s) => s.met).length
  const noticeM = f.toLevel ? LEVEL_SPECS[f.toLevel as Level]?.noticeMonths : null

  async function save(): Promise<boolean> {
    setSaving(true); setErr(null)
    const res = await fetch(`/api/culture/promotions/${f.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(f),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error ?? 'Could not save.')
      return false
    }
    setSavedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    router.refresh()
    return true
  }

  /** Save first, so the letter reflects the form on screen. */
  async function generate() {
    setGenerating(true)
    if (!(await save())) { setGenerating(false); return }
    const res = await fetch(`/api/culture/promotions/${f.id}`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setGenerating(false)
    if (!res.ok) { setErr(d.error ?? 'Could not generate the letter.'); return }
    setF((p) => ({ ...p, letterBody: d.letterBody, letterGeneratedAt: d.letterGeneratedAt }))
    router.refresh()
  }

  async function remove() {
    if (!confirm(`Delete the promotion record for ${employee.fullName}?`)) return
    setDeleting(true)
    const res = await fetch(`/api/culture/promotions/${f.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) { setErr('Could not delete.'); return }
    router.push('/dashboard/culture/promotions')
  }

  /**
   * Print the letter on the Convertt letterhead.
   *
   * Body text and the signature image are injected as DOM nodes rather than
   * interpolated into the markup — the letter carries names and free-typed
   * reasons, and one apostrophe or angle bracket should not be able to reshape
   * the page.
   */
  function printLetter() {
    if (!f.letterBody) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html><head><title>Promotion Letter — ${
      employee.fullName.replace(/[<>&]/g, '')
    }</title><style>
      @page { size: A4; margin: 0; }
      body { margin: 0; font-family: 'Times New Roman', Times, serif; color: #1A1A1A; }
      .doc { width: 210mm; min-height: 297mm; padding: 46pt 60pt 60pt; box-sizing: border-box; }
      .logo { height: 27.3pt; display: block; margin-bottom: 18pt; }
      .date { font-size: 11pt; margin-bottom: 22pt; }
      .subject { font-size: 13pt; font-weight: 700; margin-bottom: 18pt; }
      .body { font-size: 12pt; line-height: 16.5pt; white-space: pre-wrap; }
      .sig { margin-top: 26pt; }
      .sig img { height: 54pt; display: block; }
      .sig .rule { border-top: 1px solid #94a3b8; width: 200pt; margin-top: 4pt; padding-top: 4pt; font-size: 10pt; }
      @media print { .doc { height: 297mm; } }
    </style></head><body><div class="doc">
      <img class="logo" src="${LOGO_DATA_URI}" alt="Convertt">
      <div class="date"></div>
      <div class="subject">Letter of Promotion</div>
      <div class="body"></div>
      <div class="sig"></div>
    </div></body></html>`)
    const doc = w.document
    doc.close()
    const dateEl = doc.querySelector('.date')
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric',
      })
    }
    const bodyEl = doc.querySelector('.body')
    if (bodyEl) bodyEl.textContent = f.letterBody
    const sigEl = doc.querySelector('.sig')
    if (sigEl && f.signatureDataUrl) {
      const img = doc.createElement('img')
      img.src = f.signatureDataUrl
      sigEl.appendChild(img)
      const rule = doc.createElement('div')
      rule.className = 'rule'
      rule.textContent = [f.signedByName, f.signedByTitle].filter(Boolean).join(' — ')
      sigEl.appendChild(rule)
    }
    w.focus()
    w.print()
  }

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow-md">
        <Link
          href="/dashboard/culture/promotions"
          className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-xs mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All promotions
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{employee.fullName}</h1>
            <p className="text-white/70 text-sm mt-1">
              {f.fromDesignation || employee.designation || '—'} → {f.newDesignation}
              {employee.department && ` · ${employee.department}`}
              {employee.employeeCode && ` · ${employee.employeeCode}`}
            </p>
          </div>
          <p className="text-white/80 text-sm tabular-nums">
            {metCount} of {GATES.length} gates
          </p>
        </div>
      </div>

      {err && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{err}</p>
      )}

      {/* ── The move ───────────────────────────────────────────────── */}
      <Card title="The move" subtitle="Playbook 4.1 — every role maps to a level, and the level sets the notice period.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Current title">
            <input className={inputCls} value={f.fromDesignation}
              onChange={(e) => set('fromDesignation', e.target.value)} />
          </Field>
          <Field label="New title">
            <input className={inputCls} value={f.newDesignation}
              onChange={(e) => set('newDesignation', e.target.value)} />
          </Field>
          <Field label="Current level">
            <select className={inputCls} value={f.fromLevel}
              onChange={(e) => set('fromLevel', e.target.value)}>
              <option value="">Not recorded</option>
              {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL(l)}</option>)}
            </select>
          </Field>
          <Field label="New level">
            <select className={inputCls} value={f.toLevel}
              onChange={(e) => set('toLevel', e.target.value)}>
              <option value="">Not recorded</option>
              {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL(l)}</option>)}
            </select>
          </Field>
          <Field label="Effective from">
            <input type="date" className={inputCls} value={f.effectiveDate}
              onChange={(e) => set('effectiveDate', e.target.value)} />
          </Field>
          <Field label="Where it stands">
            <select className={inputCls} value={f.status}
              onChange={(e) => set('status', e.target.value)}>
              <option value="PENDING_HR">With HR</option>
              <option value="PENDING_CEO">With the Founder</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Not approved</option>
            </select>
          </Field>
        </div>

        {f.toLevel && (
          <div className="mt-4 rounded-lg bg-slate-50 border border-slate-100 p-3">
            <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
              {LEVEL_LABEL(f.toLevel)}
            </p>
            <p className="text-sm text-slate-700 mt-1">{LEVEL_SPECS[f.toLevel as Level].defines}</p>
            {noticeM != null && (
              <p className="text-[11px] text-slate-500 mt-1.5">
                Notice period at this level: {noticeM} month{noticeM === 1 ? '' : 's'}.
                {noticeChanges(f.fromLevel || null, f.toLevel || null)
                  && ' The letter will say it has changed.'}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* ── The money ──────────────────────────────────────────────── */}
      <Card
        title="The money"
        subtitle={`Playbook 4.5 — at least the new band's minimum, typically ${PROMOTION_INCREMENT_MIN_PCT}–${PROMOTION_INCREMENT_MAX_PCT}%, on top of any annual increment.`}
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Current gross" hint="Snapshotted from their pay components">
            <input type="number" className={`${inputCls} tabular-nums`}
              value={f.fromSalaryAmount ?? ''}
              onChange={(e) => set('fromSalaryAmount', e.target.value === '' ? null : Number(e.target.value))} />
          </Field>
          <Field label="New gross">
            <input type="number" className={`${inputCls} tabular-nums`}
              value={f.newSalaryAmount ?? ''}
              onChange={(e) => set('newSalaryAmount', e.target.value === '' ? null : Number(e.target.value))} />
          </Field>
          <Field label="Band minimum" hint="For the new level and location">
            <input type="number" className={`${inputCls} tabular-nums`}
              value={f.bandMin ?? ''}
              onChange={(e) => set('bandMin', e.target.value === '' ? null : Number(e.target.value))} />
          </Field>
          <Field label="Band maximum">
            <input type="number" className={`${inputCls} tabular-nums`}
              value={f.bandMax ?? ''}
              onChange={(e) => set('bandMax', e.target.value === '' ? null : Number(e.target.value))} />
          </Field>
        </div>

        {check.pct != null && (
          <p className="text-sm text-slate-700 mt-3 tabular-nums">
            {money(f.fromSalaryAmount)} → {money(f.newSalaryAmount)}
            <span className={`ml-2 font-semibold ${check.errors.length ? 'text-red-700' : 'text-emerald-700'}`}>
              {check.pct >= 0 ? '+' : ''}{check.pct.toFixed(1)}%
            </span>
          </p>
        )}
        {check.errors.map((e, i) => (
          <p key={i} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 mt-2 flex gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" /> {e}
          </p>
        ))}
        {check.warnings.map((w, i) => (
          <p key={i} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mt-2 flex gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" /> {w}
          </p>
        ))}
      </Card>

      {/* ── The gates ──────────────────────────────────────────────── */}
      <Card
        title="The four gates"
        subtitle="Playbook 4.4 — promotion is earned by consistently performing at the next level, then confirmed by the business."
      >
        <div className="space-y-5">
          <Gate gate={GATES[0]} met={states[0].met}>
            <Field label="Evidence" hint="Which review periods, and what work showed the next level">
              <textarea rows={4} className={inputCls} value={f.evidence}
                onChange={(e) => set('evidence', e.target.value)} />
            </Field>
          </Gate>

          <Gate gate={GATES[1]} met={states[1].met}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Nominated by">
                <input className={inputCls} value={f.sponsorName}
                  placeholder={employee.managerName ?? 'Reporting manager'}
                  onChange={(e) => set('sponsorName', e.target.value)} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Their written case">
                  <textarea rows={3} className={inputCls} value={f.sponsorship}
                    onChange={(e) => set('sponsorship', e.target.value)} />
                </Field>
              </div>
            </div>
          </Gate>

          <Gate gate={GATES[2]} met={states[2].met}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Checked by">
                <input className={inputCls} value={f.fairnessCheckedBy}
                  onChange={(e) => set('fairnessCheckedBy', e.target.value)} />
              </Field>
              <div className="md:col-span-2">
                <Field label="What the check found" hint="Same bar across the team; internal candidates got first look">
                  <textarea rows={3} className={inputCls} value={f.fairnessNote}
                    onChange={(e) => set('fairnessNote', e.target.value)} />
                </Field>
              </div>
            </div>
          </Gate>

          <Gate
            gate={GATES[3]}
            met={states[3].met}
            notRequired={!needsBusinessCase(f.toLevel)}
          >
            <Field label="The need" hint="Client load, team size — why this seat exists now">
              <textarea rows={3} className={inputCls} value={f.businessNeed}
                onChange={(e) => set('businessNeed', e.target.value)} />
            </Field>
          </Gate>
        </div>
      </Card>

      {/* ── Wording ────────────────────────────────────────────────── */}
      <Card title="What the letter says" subtitle="Left blank, the letter uses its own wording. Anything here replaces it.">
        <Field label="Reason / message">
          <textarea rows={4} className={inputCls} value={f.reason}
            placeholder="Why this promotion, in the words you want them to read."
            onChange={(e) => set('reason', e.target.value)} />
        </Field>
      </Card>

      {/* ── Signature ──────────────────────────────────────────────── */}
      <Card
        title="Signature"
        subtitle="Playbook 4.4 — the Founder approves. Sign here and it prints on the letter."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Field label="Signed by">
            <input className={inputCls} value={f.signedByName}
              onChange={(e) => set('signedByName', e.target.value)} />
          </Field>
          <Field label="Title">
            <input className={inputCls} value={f.signedByTitle} placeholder="Founder"
              onChange={(e) => set('signedByTitle', e.target.value)} />
          </Field>
          <div className="flex items-end">
            {f.signedAt ? (
              <p className="text-[11px] text-emerald-700 flex items-center gap-1.5 pb-2.5">
                <Check className="w-3.5 h-3.5" />
                Signed {new Date(f.signedAt).toLocaleString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5 pb-2.5">
                <X className="w-3.5 h-3.5" /> Not signed yet
              </p>
            )}
          </div>
        </div>
        <SignaturePad
          value={f.signatureDataUrl}
          onChange={(v) => set('signatureDataUrl', v)}
        />
        <p className="text-[11px] text-slate-400 mt-2">
          Save after signing. The mark is stored with this promotion and prints on the letter —
          it records who approved, it is not proof of identity.
        </p>
      </Card>

      {/* ── The letter ─────────────────────────────────────────────── */}
      <Card
        title="Promotion letter"
        subtitle="Generated from everything above. Regenerate after any change."
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {f.letterBody && (
              <Button size="sm" variant="outline" onClick={printLetter}>
                <Printer className="w-3.5 h-3.5 mr-1.5" /> Print / Save as PDF
              </Button>
            )}
            <Button size="sm" onClick={generate} disabled={generating || saving}>
              {generating
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <FileText className="w-3.5 h-3.5 mr-1.5" />}
              {f.letterBody ? 'Regenerate' : 'Create promotion letter'}
            </Button>
          </div>
        }
      >
        {f.letterGeneratedAt && (
          <p className="text-[11px] text-slate-500 mb-3">
            Generated {new Date(f.letterGeneratedAt).toLocaleString('en-GB', {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        )}
        {f.letterBody ? (
          <>
            <pre className="whitespace-pre-wrap font-serif text-[13px] leading-relaxed text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-4 overflow-x-auto">
              {f.letterBody}
            </pre>
            {f.signatureDataUrl && (
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.signatureDataUrl} alt="Signature" className="h-14" />
                <div className="border-t border-slate-300 w-56 mt-1 pt-1 text-[11px] text-slate-600">
                  {[f.signedByName, f.signedByTitle].filter(Boolean).join(' — ') || 'Signed'}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-10">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">
              Nothing generated yet. The letter states the new level, title, band, salary and
              effective date — and the notice period if it changed.
            </p>
          </div>
        )}
      </Card>

      {/* ── Sticky save bar ───────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-1 px-1 pb-1">
        <div className="flex items-center justify-between gap-3 flex-wrap bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
          <p className="text-[11px] text-slate-500">
            {savedAt ? `Saved at ${savedAt}` : 'Unsaved changes'} · {metCount} of {GATES.length} gates met
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline" onClick={remove} disabled={deleting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              {deleting
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
              Delete
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Gate({ gate, met, notRequired, children }: {
  gate: { name: string; requirement: string }
  met: boolean; notRequired?: boolean; children: React.ReactNode
}) {
  return (
    <div className={`rounded-lg border p-3 ${
      notRequired ? 'border-slate-100 bg-slate-50/50'
        : met ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200'
    }`}>
      <div className="flex items-start gap-2 mb-3">
        <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
          notRequired ? 'bg-slate-200' : met ? 'bg-emerald-600' : 'bg-slate-200'
        }`}>
          {met && !notRequired && <Check className="w-2.5 h-2.5 text-white" />}
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {gate.name}
            {notRequired && <span className="text-slate-400 font-normal"> — not required below L4</span>}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{gate.requirement}</p>
        </div>
      </div>
      {children}
    </div>
  )
}
