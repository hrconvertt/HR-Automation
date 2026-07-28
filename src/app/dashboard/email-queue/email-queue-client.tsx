'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Mail, MailCheck, Send, Edit3, Trash2, AlertTriangle, CheckCircle2,
  Clock, Sparkles, PlusCircle,
} from 'lucide-react'
import { TRIGGER_LABELS } from '@/lib/email-templates'

type Draft = {
  id: string
  employeeId: string | null
  toEmail: string
  toName: string | null
  ccEmails: string | null
  bccEmails: string | null
  subject: string
  bodyHtml: string
  trigger: string
  status: string
  createdAt: string
  sentAt: string | null
  sendError: string | null
  employee: { fullName: string; employeeCode: string; designation: string } | null
}

const STATUS_TONES: Record<string, { label: string; tone: 'success' | 'warning' | 'destructive' | 'secondary' | 'default'; icon?: React.ComponentType<{ className?: string }> }> = {
  DRAFT:     { label: 'Draft',     tone: 'warning',     icon: Edit3 },
  APPROVED:  { label: 'Approved',  tone: 'default',     icon: CheckCircle2 },
  SENT:      { label: 'Sent',      tone: 'success',     icon: MailCheck },
  REJECTED:  { label: 'Rejected',  tone: 'secondary',   icon: Trash2 },
  FAILED:    { label: 'Failed',    tone: 'destructive', icon: AlertTriangle },
}

