'use client'

/**
 * Training & Development — programs, enrolments, certifications.
 *
 * HR creates programs, enrols people (a whole team at once), moves an enrolment
 * along its status, and keeps the certification register. Everyone else reads.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  GraduationCap, Plus, Loader2, Trash2, Users, Award, BookOpen, AlertTriangle, ExternalLink, Search,
} from 'lucide-react'
import {
  PROGRAM_TYPES, PROGRAM_TYPE_LABELS, RECORD_STATUSES, RECORD_STATUS_LABELS,
  RECORD_STATUS_TONE, certExpiryState,
  type ProgramType, type RecordStatus,
} from '@/lib/learning'

interface Staff { id: string; fullName: string; employeeCode: string }
interface Program {
  id: string; title: string; type: string; provider: string | null
  description: string | null; duration: number | null; cost: number | null; enrolled: number
}
interface Record {
  id: string; employeeName: string; employeeCode: string
  programTitle: string; programType: string; status: string
  score: number | null; startDate: string; endDate: string | null
}
interface Cert {
  id: string; employeeName: string; name: string; issuedBy: string
  issuedDate: string; expiryDate: string | null; credentialUrl: string | null
}

const inputCls =
  'w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none '
  + 'focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400'
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'

export function LearningClient({ isHR, tab = 'programs', staff, programs, records, certs }: {
  isHR: boolean; tab?: string; staff: Staff[]; programs: Program[]; records: Record[]; certs: Cert[]
}) {
  const router = useRouter()
  const [err, setErr] = useState<string | null>(null)

  const expiringCount = certs.filter((c) => {
    const s = certExpiryState(c.expiryDate)
    return s === 'expiring' || s === 'expired'
  }).length

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur"><GraduationCap className="w-6 h-6" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Training &amp; Development</h1>
            <p className="text-white/85 text-sm mt-1">
              Programs, who is on them, and the certifications people hold.
              {expiringCount > 0 && ` ${expiringCount} certification${expiringCount === 1 ? '' : 's'} expiring or expired.`}
            </p>
          </div>
        </div>
      </div>

      {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat icon={<BookOpen className="w-4 h-4" />} label="Programs" value={String(programs.length)} />
        <Stat icon={<Users className="w-4 h-4" />} label="Enrolments" value={String(records.length)} />
        <Stat icon={<Award className="w-4 h-4" />} label="Certifications" value={String(certs.length)} />
      </div>

      {/* The three areas are reached from the sidebar (Programs / Enrolments /
          Certifications), not in-page tabs — the ?tab= param picks the view. */}
      {tab === 'records' ? (
        <RecordsTab isHR={isHR} records={records} onErr={setErr} onDone={() => router.refresh()} />
      ) : tab === 'certs' ? (
        <CertsTab isHR={isHR} certs={certs} staff={staff} onErr={setErr} onDone={() => router.refresh()} />
      ) : (
        <ProgramsTab isHR={isHR} programs={programs} staff={staff} onErr={setErr} onDone={() => router.refresh()} />
      )}
    </div>
  )
}

// ── Programs ─────────────────────────────────────────────────────────────────

function ProgramsTab({ isHR, programs, staff, onErr, onDone }: {
  isHR: boolean; programs: Program[]; staff: Staff[]
  onErr: (s: string | null) => void; onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [enrolFor, setEnrolFor] = useState<Program | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ title: '', type: 'TECHNICAL', provider: '', duration: '', cost: '', description: '' })

  async function create() {
    setBusy(true); onErr(null)
    const res = await fetch('/api/learning/programs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
    })
    setBusy(false)
    if (!res.ok) { onErr((await res.json().catch(() => ({}))).error ?? 'Could not create.'); return }
    setOpen(false)
    setDraft({ title: '', type: 'TECHNICAL', provider: '', duration: '', cost: '', description: '' })
    onDone()
  }

  async function remove(p: Program) {
    if (!confirm(`Delete "${p.title}"${p.enrolled ? ` and its ${p.enrolled} enrolments` : ''}?`)) return
    const res = await fetch(`/api/learning/programs/${p.id}`, { method: 'DELETE' })
    if (!res.ok) { onErr('Could not delete.'); return }
    onDone()
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-500"><span className="font-semibold text-slate-900">{programs.length}</span> programs</p>
        {isHR && <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-3.5 h-3.5 mr-1.5" /> New program</Button>}
      </div>

      {programs.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">No programs yet.</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {programs.map((p) => (
            <div key={p.id} className="px-4 py-3 flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                  {p.title}
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                    {PROGRAM_TYPE_LABELS[p.type as ProgramType] ?? p.type}
                  </span>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {p.provider && `${p.provider} · `}
                  {p.duration != null && `${p.duration}h · `}
                  {p.cost != null && `PKR ${p.cost.toLocaleString('en-PK')} · `}
                  {p.enrolled} enrolled
                </p>
                {p.description && <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{p.description}</p>}
              </div>
              {isHR && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setEnrolFor(p)}>
                    <Users className="w-3.5 h-3.5 mr-1.5" /> Enrol
                  </Button>
                  <button type="button" aria-label="Delete" className="text-slate-400 hover:text-red-600 p-1" onClick={() => remove(p)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New program */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New program</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Labeled label="Title">
              <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Type">
                <select className={`${inputCls} bg-white`} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                  {PROGRAM_TYPES.map((t) => <option key={t} value={t}>{PROGRAM_TYPE_LABELS[t]}</option>)}
                </select>
              </Labeled>
              <Labeled label="Provider">
                <input className={inputCls} value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })} />
              </Labeled>
              <Labeled label="Duration (hours)">
                <input type="number" className={inputCls} value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} />
              </Labeled>
              <Labeled label="Cost (PKR)">
                <input type="number" className={inputCls} value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} />
              </Labeled>
            </div>
            <Labeled label="Description">
              <textarea rows={2} className={inputCls} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Labeled>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!draft.title.trim() || busy} onClick={create}>
              {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {enrolFor && <EnrolDialog program={enrolFor} staff={staff} onClose={() => setEnrolFor(null)} onErr={onErr} onDone={onDone} />}
    </div>
  )
}

