'use client'

/**
 * The Show Cause notice as a record: its dates, how it reached the employee,
 * what they are directed to do, who is kept informed, and the signed letter.
 *
 * Every date is shown in Pakistan time. A notice emailed at 8:15 PM on the
 * 16th was issued on the 16th, and a reply due on the 20th can arrive until
 * midnight on the 20th in Lahore.
 */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { FileText, Pencil } from 'lucide-react'

const TZ = 'Asia/Karachi'

export interface InformedPerson { id: string; fullName: string; designation: string; asLead: boolean }

export interface NoticeRecord {
  id: string
  status: string
  severity: string
  issueType: string
  issueDate: string | null
  deadline: string | null
  description: string | null
  issuedBy: string | null
  subject: string | null
  caseRef: string | null
  deliveredAt: string | null
  deliveredVia: string | null
  directives: string | null
  informedIds: string[]
  informed: InformedPerson[]
  hasLetter: boolean
  letterName: string | null
  responseAt: string | null
  employee: { id: string; fullName: string; reportingManagerId: string | null }
}

interface EmployeeOption {
  id: string; fullName: string; employeeCode: string; designation: string; reportingManagerId: string | null
}

export const VIA_LABEL: Record<string, string> = {
  EMAIL: 'by email', HAND: 'by hand', WHATSAPP: 'on WhatsApp', APP: 'in the HR app',
}

// ─── Dates ───────────────────────────────────────────────────────────────────

export function fmtPkDate(iso: string | null, weekday = false): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    ...(weekday ? { weekday: 'short' as const } : {}), day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ,
  })
}

export function fmtPkDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
  })
}

/** "YYYY-MM-DD" of an instant, in Pakistan. */
export function pkYmd(iso: string | Date | null): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  return parts
}

