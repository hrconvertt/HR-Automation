'use client'

/**
 * The Documents tab on an employee profile — every document they have, by
 * the stage it belongs to, and what each stage is still missing.
 *
 * Down the left, the sections with how many are on file and how many are
 * missing, as jump links. On the right, a search and three views (everything,
 * missing, hidden from the employee), then one card per section. A document
 * a stage expects gets its own row even when nothing is on file, with Upload
 * — and Draft or Write when the system can produce it — beside it.
 *
 * Every action says what it does. A file shows View; HR's other actions sit
 * under More: rename or change type, read details into the profile, show to
 * or hide from the employee, delete. See src/lib/employee-document-sections.ts
 * for what goes where.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  AlertTriangle, ChevronDown, ExternalLink, FileText, Loader2, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import UploadDocumentButton from '@/components/upload-document-button'
import { DOC_TYPES } from '@/lib/document-types'
import type { DocView, ExpectedRow, SectionView } from '@/lib/employee-document-sections'

type Filter = 'all' | 'missing' | 'hidden'

const inputCls = 'w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10'
const PAYSLIPS_SHOWN = 6

export default function EmployeeDocumentCenter({ employeeId, sections, canManage }: {
  employeeId: string
  sections: SectionView[]
  /** HR, not previewing: sees what is missing and can change files. */
  canManage: boolean
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const totals = useMemo(() => ({
    onFile: sections.reduce((n, s) => n + s.onFile, 0),
    missing: sections.reduce((n, s) => n + s.missing, 0),
    hidden: sections.reduce((n, s) => n + [...s.expected.flatMap((e) => e.files), ...s.extra].filter((f) => !f.visibleToEmployee).length, 0),
  }), [sections])

  const q = query.trim().toLowerCase()
  const matches = (f: DocView) => !q || f.name.toLowerCase().includes(q) || f.typeLabel.toLowerCase().includes(q)

  const shown = sections
    .map((s) => {
      const expected = s.expected
        .map((e) => ({ ...e, files: e.files.filter(matches).filter((f) => filter !== 'hidden' || !f.visibleToEmployee) }))
        .filter((e) => {
          if (filter === 'missing') return e.required && e.files.length === 0 && (!q || e.label.toLowerCase().includes(q))
          if (filter === 'hidden') return e.files.length > 0
          return !q || e.files.length > 0 || e.label.toLowerCase().includes(q)
        })
      const extra = filter === 'missing' ? [] : s.extra.filter(matches).filter((f) => filter !== 'hidden' || !f.visibleToEmployee)
      const payslips = filter === 'all' ? s.payslips.filter((p) => !q || p.period.toLowerCase().includes(q) || 'payslip salary slip'.includes(q)) : []
      const letters = filter === 'all' ? s.letters.filter((l) => !q || l.title.toLowerCase().includes(q) || (l.number ?? '').toLowerCase().includes(q)) : []
      return { ...s, expected, extra, payslips, letters }
    })
    .filter((s) => s.expected.length || s.extra.length || s.payslips.length || s.letters.length)

  return (
    <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)] items-start">
      {/* Sections */}
      <nav className="hidden lg:block bg-white border border-slate-200 rounded-xl p-2 sticky top-4" aria-label="Document sections">
        {sections.map((s) => (
          <a key={s.key} href={`#docs-${s.key}`} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <span className="truncate">{s.title}</span>
            <span className="text-xs tabular-nums text-slate-400 whitespace-nowrap">
              {s.onFile}
              {canManage && s.missing > 0 && <span className="text-amber-700"> · {s.missing} missing</span>}
            </span>
          </a>
        ))}
      </nav>

      <div className="space-y-4 min-w-0">
        {/* Summary and tools */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Documents</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {totals.onFile} on file
                {canManage && (
                  <>
                    {' · '}
                    <span className={totals.missing ? 'text-amber-700 font-medium' : ''}>{totals.missing} missing</span>
                    {' · '}{totals.hidden} hidden from the employee
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {canManage && (
                <Link href={`/dashboard/documents?employee=${employeeId}`}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  Open in Document Center <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              )}
              {canManage && <UploadDocumentButton employeeId={employeeId} compact />}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents"
                className={`${inputCls} pl-9`} />
            </div>
            {canManage && (
              <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-xs" role="group" aria-label="Show">
                {([['all', 'Everything'], ['missing', `Missing (${totals.missing})`], ['hidden', `Hidden (${totals.hidden})`]] as [Filter, string][]).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
                    className={`px-3 py-2 ${filter === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {shown.length === 0 && (
          <p className="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center text-sm text-slate-500">
            {q || filter !== 'all' ? 'Nothing matches.' : 'No documents on file yet.'}
          </p>
        )}

        {shown.map((s) => (
          <section key={s.key} id={`docs-${s.key}`} className="bg-white border border-slate-200 rounded-xl scroll-mt-4">
            <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{s.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{s.description}</p>
              </div>
              <p className="text-xs text-slate-500 whitespace-nowrap pt-1">
                {s.onFile} on file
                {canManage && s.missing > 0 && <span className="text-amber-700 font-medium"> · {s.missing} missing</span>}
              </p>
            </header>

            <ul className="divide-y divide-slate-100">
              {s.expected.map((e) => (
                <ExpectedItem key={e.type} row={e} employeeId={employeeId} canManage={canManage} />
              ))}
              {s.extra.map((f) => (
                <li key={f.id} className="px-5 py-3">
                  <FileRow doc={f} canManage={canManage} showType />
                </li>
              ))}
            </ul>

            {s.payslips.length > 0 && <Payslips rows={s.payslips} />}
            {s.letters.length > 0 && <Letters rows={s.letters} />}
          </section>
        ))}
      </div>
    </div>
  )
}

function ExpectedItem({ row, employeeId, canManage }: { row: ExpectedRow; employeeId: string; canManage: boolean }) {
  const missing = row.files.length === 0
  return (
    <li className="px-5 py-3.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">
            {row.label}
            {missing && (
              <span className={`ml-2 text-xs font-medium ${row.required ? 'text-amber-700' : 'text-slate-400'}`}>
                {row.required ? 'Missing' : 'Not on file'}
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{row.hint}</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {missing && row.generateHref && (
              <a href={row.generateHref} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center h-8 px-3 rounded-md border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50">
                {row.generateLabel}
              </a>
            )}
            <UploadDocumentButton employeeId={employeeId} compact presetType={row.type} variant="outline"
              label={missing ? 'Upload' : 'Upload another'} />
          </div>
        )}
      </div>
      {row.files.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {row.files.map((f) => (
            <li key={f.id}><FileRow doc={f} canManage={canManage} /></li>
          ))}
        </ul>
      )}
    </li>
  )
}

function FileRow({ doc, canManage, showType }: { doc: DocView; canManage: boolean; showType?: boolean }) {
  const router = useRouter()
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(doc.name)
  const [type, setType] = useState(doc.type)
  const [expiry, setExpiry] = useState('')
  const [note, setNote] = useState<{ tone: 'ok' | 'warn' | 'err'; lines: string[] } | null>(null)

  async function patch(body: Record<string, unknown>, done: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toastError('Not changed', (j as { error?: string }).error); return false }
      toastSuccess(done)
      router.refresh()
      return true
    } finally { setBusy(false) }
  }

  async function saveRename() {
    if (!name.trim()) return
    const ok = await patch({ name: name.trim(), type, ...(expiry ? { expiryDate: expiry } : {}) }, 'Document updated')
    if (ok) setRenaming(false)
  }

  async function remove() {
    setBusy(true)
    try {
      const res = await fetch(`/api/documents/${doc.id}/download`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toastError('Not deleted', (j as { error?: string }).error); return }
      toastSuccess(`${doc.name} deleted`)
      setDeleting(false)
      router.refresh()
    } finally { setBusy(false) }
  }

  async function readDetails() {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch(`/api/documents/${doc.id}/extract`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      const j = await res.json().catch(() => ({})) as {
        error?: string; wrote?: boolean
        applied?: { label: string; value: string }[]
        conflicts?: { label: string; existing: string; found: string }[]
        unchanged?: unknown[]
      }
      if (!res.ok) { setNote({ tone: 'err', lines: [j.error ?? 'Could not read this document.'] }); return }
      const lines: string[] = []
      for (const a of j.applied ?? []) lines.push(`Filled ${a.label}: ${a.value}`)
      for (const c of j.conflicts ?? []) lines.push(`${c.label} differs — profile “${c.existing}”, document “${c.found}”. The profile was kept.`)
      if (!lines.length) lines.push((j.unchanged?.length ?? 0) > 0 ? 'Nothing new — what it says already matches the profile.' : 'Nothing readable could be pulled from it.')
      setNote({ tone: j.conflicts?.length ? 'warn' : 'ok', lines })
      if (j.wrote) router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <a href={doc.href} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-slate-900 hover:underline truncate block">
            {doc.name}
          </a>
          <p className="text-xs text-slate-500 mt-0.5">
            {showType && `${doc.typeLabel} · `}
            Added {doc.dateLabel}
            {doc.sizeLabel && ` · ${doc.sizeLabel}`}
            {doc.expiryLabel && (
              <span className={doc.expired ? 'text-red-700 font-medium' : ''}> · {doc.expired ? 'Expired' : 'Expires'} {doc.expiryLabel}</span>
            )}
            {canManage && !doc.visibleToEmployee && <span className="text-slate-700"> · Hidden from the employee</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          <a href={doc.href} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center h-8 px-3 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50">
            View
          </a>
          {canManage && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button type="button" disabled={busy}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  More <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={4}
                  className="z-50 min-w-[230px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg text-sm">
                  <MenuItem onSelect={() => { setName(doc.name); setType(doc.type); setRenaming(true) }}>Rename or change type</MenuItem>
                  <MenuItem disabled={!doc.hasFile} onSelect={() => void readDetails()}>Read details into the profile</MenuItem>
                  <MenuItem onSelect={() => void patch({ visibleToEmployee: !doc.visibleToEmployee }, doc.visibleToEmployee ? 'Hidden from the employee' : 'Shown to the employee')}>
                    {doc.visibleToEmployee ? 'Hide from the employee' : 'Show to the employee'}
                  </MenuItem>
                  <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
                  <MenuItem danger onSelect={() => setDeleting(true)}>Delete</MenuItem>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </div>
      </div>

      {note && (
        <div className={`mt-2 rounded-md px-3 py-2 text-xs ${note.tone === 'err' ? 'bg-red-50 text-red-800' : note.tone === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>
          {note.lines.map((l) => <p key={l}>{l}</p>)}
          <button type="button" onClick={() => setNote(null)} className="mt-1 underline">Dismiss</button>
        </div>
      )}

      <Dialog open={renaming} onOpenChange={(o) => { if (!o) setRenaming(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Rename or change type</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Name</span>
              <input className={`${inputCls} mt-1`} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Type — decides which section it is listed under</span>
              <select className={`${inputCls} mt-1`} value={type} onChange={(e) => setType(e.target.value)}>
                {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Expiry date <span className="text-slate-400">(optional{doc.expiryLabel ? `, currently ${doc.expiryLabel}` : ''})</span></span>
              <input type="date" className={`${inputCls} mt-1`} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void saveRename()} disabled={busy || !name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={(o) => { if (!o) setDeleting(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-600" /> Delete this document?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            “{doc.name}” will be removed from this employee’s record for good. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(false)} disabled={busy}>Keep it</Button>
            <Button onClick={() => void remove()} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white">Delete document</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MenuItem({ children, onSelect, disabled, danger }: {
  children: React.ReactNode; onSelect: () => void; disabled?: boolean; danger?: boolean
}) {
  return (
    <DropdownMenu.Item disabled={disabled} onSelect={onSelect}
      className={`cursor-pointer select-none rounded-md px-3 py-2 outline-none data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed ${danger ? 'text-red-700 data-[highlighted]:bg-red-50' : 'text-slate-700 data-[highlighted]:bg-slate-100'}`}>
      {children}
    </DropdownMenu.Item>
  )
}

function Payslips({ rows }: { rows: SectionView['payslips'] }) {
  const [all, setAll] = useState(false)
  const list = all ? rows : rows.slice(0, PAYSLIPS_SHOWN)
  return (
    <div className="px-5 py-4 border-t border-slate-100">
      <p className="text-sm font-medium text-slate-900">Payslips <span className="text-slate-400 font-normal">· {rows.length}</span></p>
      <p className="text-xs text-slate-500 mt-0.5">From payroll. Each opens the slip ready to print or save.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1.5 pr-4 font-semibold">Month</th>
              <th className="py-1.5 pr-4 font-semibold text-right">Net pay</th>
              <th className="py-1.5 pr-4 font-semibold">Status</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((p) => (
              <tr key={p.id}>
                <td className="py-2 pr-4 text-slate-900">{p.period}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{p.net}</td>
                <td className="py-2 pr-4 text-slate-600">{p.status}</td>
                <td className="py-2 text-right">
                  <a href={p.href} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center h-8 px-3 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50">
                    View payslip
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PAYSLIPS_SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-xs font-medium text-slate-700 underline">
          {all ? 'Show the latest only' : `Show all ${rows.length} payslips`}
        </button>
      )}
    </div>
  )
}

function Letters({ rows }: { rows: SectionView['letters'] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((l) => (
        <li key={l.id} className="px-5 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">{l.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {l.number ? <span className="font-mono">{l.number}</span> : 'No number yet'} · {l.status} · {l.dateLabel}
            </p>
          </div>
          {l.href ? (
            <a href={l.href} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center h-8 px-3 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 flex-shrink-0">
              Open letter
            </a>
          ) : (
            <Link href="/dashboard/letters" className="text-xs font-medium text-slate-600 underline flex-shrink-0">Open in Letters</Link>
          )}
        </li>
      ))}
    </ul>
  )
}