export default function EmailQueueClient({ smtpConfigured }: { smtpConfigured: boolean }) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'ALL' | 'DRAFT' | 'SENT' | 'FAILED'>('DRAFT')
  const [selected, setSelected] = useState<Draft | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)

  const fetchDrafts = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/emails/queue' + (filter !== 'ALL' ? `?status=${filter}` : ''))
    const data = await res.json()
    setDrafts(data.drafts ?? [])
    setLoading(false)
  }, [filter])

  useEffect(() => { fetchDrafts() }, [fetchDrafts])

  const counts = {
    draft: drafts.filter(d => d.status === 'DRAFT').length,
    sent: drafts.filter(d => d.status === 'SENT').length,
    failed: drafts.filter(d => d.status === 'FAILED').length,
  }

  return (
    <div className="space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Mail className="w-6 h-6 text-slate-700" /> Email Approval Queue
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Review, edit and approve outgoing HR emails before they're sent.</p>
        </div>
        <Button onClick={() => setComposeOpen(true)}>
          <PlusCircle className="w-4 h-4 mr-1" /> Compose Email
        </Button>
      </div>

      {/* SMTP status banner */}
      {!smtpConfigured ? (
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Gmail SMTP not configured.</strong> Approved emails will be queued for sending but won't go out
            until you add Gmail credentials to <code className="px-1 py-0.5 bg-slate-100 rounded text-[11px]">.env</code>.
            <details className="mt-2">
              <summary className="cursor-pointer text-xs underline">How to set this up</summary>
              <ol className="list-decimal list-inside mt-2 space-y-1 text-xs">
                <li>Go to your Google Account → <strong>Security</strong> → <strong>App passwords</strong></li>
                <li>Generate an app password for <code>hr@convertt.co</code></li>
                <li>Add to <code>.env</code>: <code className="px-1 bg-slate-100">SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_USER=hr@convertt.co SMTP_PASS=&lt;app-password&gt; SMTP_FROM="Convertt HR &lt;hr@convertt.co&gt;"</code></li>
                <li>Restart the dev server</li>
              </ol>
            </details>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-2 text-sm text-slate-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Gmail SMTP is configured — approved emails will send immediately.
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1">
        <FilterChip label={`Drafts (${counts.draft})`} active={filter === 'DRAFT'} onClick={() => setFilter('DRAFT')} />
        <FilterChip label={`Sent (${counts.sent})`} active={filter === 'SENT'} onClick={() => setFilter('SENT')} />
        <FilterChip label={`Failed (${counts.failed})`} active={filter === 'FAILED'} onClick={() => setFilter('FAILED')} />
        <FilterChip label="All" active={filter === 'ALL'} onClick={() => setFilter('ALL')} />
      </div>

      {/* Drafts list */}
      {loading ? (
        <p className="text-center text-slate-400 py-10">Loading…</p>
      ) : drafts.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-slate-400">
            <Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No emails in this view.
            {filter === 'DRAFT' && <p className="text-xs mt-2">When you start an onboarding or offboarding journey, the right email lands here as a draft for your review.</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {drafts.map((d) => {
            const tone = STATUS_TONES[d.status] ?? { label: d.status, tone: 'secondary' as const, icon: Mail }
            const Icon = tone.icon ?? Mail
            return (
              <Card key={d.id}>
                <button
                  onClick={() => setSelected(d)}
                  className="w-full text-left p-4 flex items-start justify-between gap-4 hover:bg-slate-50/60"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={
                      'w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ' +
                      (d.status === 'SENT' ? 'bg-slate-100 text-slate-700' :
                       d.status === 'FAILED' ? 'bg-slate-100 text-slate-700' :
                       'bg-slate-100 text-slate-700')
                    }>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900 truncate">{d.subject}</span>
                        <Badge variant={tone.tone}>{tone.label}</Badge>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                          {TRIGGER_LABELS[d.trigger as keyof typeof TRIGGER_LABELS] ?? d.trigger}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        To: <strong>{d.toName ?? d.toEmail}</strong> &lt;{d.toEmail}&gt;
                        {d.ccEmails && <span className="ml-2">· Cc: {d.ccEmails}</span>}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {d.status === 'SENT' && d.sentAt
                          ? <>Sent <Clock className="w-3 h-3 inline -mt-0.5" /> {new Date(d.sentAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</>
                          : <>Created {new Date(d.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</>}
                        {d.sendError && <span className="text-slate-700 ml-2">· {d.sendError}</span>}
                      </p>
                    </div>
                  </div>
                </button>
              </Card>
            )
          })}
        </div>
      )}

      {/* Preview / Edit dialog */}
      {selected && (
        <EmailDraftDialog
          draft={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { fetchDrafts(); setSelected(null) }}
        />
      )}

      {/* Compose dialog */}
      {composeOpen && (
        <ComposeDialog
          onClose={() => setComposeOpen(false)}
          onCreated={() => { fetchDrafts(); setComposeOpen(false) }}
        />
      )}
    </div>
  )
}

// ─── Compose new email dialog ────────────────────────────────────────────────

type EmpOption = { id: string; fullName: string; email: string }
type EmailTriggerKey = 'OFFER_PERMANENT' | 'OFFER_INTERN' | 'CONFIRMATION' | 'NOTICE_PERIOD' | 'TERMINATION' | 'EXPERIENCE_LETTER' | 'CUSTOM'

function ComposeDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [employees, setEmployees] = useState<EmpOption[]>([])
  const [mode, setMode] = useState<'template' | 'custom'>('template')
  const [employeeId, setEmployeeId] = useState('')
  const [trigger, setTrigger] = useState<EmailTriggerKey>('OFFER_PERMANENT')
  const [reason, setReason] = useState('')
  const [toEmail, setToEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/employees?limit=200')
      .then((r) => r.json())
      .then((d) => setEmployees(d.employees ?? d.items ?? []))
  }, [])

  async function handleCreate() {
    setError('')
    setBusy(true)
    const body = mode === 'template'
      ? { employeeId, trigger, extras: trigger === 'TERMINATION' ? { reason } : undefined }
      : { toEmail, subject, bodyHtml, trigger: 'CUSTOM' }
    const res = await fetch('/api/emails/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Failed'); return }
    onCreated()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-slate-700" /> Compose Email
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">New drafts are queued for your final review before sending.</p>
        </DialogHeader>

        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setMode('template')}
            className={`flex-1 text-xs py-2 rounded-md ${mode === 'template' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            From template
          </button>
          <button
            onClick={() => setMode('custom')}
            className={`flex-1 text-xs py-2 rounded-md ${mode === 'custom' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            Custom email
          </button>
        </div>

        {mode === 'template' ? (
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full text-sm rounded-md border border-slate-200 px-3 h-9"
              >
                <option value="">Select an employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName} — {e.email}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Template</Label>
              <select
                value={trigger}
                onChange={(e) => setTrigger(e.target.value as EmailTriggerKey)}
                className="w-full text-sm rounded-md border border-slate-200 px-3 h-9"
              >
                <option value="OFFER_PERMANENT">Offer Letter (Permanent / Probation)</option>
                <option value="OFFER_INTERN">Offer Letter (Training / Internship)</option>
                <option value="CONFIRMATION">Confirmation of Employment</option>
                <option value="NOTICE_PERIOD">Notice Period Confirmation</option>
                <option value="TERMINATION">Termination of Employment</option>
                <option value="EXPERIENCE_LETTER">Experience Letter</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">Body auto-fills from the employee's data.</p>
            </div>
            {trigger === 'TERMINATION' && (
              <div>
                <Label>Termination reason</Label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
                  placeholder="e.g. Failure to meet performance standards…"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>To</Label>
              <Input value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="someone@convertt.co" />
            </div>
            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label>Body (HTML)</Label>
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={10}
                className="w-full text-sm rounded-md border border-slate-200 px-3 py-2 font-mono"
                placeholder="<p>Hi,</p><p>...</p>"
              />
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={busy}>
            {busy ? 'Creating…' : 'Add to Queue'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">
      {children}
    </label>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        'px-3 py-1.5 rounded-full text-xs font-medium ' +
        (active ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
      }
    >
      {label}
    </button>
  )
}

// ─── Preview / Edit / Send dialog ────────────────────────────────────────────

function EmailDraftDialog({ draft, onClose, onChanged }: { draft: Draft; onClose: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    toEmail: draft.toEmail,
    ccEmails: draft.ccEmails ?? '',
    bccEmails: draft.bccEmails ?? '',
    subject: draft.subject,
    bodyHtml: draft.bodyHtml,
  })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function save() {
    setBusy('save'); setError('')
    const res = await fetch(`/api/emails/queue/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setBusy('')
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Save failed'); return }
    setEditing(false)
    onChanged()
  }

  async function sendNow() {
    if (!confirm('Send this email now? It will go out to ' + form.toEmail)) return
    if (editing) await save()
    setBusy('send'); setError('')
    const res = await fetch(`/api/emails/queue/${draft.id}/send`, { method: 'POST' })
    const data = await res.json()
    setBusy('')
    if (!res.ok) {
      setError((data.error ?? 'Send failed') + (data.transport ? ` (${data.transport})` : ''))
      return
    }
    onChanged()
  }

  async function reject() {
    if (!confirm('Reject this draft? It will be discarded.')) return
    setBusy('reject')
    await fetch(`/api/emails/queue/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'REJECTED' }),
    })
    setBusy('')
    onChanged()
  }

  const canEdit = draft.status === 'DRAFT' || draft.status === 'FAILED'

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">

        {/* Gmail-style header */}
        <div className="bg-slate-900 text-white px-6 py-4">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Mail className="w-4 h-4" />
              {canEdit ? (editing ? 'Edit Draft' : 'Review Draft') : 'View Email'}
              <Badge variant="secondary" className="ml-2 text-[10px]">{TRIGGER_LABELS[draft.trigger as keyof typeof TRIGGER_LABELS] ?? draft.trigger}</Badge>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Headers */}
          <div className="space-y-2.5">
            <Field label="To" value={form.toEmail} editing={editing} onChange={(v) => setForm({ ...form, toEmail: v })} />
            <Field label="Cc" value={form.ccEmails} editing={editing} onChange={(v) => setForm({ ...form, ccEmails: v })} placeholder="(optional)" />
            <Field label="Bcc" value={form.bccEmails} editing={editing} onChange={(v) => setForm({ ...form, bccEmails: v })} placeholder="(optional)" />
            <Field label="Subject" value={form.subject} editing={editing} onChange={(v) => setForm({ ...form, subject: v })} bold />
          </div>

          {/* Body */}
          <div className="border-t border-slate-200 pt-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold mb-2">Body</p>
            {editing ? (
              <textarea
                value={form.bodyHtml}
                onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })}
                rows={18}
                className="w-full text-xs rounded-md border border-slate-200 px-3 py-2 font-mono leading-relaxed"
              />
            ) : (
              <div
                className="prose prose-sm max-w-none border border-slate-100 rounded-md p-4 bg-slate-50/40 max-h-[420px] overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: form.bodyHtml }}
              />
            )}
          </div>

          {error && (
            <div className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-md p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
            </div>
          )}

          {!canEdit && draft.status === 'SENT' && (
            <div className="text-sm text-slate-900 bg-slate-50 border border-slate-100 rounded-md p-3 flex items-center gap-2">
              <MailCheck className="w-4 h-4" /> Sent {draft.sentAt && `on ${new Date(draft.sentAt).toLocaleString('en-GB')}`}
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={!!busy}>Close</Button>
          {canEdit && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={reject}
                disabled={!!busy}
                className="text-slate-700 border-slate-100 hover:bg-slate-50"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Reject
              </Button>
              {editing ? (
                <Button variant="outline" onClick={save} disabled={!!busy}>
                  {busy === 'save' ? 'Saving…' : 'Save Changes'}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setEditing(true)} disabled={!!busy}>
                  <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit
                </Button>
              )}
              <Button
                onClick={sendNow}
                disabled={!!busy}
                className="bg-slate-700 hover:bg-slate-700 text-white"
              >
                <Send className="w-3.5 h-3.5 mr-1" /> {busy === 'send' ? 'Sending…' : 'Approve & Send'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, value, editing, onChange, placeholder, bold }: {
  label: string; value: string; editing: boolean; onChange: (v: string) => void;
  placeholder?: string; bold?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold w-12 shrink-0">{label}</span>
      {editing ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 h-8"
        />
      ) : (
        <span className={'flex-1 text-sm ' + (bold ? 'font-semibold text-slate-900' : 'text-slate-700') + (value ? '' : ' text-slate-300 italic')}>
          {value || placeholder || '—'}
        </span>
      )}
    </div>
  )
}