/** "YYYY-MM-DDTHH:mm" of an instant in Pakistan, for a datetime-local input. */
function pkLocalInput(iso: string | null): string {
  if (!iso) return ''
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`
}

/** A datetime-local value typed in Pakistan time, as an instant. */
function fromPkLocal(v: string): string | null {
  if (!v) return null
  const d = new Date(`${v}:00+05:00`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function addDays(ymd: string, days: number): string {
  if (!ymd) return ''
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000)
}

const WEEKEND = (ymd: string) => [0, 6].includes(new Date(`${ymd}T12:00:00Z`).getUTCDay())

export function dueState(n: Pick<NoticeRecord, 'deadline' | 'responseAt' | 'status'>): { label: string; tone: 'destructive' | 'warning' | 'default' | 'success' | 'secondary' } | null {
  if (!n.deadline) return null
  const due = pkYmd(n.deadline)
  if (n.responseAt) {
    const late = daysBetween(due, pkYmd(n.responseAt))
    return late > 0
      ? { label: `Replied ${late} day${late === 1 ? '' : 's'} late`, tone: 'warning' }
      : { label: 'Replied on time', tone: 'success' }
  }
  if (['RESOLVED', 'ESCALATED_TO_PIP', 'ESCALATED_TERMINATION'].includes(n.status)) return null
  const left = daysBetween(pkYmd(new Date()), due)
  if (left < 0) return { label: `No reply — overdue by ${-left} day${left === -1 ? '' : 's'}`, tone: 'destructive' }
  if (left === 0) return { label: 'Reply due today', tone: 'warning' }
  return { label: `Reply due in ${left} day${left === 1 ? '' : 's'}`, tone: 'default' }
}

export function DueBadge({ notice }: { notice: Pick<NoticeRecord, 'deadline' | 'responseAt' | 'status'> }) {
  const s = dueState(notice)
  if (!s) return null
  return <Badge variant={s.tone}>{s.label}</Badge>
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

function useEmployees(open = true) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  useEffect(() => {
    if (!open) return
    fetch('/api/employees?limit=300&status=ACTIVE')
      .then((r) => r.json())
      .then((d) => setEmployees(d.employees ?? d.items ?? []))
      .catch(() => {})
  }, [open])
  return employees
}

const label = 'block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1'
const area = 'w-full text-sm rounded-md border border-slate-200 px-3 py-2'

// ─── The record, inside a notice ─────────────────────────────────────────────

export function NoticeRecordSection({ notice, isHR, onSaved }: {
  notice: NoticeRecord; isHR: boolean; onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const directives = (notice.directives ?? '').split('\n').map((l) => l.replace(/^[-•\s]+/, '').trim()).filter(Boolean)
  const dueYmd = notice.deadline ? pkYmd(notice.deadline) : ''

  if (!notice.issueDate) return null
  if (editing) return <EditRecordForm notice={notice} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onSaved() }} />

  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Notice record</p>
          {notice.subject && <p className="text-sm font-semibold text-slate-900 mt-0.5">{notice.subject}</p>}
          {notice.caseRef && <p className="text-xs text-slate-500">Matter: {notice.caseRef}</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          {notice.hasLetter && (
            <Button variant="outline" size="sm" onClick={() => window.open(`/api/performance/show-cause/${notice.id}/letter`, '_blank')}>
              <FileText className="w-4 h-4 mr-1.5" /> Open signed notice
            </Button>
          )}
          {isHR && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="w-4 h-4 mr-1.5" /> Edit record
            </Button>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Fact term="Issued on">{fmtPkDate(notice.issueDate, true)}{notice.issuedBy ? ` · by ${notice.issuedBy}` : ''}</Fact>
        <Fact term="Sent to the employee">
          {notice.deliveredAt ? `${fmtPkDateTime(notice.deliveredAt)}${notice.deliveredVia ? ` ${VIA_LABEL[notice.deliveredVia] ?? ''}` : ''}` : 'Not recorded'}
        </Fact>
        <Fact term="Response due">
          {notice.deadline ? (
            <span className="inline-flex items-center gap-2 flex-wrap">
              <span>{fmtPkDate(notice.deadline, true)}</span>
              <DueBadge notice={notice} />
            </span>
          ) : 'No deadline set'}
          {dueYmd && WEEKEND(dueYmd) && !notice.responseAt && (
            <span className="block text-[11px] text-slate-500 mt-0.5">Falls on a weekend.</span>
          )}
        </Fact>
        <Fact term="Response received">{notice.responseAt ? fmtPkDateTime(notice.responseAt) : 'Not yet'}</Fact>
        <Fact term="Severity">{notice.severity.charAt(0) + notice.severity.slice(1).toLowerCase()}</Fact>
        {notice.informed.length > 0 && (
          <Fact term="Kept informed">
            {notice.informed.map((p) => (
              <span key={p.id} className="block">
                {p.fullName}
                <span className="text-slate-500">{p.asLead ? ' — reporting lead' : p.designation ? ` — ${p.designation}` : ''}</span>
              </span>
            ))}
          </Fact>
        )}
      </dl>

      {directives.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
            Directed to deliver{notice.deadline ? ` by ${fmtPkDate(notice.deadline)}` : ''}
          </p>
          <ol className="list-decimal pl-5 text-sm text-slate-800 space-y-0.5">
            {directives.map((d, i) => <li key={i}>{d}</li>)}
          </ol>
        </div>
      )}
    </div>
  )
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">{term}</dt>
      <dd className="text-slate-900 mt-0.5">{children}</dd>
    </div>
  )
}

function InformedPicker({ employees, value, onChange, exclude, leadIds }: {
  employees: EmployeeOption[]; value: string[]; onChange: (ids: string[]) => void; exclude: string[]; leadIds: string[]
}) {
  const [q, setQ] = useState('')
  const shown = employees
    .filter((e) => !exclude.includes(e.id))
    .filter((e) => !q || `${e.fullName} ${e.designation}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="rounded-md border border-slate-200">
      <div className="p-2 border-b border-slate-100">
        <Input placeholder="Search people to keep informed" value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />
      </div>
      <div className="max-h-44 overflow-y-auto divide-y divide-slate-50">
        {shown.map((e) => (
          <label key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={value.includes(e.id)}
              onChange={(ev) => onChange(ev.target.checked ? [...value, e.id] : value.filter((x) => x !== e.id))}
            />
            <span className="text-slate-900">{e.fullName}</span>
            <span className="text-xs text-slate-500 truncate">{e.designation}</span>
            {leadIds.includes(e.id) && <Badge variant="secondary" className="ml-auto">Lead</Badge>}
          </label>
        ))}
        {shown.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Nobody matches.</p>}
      </div>
    </div>
  )
}

