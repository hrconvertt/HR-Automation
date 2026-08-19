'use client'

/**
 * The verification workspace.
 *
 * Three parts, in the order the work happens: who is being asked, the two
 * columns of answers, and every email that passed between. The decision sits at
 * the bottom because it is the last thing, and it shows what the answers imply
 * before HR records what they concluded.
 *
 * Discrepancies are computed, never stored. Editing a cell should change the
 * verdict immediately, not after a save.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, Loader2, Save, Trash2, Mail, Copy, Check, AlertTriangle,
  ArrowDownLeft, ArrowUpRight, Plus,
} from 'lucide-react'
import {
  VERIFICATION_FIELDS, VERIFICATION_STATUSES, STATUS_LABELS, STATUS_TONE,
  OUTCOMES, OUTCOME_LABELS, findDiscrepancies, suggestOutcome, completeness,
  buildConsentRequest, buildVerificationRequest, buildChaser,
  type VerificationStatus, type Outcome,
} from '@/lib/background-verification'

interface Employee {
  id: string; fullName: string; employeeCode: string
  designation: string | null; department: string | null
}
interface LoggedEmail {
  id: string; direction: string; fromAddress: string; toAddress: string
  subject: string; body: string; occurredAt: string
}
export interface CheckState {
  id: string; employerName: string
  contactName: string; contactRole: string; contactEmail: string; contactPhone: string
  status: string; assignedToId: string
  consentAt: string | null; requestedAt: string | null; respondedAt: string | null
  outcome: string | null; decisionNote: string
  claimed: Record<string, string>
  verified: Record<string, string>
  emails: LoggedEmail[]
}

const inputCls =
  'w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none '
  + 'focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400'

const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

export function VerificationDetail({ check, employee, staff }: {
  check: CheckState; employee: Employee; staff: Array<{ id: string; fullName: string }>
}) {
  const router = useRouter()
  const [c, setC] = useState<CheckState>(check)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [removingEmail, setRemovingEmail] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    direction: 'OUTBOUND', subject: '', body: '', fromAddress: '', toAddress: '',
  })

  const set = <K extends keyof CheckState>(k: K, v: CheckState[K]) => {
    setC((p) => ({ ...p, [k]: v }))
    setSavedAt(null)
  }
  const setAnswer = (col: 'claimed' | 'verified', key: string, value: string) => {
    setC((p) => ({ ...p, [col]: { ...p[col], [key]: value } }))
    setSavedAt(null)
  }

  const discrepancies = useMemo(
    () => findDiscrepancies(c.claimed, c.verified), [c.claimed, c.verified],
  )
  const hasReply = c.emails.some((e) => e.direction === 'INBOUND')
  const suggested = suggestOutcome(c.claimed, c.verified, hasReply)
  const done = completeness(c.verified)

  async function save() {
    setSaving(true); setErr(null)
    const res = await fetch(`/api/verification/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employerName: c.employerName,
        contactName: c.contactName, contactRole: c.contactRole,
        contactEmail: c.contactEmail, contactPhone: c.contactPhone,
        status: c.status, assignedToId: c.assignedToId,
        consentAt: c.consentAt, outcome: c.outcome, decisionNote: c.decisionNote,
        claimed: c.claimed, verified: c.verified,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error ?? 'Could not save.')
      return
    }
    setSavedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    router.refresh()
  }

  async function logEmail() {
    setSaving(true); setErr(null)
    const res = await fetch(`/api/verification/${c.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setErr(d.error ?? 'Could not log that.'); return }
    setC((p) => ({ ...p, emails: [...p.emails, d.email] }))
    setComposing(false)
    setDraft({ direction: 'OUTBOUND', subject: '', body: '', fromAddress: '', toAddress: '' })
    router.refresh()
  }

  /** Logged by hand, so removable by hand — a wrong paste should not be permanent. */
  async function removeEmail(e: LoggedEmail) {
    if (!confirm(`Remove "${e.subject || 'this email'}" from the record?`)) return
    setRemovingEmail(e.id); setErr(null)
    const res = await fetch(`/api/verification/${c.id}/emails/${e.id}`, { method: 'DELETE' })
    setRemovingEmail(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error ?? 'Could not remove that.')
      return
    }
    setC((p) => ({ ...p, emails: p.emails.filter((x) => x.id !== e.id) }))
    router.refresh()
  }

  async function remove() {
    if (!confirm(`Delete this check and its ${c.emails.length} logged emails?`)) return
    setDeleting(true)
    const res = await fetch(`/api/verification/${c.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) { setErr('Could not delete.'); return }
    router.push('/dashboard/lifecycle/verification')
  }

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1600)
  }

  /** Drop a generated draft into the compose box rather than sending it. */
  function useTemplate(kind: 'consent' | 'request' | 'chaser') {
    const t = kind === 'consent'
      ? buildConsentRequest(employee.fullName)
      : kind === 'request'
        ? buildVerificationRequest({
            employeeName: employee.fullName,
            employerName: c.employerName,
            contactName: c.contactName,
            claimed: c.claimed,
          })
        : buildChaser({
            employeeName: employee.fullName,
            contactName: c.contactName,
            daysSince: c.requestedAt
              ? Math.max(1, Math.round((Date.now() - new Date(c.requestedAt).getTime()) / 86_400_000))
              : 7,
          })
    setDraft({
      direction: 'OUTBOUND',
      subject: t.subject,
      body: t.body,
      fromAddress: 'hr@convertt.co',
      toAddress: kind === 'consent' ? '' : c.contactEmail,
    })
    setComposing(true)
  }

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow-md">
        <Link
          href="/dashboard/lifecycle/verification"
          className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-xs mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All verifications
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{employee.fullName}</h1>
            <p className="text-white/70 text-sm mt-1">
              <span className="font-mono">{employee.employeeCode}</span>
              {employee.designation && ` · ${employee.designation}`}
              {' — checking '}<span className="text-white">{c.employerName}</span>
            </p>
          </div>
          <div className="text-right">
            <span className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border ${
              STATUS_TONE[c.status as VerificationStatus] ?? STATUS_TONE.NOT_STARTED
            }`}>
              {STATUS_LABELS[c.status as VerificationStatus] ?? c.status}
            </span>
            <p className="text-white/70 text-[11px] mt-2">
              {done.answered} of {done.total} answered
            </p>
          </div>
        </div>
      </div>

      {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{err}</p>}

      {!c.consentAt && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start justify-between gap-3 flex-wrap">
          <p className="text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
            <span>
              No consent recorded. Playbook 3.2 — and the UAE data protection law for
              Dubai hires — require the employee&apos;s written consent before anyone
              is contacted.
            </span>
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => useTemplate('consent')}>
              Draft the request
            </Button>
            <Button size="sm" onClick={() => set('consentAt', new Date().toISOString())}>
              <Check className="w-3.5 h-3.5 mr-1.5" /> Consent received
            </Button>
          </div>
        </div>
      )}

      {/* ── Who is being asked ─────────────────────────────────────── */}
      <Card title="Who is being asked">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Previous employer">
            <input className={inputCls} value={c.employerName}
              onChange={(e) => set('employerName', e.target.value)} />
          </Field>
          <Field label="Referee">
            <input className={inputCls} value={c.contactName}
              onChange={(e) => set('contactName', e.target.value)} />
          </Field>
          <Field label="Their designation">
            <input className={inputCls} value={c.contactRole}
              onChange={(e) => set('contactRole', e.target.value)} />
          </Field>
          <Field label="Work email">
            <input type="email" className={inputCls} value={c.contactEmail}
              onChange={(e) => set('contactEmail', e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={c.contactPhone}
              onChange={(e) => set('contactPhone', e.target.value)} />
          </Field>
          <Field label="Run by" hint="Verification is a person's job, not the department's">
            <select className={inputCls} value={c.assignedToId}
              onChange={(e) => set('assignedToId', e.target.value)}>
              <option value="">Nobody assigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
          </Field>
          <Field label="Where it stands">
            <select className={inputCls} value={c.status}
              onChange={(e) => set('status', e.target.value)}>
              {VERIFICATION_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {/* ── The two columns ────────────────────────────────────────── */}
      <Card
        title="Employment verification details"
        subtitle="Left is what we were told. Right is what the employer confirmed. Differences are flagged as you type."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="text-left font-semibold px-3 py-2 w-[26%]">Required field</th>
                <th className="text-left font-semibold px-3 py-2 w-[37%]">
                  Details provided by the candidate
                </th>
                <th className="text-left font-semibold px-3 py-2 w-[37%]">
                  As confirmed by {c.employerName || 'the employer'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {VERIFICATION_FIELDS.map((f) => {
                const flagged = discrepancies.find((d) => d.key === f.key)
                return (
                  <tr key={f.key} className={flagged ? 'bg-red-50/50' : ''}>
                    <td className="px-3 py-2 align-top">
                      <p className="text-slate-800 font-medium">{f.label}</p>
                      {f.hint && <p className="text-[11px] text-slate-500 mt-0.5">{f.hint}</p>}
                      {flagged && (
                        <p className={`text-[11px] mt-1 font-semibold ${
                          flagged.material ? 'text-red-700' : 'text-amber-700'
                        }`}>
                          {flagged.material ? 'Material mismatch' : 'Differs'}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <textarea
                        rows={f.narrative ? 3 : 1}
                        className={`${inputCls} resize-y`}
                        value={c.claimed[f.key] ?? ''}
                        onChange={(e) => setAnswer('claimed', f.key, e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <textarea
                        rows={f.narrative ? 3 : 1}
                        className={`${inputCls} resize-y`}
                        placeholder="Awaiting reply"
                        value={c.verified[f.key] ?? ''}
                        onChange={(e) => setAnswer('verified', f.key, e.target.value)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {discrepancies.length > 0 && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-semibold text-red-900 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              {discrepancies.length} field{discrepancies.length === 1 ? '' : 's'} disagree
            </p>
            <ul className="mt-1.5 space-y-1">
              {discrepancies.map((d) => (
                <li key={d.key} className="text-[11px] text-red-900">
                  <span className="font-semibold">{d.label}</span> — told &ldquo;{d.claimed}&rdquo;,
                  confirmed &ldquo;{d.verified}&rdquo;
                  {d.material && <span className="font-semibold"> (material)</span>}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-red-800 mt-2">
              Free-text answers are never auto-flagged — read those two columns yourself.
            </p>
          </div>
        )}
      </Card>

      {/* ── Correspondence ─────────────────────────────────────────── */}
      <Card
        title={`Correspondence · ${c.emails.length}`}
        subtitle="Every exchange, kept verbatim. Send from your own mailbox and paste the thread here."
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="ghost" onClick={() => useTemplate('consent')}>Consent draft</Button>
            <Button size="sm" variant="ghost" onClick={() => useTemplate('request')}>Request draft</Button>
            <Button size="sm" variant="ghost" onClick={() => useTemplate('chaser')}>Chaser draft</Button>
            <Button size="sm" variant="outline" onClick={() => setComposing(!composing)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Log an email
            </Button>
          </div>
        }
      >
        {composing && (
          <div className="rounded-lg border border-slate-200 p-3 mb-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Field label="Direction">
                <select className={inputCls} value={draft.direction}
                  onChange={(e) => setDraft({ ...draft, direction: e.target.value })}>
                  <option value="OUTBOUND">We sent</option>
                  <option value="INBOUND">They replied</option>
                </select>
              </Field>
              <Field label="From"><input className={inputCls} value={draft.fromAddress}
                onChange={(e) => setDraft({ ...draft, fromAddress: e.target.value })} /></Field>
              <Field label="To"><input className={inputCls} value={draft.toAddress}
                onChange={(e) => setDraft({ ...draft, toAddress: e.target.value })} /></Field>
              <Field label="Subject"><input className={inputCls} value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></Field>
            </div>
            <Field label="Body">
              <textarea rows={10} className={`${inputCls} font-mono text-[12.5px]`}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2">
              {draft.body && (
                <Button size="sm" variant="outline"
                  onClick={() => copy('draft', `${draft.subject}\n\n${draft.body}`)}>
                  {copied === 'draft' ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                  {copied === 'draft' ? 'Copied' : 'Copy to send'}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setComposing(false)}>Cancel</Button>
              <Button size="sm" onClick={logEmail} disabled={saving}>
                {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Save to the record
              </Button>
            </div>
          </div>
        )}

        {c.emails.length === 0 ? (
          <div className="text-center py-8">
            <Mail className="w-7 h-7 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">
              Nothing logged yet. Use a draft above, send it from your mailbox, then
              paste both sides here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {c.emails.map((e) => {
              const out = e.direction === 'OUTBOUND'
              return (
                <div key={e.id} className={`rounded-lg border p-3 ${
                  out ? 'border-slate-200 bg-white' : 'border-indigo-200 bg-indigo-50/40'
                }`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                      {out
                        ? <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                        : <ArrowDownLeft className="w-3.5 h-3.5 text-indigo-500" />}
                      {e.subject || '(no subject)'}
                    </p>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] text-slate-400">{stamp(e.occurredAt)}</span>
                      <button
                        type="button"
                        aria-label="Remove this email from the record"
                        title="Remove this email from the record"
                        disabled={removingEmail === e.id}
                        onClick={() => removeEmail(e)}
                        className="text-slate-300 hover:text-red-600 disabled:opacity-50"
                      >
                        {removingEmail === e.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {out ? 'Sent' : 'Received'}
                    {e.fromAddress && ` · from ${e.fromAddress}`}
                    {e.toAddress && ` · to ${e.toAddress}`}
                  </p>
                  <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-slate-700 mt-2 bg-white/70 border border-slate-100 rounded p-2.5 overflow-x-auto">
                    {e.body}
                  </pre>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ── Decision ───────────────────────────────────────────────── */}
      <Card
        title="Decision"
        subtitle="What the answers imply is shown first. What HR concluded is what gets recorded."
      >
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 mb-4">
          <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
            Suggested
          </p>
          <p className="text-sm text-slate-900 mt-0.5">
            {OUTCOME_LABELS[suggested].label}
            <span className="text-slate-500"> — {OUTCOME_LABELS[suggested].meaning}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
          {OUTCOMES.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => set('outcome', c.outcome === o ? null : o)}
              className={`text-left rounded-lg border p-2.5 transition-colors ${
                c.outcome === o
                  ? 'border-slate-900 bg-slate-50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                {OUTCOME_LABELS[o as Outcome].label}
                {c.outcome === o && <Check className="w-3.5 h-3.5 ml-auto" />}
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                {OUTCOME_LABELS[o as Outcome].meaning}
              </span>
            </button>
          ))}
        </div>

        <Field label="What we concluded, and why">
          <textarea rows={4} className={inputCls} value={c.decisionNote}
            placeholder="The reasoning someone should be able to read back in six months."
            onChange={(e) => set('decisionNote', e.target.value)} />
        </Field>
      </Card>

      {/* ── Save bar ───────────────────────────────────────────────── */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 flex-wrap bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
        <p className="text-[11px] text-slate-500">
          {savedAt ? `Saved at ${savedAt}` : 'Unsaved changes'}
          {c.consentAt && ` · consent recorded ${stamp(c.consentAt)}`}
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
  )
}

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