function EnrolDialog({ program, staff, onClose, onErr, onDone }: {
  program: Program; staff: Staff[]; onClose: () => void
  onErr: (s: string | null) => void; onDone: () => void
}) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const view = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? staff.filter((s) => s.fullName.toLowerCase().includes(n) || s.employeeCode.toLowerCase().includes(n)) : staff
  }, [staff, q])

  async function enrol() {
    if (picked.size === 0) return
    setBusy(true); onErr(null)
    const res = await fetch('/api/learning/records', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programId: program.id, employeeIds: [...picked] }),
    })
    setBusy(false)
    if (!res.ok) { onErr((await res.json().catch(() => ({}))).error ?? 'Could not enrol.'); return }
    onClose(); onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Enrol on {program.title}</DialogTitle></DialogHeader>
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find people" className={`${inputCls} pl-8`} />
        </div>
        <div className="max-h-64 overflow-y-auto divide-y divide-slate-50 border border-slate-100 rounded-lg">
          {view.map((s) => (
            <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50">
              <input type="checkbox" className="w-4 h-4 accent-slate-900" checked={picked.has(s.id)}
                onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n })} />
              <span className="text-sm text-slate-800">{s.fullName}</span>
              <span className="text-[11px] text-slate-400 ml-auto font-mono">{s.employeeCode}</span>
            </label>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <span className="text-[11px] text-slate-500 mr-auto self-center">{picked.size} selected</span>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={picked.size === 0 || busy} onClick={enrol}>
            {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Enrol {picked.size || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Enrolments ───────────────────────────────────────────────────────────────

function RecordsTab({ isHR, records, onErr, onDone }: {
  isHR: boolean; records: Record[]; onErr: (s: string | null) => void; onDone: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)

  async function setStatus(r: Record, status: string) {
    setBusyId(r.id); onErr(null)
    const res = await fetch(`/api/learning/records/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    setBusyId(null)
    if (!res.ok) { onErr('Could not update.'); return }
    onDone()
  }
  async function remove(r: Record) {
    if (!confirm(`Remove ${r.employeeName} from ${r.programTitle}?`)) return
    const res = await fetch(`/api/learning/records/${r.id}`, { method: 'DELETE' })
    if (!res.ok) { onErr('Could not remove.'); return }
    onDone()
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {records.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">Nobody is enrolled yet. Enrol people from the Programs tab.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="text-left font-semibold px-4 py-2">Employee</th>
                <th className="text-left font-semibold px-3 py-2">Program</th>
                <th className="text-left font-semibold px-3 py-2 w-40">Status</th>
                <th className="text-left font-semibold px-3 py-2">Started</th>
                <th className="text-left font-semibold px-3 py-2">Completed</th>
                {isHR && <th className="w-8" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <p className="text-slate-900">{r.employeeName}</p>
                    <p className="text-[11px] font-mono text-slate-400">{r.employeeCode}</p>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{r.programTitle}</td>
                  <td className="px-3 py-2">
                    {isHR ? (
                      <select
                        value={r.status}
                        disabled={busyId === r.id}
                        onChange={(e) => setStatus(r, e.target.value)}
                        className={`text-xs rounded border px-2 py-1 ${RECORD_STATUS_TONE[r.status as RecordStatus] ?? ''}`}
                      >
                        {RECORD_STATUSES.map((s) => <option key={s} value={s}>{RECORD_STATUS_LABELS[s]}</option>)}
                      </select>
                    ) : (
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${RECORD_STATUS_TONE[r.status as RecordStatus] ?? ''}`}>
                        {RECORD_STATUS_LABELS[r.status as RecordStatus] ?? r.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-500">{day(r.startDate)}</td>
                  <td className="px-3 py-2 text-[11px] text-slate-500">{day(r.endDate)}</td>
                  {isHR && (
                    <td className="px-2 py-2">
                      <button type="button" aria-label="Remove" className="text-slate-400 hover:text-red-600" onClick={() => remove(r)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Certifications ───────────────────────────────────────────────────────────

function CertsTab({ isHR, certs, staff, onErr, onDone }: {
  isHR: boolean; certs: Cert[]; staff: Staff[]
  onErr: (s: string | null) => void; onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ employeeId: '', name: '', issuedBy: '', issuedDate: '', expiryDate: '', credentialUrl: '' })

  async function add() {
    setBusy(true); onErr(null)
    const res = await fetch('/api/learning/certifications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
    })
    setBusy(false)
    if (!res.ok) { onErr((await res.json().catch(() => ({}))).error ?? 'Could not add.'); return }
    setOpen(false)
    setDraft({ employeeId: '', name: '', issuedBy: '', issuedDate: '', expiryDate: '', credentialUrl: '' })
    onDone()
  }
  async function remove(c: Cert) {
    if (!confirm(`Remove ${c.name} for ${c.employeeName}?`)) return
    const res = await fetch(`/api/learning/certifications/${c.id}`, { method: 'DELETE' })
    if (!res.ok) { onErr('Could not remove.'); return }
    onDone()
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-500"><span className="font-semibold text-slate-900">{certs.length}</span> certifications</p>
        {isHR && <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-3.5 h-3.5 mr-1.5" /> Add certification</Button>}
      </div>

      {certs.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">No certifications on record.</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {certs.map((c) => {
            const state = certExpiryState(c.expiryDate)
            return (
              <div key={c.id} className="px-4 py-3 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                    {c.name}
                    {c.credentialUrl && (
                      <a href={c.credentialUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-700">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {state === 'expired' && <Flag tone="red" text="Expired" />}
                    {state === 'expiring' && <Flag tone="amber" text="Expiring soon" />}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {c.employeeName} · {c.issuedBy} · issued {day(c.issuedDate)}
                    {c.expiryDate && ` · expires ${day(c.expiryDate)}`}
                  </p>
                </div>
                {isHR && (
                  <button type="button" aria-label="Remove" className="text-slate-400 hover:text-red-600 p-1 flex-shrink-0" onClick={() => remove(c)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add certification</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Labeled label="Employee">
              <select className={`${inputCls} bg-white`} value={draft.employeeId} onChange={(e) => setDraft({ ...draft, employeeId: e.target.value })}>
                <option value="">Pick an employee</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName} — {s.employeeCode}</option>)}
              </select>
            </Labeled>
            <Labeled label="Certification name">
              <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. AWS Solutions Architect" />
            </Labeled>
            <Labeled label="Issued by">
              <input className={inputCls} value={draft.issuedBy} onChange={(e) => setDraft({ ...draft, issuedBy: e.target.value })} />
            </Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Issued date">
                <input type="date" className={inputCls} value={draft.issuedDate} onChange={(e) => setDraft({ ...draft, issuedDate: e.target.value })} />
              </Labeled>
              <Labeled label="Expiry (optional)">
                <input type="date" className={inputCls} value={draft.expiryDate} onChange={(e) => setDraft({ ...draft, expiryDate: e.target.value })} />
              </Labeled>
            </div>
            <Labeled label="Credential URL (optional)">
              <input className={inputCls} value={draft.credentialUrl} onChange={(e) => setDraft({ ...draft, credentialUrl: e.target.value })} />
            </Labeled>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!draft.employeeId || !draft.name.trim() || busy} onClick={add}>
              {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Bits ─────────────────────────────────────────────────────────────────────

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
      <div className="rounded-lg bg-slate-50 p-2 text-slate-600">{icon}</div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-lg font-semibold text-slate-900 tabular-nums">{value}</p>
      </div>
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function Flag({ tone, text }: { tone: 'red' | 'amber'; text: string }) {
  const cls = tone === 'red'
    ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-amber-50 text-amber-800 border-amber-200'
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
      <AlertTriangle className="w-2.5 h-2.5" /> {text}
    </span>
  )
}