function EditRecordForm({ notice, onCancel, onSaved }: { notice: NoticeRecord; onCancel: () => void; onSaved: () => void }) {
  const employees = useEmployees()
  const [f, setF] = useState({
    subject: notice.subject ?? '',
    caseRef: notice.caseRef ?? '',
    issueDate: pkYmd(notice.issueDate),
    deliveredAt: pkLocalInput(notice.deliveredAt),
    deliveredVia: notice.deliveredVia ?? 'EMAIL',
    deadline: pkYmd(notice.deadline),
    directives: notice.directives ?? '',
    severity: notice.severity,
    informedIds: notice.informedIds,
  })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setBusy(true); setError('')
    const letter = file ? { letterBase64: await readFile(file), letterMime: file.type || 'application/pdf', letterName: file.name } : {}
    const res = await fetch(`/api/performance/show-cause/${notice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPDATE_RECORD',
        subject: f.subject, caseRef: f.caseRef, issueDate: f.issueDate,
        deliveredAt: fromPkLocal(f.deliveredAt), deliveredVia: f.deliveredVia,
        deadline: f.deadline, directives: f.directives, severity: f.severity,
        informedIds: f.informedIds, ...letter,
      }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setError(d.error ?? 'Could not save the record')
    onSaved()
  }

  return (
    <div className="rounded-lg border border-slate-300 p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-900">Edit notice record</p>
      <RecordFields f={f} set={(p) => setF({ ...f, ...p })} />
      <div>
        <label className={label}>Kept informed</label>
        <InformedPicker
          employees={employees} value={f.informedIds} onChange={(ids) => setF({ ...f, informedIds: ids })}
          exclude={[notice.employee.id]} leadIds={notice.employee.reportingManagerId ? [notice.employee.reportingManagerId] : []}
        />
        <p className="text-[11px] text-slate-500 mt-1">Anyone you add is notified in the app. Removing someone does not notify them.</p>
      </div>
      <div>
        <label className={label}>{notice.hasLetter ? 'Replace the signed notice' : 'Attach the signed notice'}</label>
        <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save record'}</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

interface FieldsState {
  subject: string; caseRef: string; issueDate: string; deliveredAt: string; deliveredVia: string
  deadline: string; directives: string; severity: string
}

function RecordFields({ f, set, children }: { f: FieldsState; set: (p: Partial<FieldsState>) => void; children?: React.ReactNode }) {
  const responseDays = f.issueDate && f.deadline ? daysBetween(f.issueDate, f.deadline) : null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2">
        <label className={label}>Subject</label>
        <Input value={f.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="e.g. Performance & Professional Conduct" />
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Matter</label>
        <Input value={f.caseRef} onChange={(e) => set({ caseRef: e.target.value })} placeholder="e.g. Vozley project deliverables — groups notices issued over the same thing" />
      </div>
      <div>
        <label className={label}>Date on the notice</label>
        <Input type="date" value={f.issueDate} onChange={(e) => set({ issueDate: e.target.value })} />
      </div>
      <div>
        <label className={label}>Severity</label>
        <select value={f.severity} onChange={(e) => set({ severity: e.target.value })} className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white">
          <option value="MINOR">Minor</option>
          <option value="MODERATE">Moderate</option>
          <option value="SEVERE">Severe</option>
        </select>
      </div>
      <div>
        <label className={label}>Sent to the employee (Pakistan time)</label>
        <Input type="datetime-local" value={f.deliveredAt} onChange={(e) => set({ deliveredAt: e.target.value })} />
      </div>
      <div>
        <label className={label}>Sent</label>
        <select value={f.deliveredVia} onChange={(e) => set({ deliveredVia: e.target.value })} className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white">
          {Object.entries(VIA_LABEL).map(([k, v]) => <option key={k} value={k}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>Response due</label>
        <Input type="date" value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} />
        <p className="text-[11px] text-slate-500 mt-1">
          {responseDays != null && `${responseDays} day${responseDays === 1 ? '' : 's'} after the notice date. `}
          {f.deadline && WEEKEND(f.deadline) && 'Falls on a weekend.'}
        </p>
      </div>
      <div className="flex items-end gap-1 flex-wrap pb-5">
        {[2, 3, 4, 7].map((n) => (
          <Button key={n} type="button" variant="outline" size="sm" disabled={!f.issueDate} onClick={() => set({ deadline: addDays(f.issueDate, n) })}>
            {n} days after
          </Button>
        ))}
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Directed to deliver (one per line)</label>
        <textarea rows={3} className={area} value={f.directives} onChange={(e) => set({ directives: e.target.value })}
          placeholder={'A written explanation\nA minimum of two ready-to-upload content batches'} />
      </div>
      {children}
    </div>
  )
}

// ─── Recording notices already issued ────────────────────────────────────────

export function RecordNoticeDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const employees = useEmployees()
  const today = pkYmd(new Date())
  const [f, setF] = useState<FieldsState>({
    subject: '', caseRef: '', issueDate: today, deliveredAt: '', deliveredVia: 'EMAIL',
    deadline: '', directives: '', severity: 'MODERATE',
  })
  const [issueType, setIssueType] = useState('PERFORMANCE')
  const [description, setDescription] = useState('')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [perPerson, setPerPerson] = useState<Record<string, { sentAt: string; file: File | null }>>({})
  const [informLeads, setInformLeads] = useState(true)
  const [extraInformed, setExtraInformed] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])
  const leadIds = [...new Set(picked.map((id) => byId.get(id)?.reportingManagerId).filter((x): x is string => !!x))]

  function informedFor(id: string): string[] {
    const lead = byId.get(id)?.reportingManagerId
    return [...new Set([...(informLeads && lead ? [lead] : []), ...extraInformed])].filter((x) => x !== id)
  }

  async function submit() {
    setError('')
    if (picked.length === 0) return setError('Pick who the notice was issued to.')
    if (!description.trim()) return setError('Paste the notice text.')
    if (!f.issueDate) return setError('Enter the date on the notice.')
    setBusy(true)
    const failed: string[] = []
    for (const [i, id] of picked.entries()) {
      const e = byId.get(id)
      setProgress(`Recording ${i + 1} of ${picked.length}: ${e?.fullName ?? ''}`)
      const row = perPerson[id]
      const file = row?.file ?? null
      const res = await fetch('/api/performance/show-cause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueImmediately: true,
          employeeId: id, issueType, severity: f.severity, description,
          subject: f.subject, caseRef: f.caseRef, issueDate: f.issueDate,
          deliveredAt: fromPkLocal(row?.sentAt || f.deliveredAt), deliveredVia: f.deliveredVia,
          deadline: f.deadline, directives: f.directives,
          informedIds: informedFor(id),
          ...(file ? { letterBase64: await readFile(file), letterMime: file.type || 'application/pdf', letterName: file.name } : {}),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        failed.push(`${e?.fullName ?? id}: ${d.error ?? res.status}`)
      }
    }
    setBusy(false); setProgress('')
    if (failed.length) return setError(`Not recorded — ${failed.join('; ')}`)
    onCreated()
  }

  const shown = employees.filter((e) => !q || `${e.fullName} ${e.designation} ${e.employeeCode}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record an issued Show Cause Notice</DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            For a notice that has already gone out. Pick everyone it went to — each person gets their own record
            under one matter, with the dates exactly as sent. The employee and everyone kept informed are notified in the app.
          </p>
        </DialogHeader>

        <div className="space-y-5">
          <section>
            <p className="text-sm font-semibold text-slate-900 mb-2">1. Issued to</p>
            <div className="rounded-md border border-slate-200">
              <div className="p-2 border-b border-slate-100">
                <Input placeholder="Search employees" value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />
              </div>
              <div className="max-h-44 overflow-y-auto divide-y divide-slate-50">
                {shown.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={picked.includes(e.id)}
                      onChange={(ev) => setPicked(ev.target.checked ? [...picked, e.id] : picked.filter((x) => x !== e.id))} />
                    <span className="text-slate-900">{e.fullName}</span>
                    <span className="text-xs text-slate-500 truncate">{e.designation}</span>
                  </label>
                ))}
              </div>
            </div>
          </section>

          <section>
            <p className="text-sm font-semibold text-slate-900 mb-2">2. The notice</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className={label}>Type</label>
                <select value={issueType} onChange={(e) => setIssueType(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white">
                  {['PERFORMANCE', 'MISCONDUCT', 'ATTENDANCE', 'POLICY_VIOLATION', 'OTHER'].map((t) => (
                    <option key={t} value={t}>{t.replace('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
            </div>
            <RecordFields f={f} set={(p) => setF({ ...f, ...p })} />
            <div className="mt-3">
              <label className={label}>Notice text</label>
              <textarea rows={6} className={area} value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Paste the body of the notice as it was sent." />
            </div>
          </section>

          {picked.length > 0 && (
            <section>
              <p className="text-sm font-semibold text-slate-900 mb-1">3. Per person — when it was sent, and the signed copy</p>
              <p className="text-xs text-slate-500 mb-2">Leave the time blank to use the one above.</p>
              <div className="space-y-2">
                {picked.map((id) => {
                  const e = byId.get(id)
                  const row = perPerson[id] ?? { sentAt: '', file: null }
                  return (
                    <div key={id} className="grid grid-cols-1 sm:grid-cols-[1fr_12rem_1fr] gap-2 items-center rounded-md border border-slate-100 p-2">
                      <span className="text-sm text-slate-900">{e?.fullName}</span>
                      <Input type="datetime-local" value={row.sentAt} className="h-8"
                        onChange={(ev) => setPerPerson({ ...perPerson, [id]: { ...row, sentAt: ev.target.value } })} />
                      <input type="file" accept="application/pdf,image/*" className="text-xs"
                        onChange={(ev) => setPerPerson({ ...perPerson, [id]: { ...row, file: ev.target.files?.[0] ?? null } })} />
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <section>
            <p className="text-sm font-semibold text-slate-900 mb-2">{picked.length > 0 ? '4' : '3'}. Keep informed</p>
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" checked={informLeads} onChange={(e) => setInformLeads(e.target.checked)} />
              Each person&apos;s reporting lead
              {leadIds.length > 0 && (
                <span className="text-slate-500">({leadIds.map((l) => byId.get(l)?.fullName ?? 'unknown').join(', ')})</span>
              )}
            </label>
            <InformedPicker employees={employees} value={extraInformed} onChange={setExtraInformed} exclude={[]} leadIds={leadIds} />
            <p className="text-[11px] text-slate-500 mt-1">Pick leadership or anyone else who should know. Nobody is told who else was informed except HR, leads and leadership.</p>
          </section>

          {picked.length > 0 && (
            <section className="rounded-md bg-slate-50 border border-slate-100 p-3 text-sm">
              <p className="font-semibold text-slate-900 mb-1">What will be recorded</p>
              <ul className="space-y-1 text-slate-700">
                {picked.map((id) => {
                  const inf = informedFor(id).map((x) => byId.get(x)?.fullName ?? 'unknown')
                  const sent = perPerson[id]?.sentAt || f.deliveredAt
                  return (
                    <li key={id}>
                      <strong>{byId.get(id)?.fullName}</strong>
                      {' — '}dated {f.issueDate ? fmtPkDate(fromPkLocal(`${f.issueDate}T12:00`)) : '—'}
                      {sent ? `, sent ${fmtPkDateTime(fromPkLocal(sent))}` : ''}
                      {f.deadline ? `, reply due ${fmtPkDate(fromPkLocal(`${f.deadline}T12:00`), true)}` : ', no deadline'}
                      {inf.length ? `; informed: ${inf.join(', ')}` : '; nobody else informed'}
                      {perPerson[id]?.file ? '; signed copy attached' : ''}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">{error}</p>}
        </div>

        <DialogFooter>
          {progress && <span className="text-xs text-slate-500 mr-auto">{progress}</span>}
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? 'Recording…' : `Record ${picked.length || ''} notice${picked.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
