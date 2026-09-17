'use client'

/**
 * Bulk intake for a requisition's sheet.
 *
 *   Upload CVs            — many at once. Each is read against the job
 *                           description and written into the columns, including
 *                           the role's own screening columns, which are
 *                           suggested from the job description first.
 *   Import screened sheet — an Excel, CSV or PDF sheet HR already keeps. Its
 *                           columns are matched to the sheet's; anything that
 *                           matches nothing can become a new column.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, FileSpreadsheet, FileText, Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TRACKER_COLUMNS } from '@/lib/candidate-tracker'

const btnSmall = 'text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40'

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return res.json().catch(() => ({}))
}

// ─── Upload CVs ──────────────────────────────────────────────────────────────

export type FileState =
  | { state: 'waiting' }
  | { state: 'reading' }
  | { state: 'created'; name: string; score: number | null; verdict: string | null; knockedOut: boolean; readBy: string }
  | { state: 'updated'; name: string; filled: number }
  | { state: 'error'; error: string }

interface Suggestion { label: string; on: boolean }

export const CV_ACCEPT = '.pdf,.docx,.txt,.md,image/png,image/jpeg,image/webp,image/gif'
export const isCvFile = (f: File) => /\.(pdf|docx|txt|md|png|jpe?g|webp|gif)$/i.test(f.name)

/**
 * The upload queue: each CV its own request, three at a time. Files can be
 * added while earlier ones are still being read.
 */
export function useCvUploads(requisitionId: string, onEach?: () => void) {
  const [items, setItems] = useState<{ file: File; status: FileState }[]>([])
  const queue = useRef<{ index: number; file: File }[]>([])
  const running = useRef(0)
  const count = useRef(0)
  const onEachRef = useRef(onEach)
  useEffect(() => { onEachRef.current = onEach }, [onEach])

  const setStatus = (index: number, status: FileState) =>
    setItems((all) => all.map((it, i) => (i === index ? { ...it, status } : it)))

  async function pump() {
    while (running.current < 3 && queue.current.length) {
      const job = queue.current.shift()!
      running.current++
      setStatus(job.index, { state: 'reading' })
      const body = new FormData()
      body.append('file', job.file)
      void fetch(`/api/recruiting/requisitions/${requisitionId}/intake/cv`, { method: 'POST', body })
        .then(async (res) => {
          const d = await readJson(res)
          setStatus(job.index, !res.ok
            ? { state: 'error', error: String(d.error ?? res.statusText) }
            : d.status === 'updated'
              ? { state: 'updated', name: String(d.fullName ?? ''), filled: Number(d.filled ?? 0) }
              : {
                  state: 'created', name: String(d.fullName ?? ''),
                  score: typeof d.matchScore === 'number' ? d.matchScore : null,
                  verdict: typeof d.verdict === 'string' ? d.verdict : null,
                  knockedOut: d.knockedOut === true, readBy: String(d.readBy ?? ''),
                })
        })
        .catch(() => setStatus(job.index, { state: 'error', error: 'The upload did not go through.' }))
        .finally(() => {
          running.current--
          onEachRef.current?.()
          void pump()
        })
    }
  }

  function add(files: File[]): string | null {
    const ok = files.filter(isCvFile)
    const big = ok.filter((f) => f.size > 4 * 1024 * 1024)
    const take = ok.filter((f) => f.size <= 4 * 1024 * 1024)
    for (const file of take) queue.current.push({ index: count.current++, file })
    setItems((all) => [...all, ...take.map((file) => ({ file, status: { state: 'waiting' } as FileState }))])
    void pump()
    const skipped = files.length - ok.length
    return [
      big.length ? `Larger than 4 MB, not uploaded: ${big.map((f) => f.name).join(', ')}.` : '',
      skipped ? `${skipped} file${skipped === 1 ? ' is' : 's are'} not a CV format (PDF, Word .docx, text or image).` : '',
    ].filter(Boolean).join(' ') || null
  }

  const done = items.filter((i) => i.status.state !== 'waiting' && i.status.state !== 'reading').length
  return { items, add, done, busy: done < items.length, clear: () => { if (running.current === 0 && queue.current.length === 0) { count.current = 0; setItems([]) } } }
}

export function UploadCvsDialog({ requisitionId, screeningColumns, canEditColumns, onClose }: {
  requisitionId: string
  screeningColumns: string[]
  canEditColumns: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const uploads = useCvUploads(requisitionId)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggesting, setSuggesting] = useState(true)
  const [note, setNote] = useState<string | null>(null)
  const [custom, setCustom] = useState('')
  const [started, setStarted] = useState(false)
  const phase: 'pick' | 'running' | 'done' = !started ? 'pick' : uploads.busy || uploads.items.length === 0 ? 'running' : 'done'
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/recruiting/requisitions/${requisitionId}/intake/columns`, { method: 'POST' })
      .then(readJson)
      .then((d) => {
        if (cancelled) return
        const list = Array.isArray(d.suggested) ? d.suggested.map(String) : []
        setSuggestions(list.map((label) => ({ label, on: true })))
        setNote(typeof d.note === 'string' ? d.note : null)
      })
      .catch(() => { if (!cancelled) setNote('Could not suggest columns right now.') })
      .finally(() => { if (!cancelled) setSuggesting(false) })
    return () => { cancelled = true }
  }, [requisitionId])

  function addFiles(list: FileList | null) {
    if (!list) return
    const incoming = Array.from(list).filter(isCvFile)
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`))
      return [...prev, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))]
    })
  }

  function addCustom() {
    const label = custom.replace(/\s+/g, ' ').trim()
    if (!label) return
    const all = [...screeningColumns, ...suggestions.map((s) => s.label)].map((x) => x.toLowerCase())
    if (all.includes(label.toLowerCase())) { setError(`There is already a column called "${label}".`); return }
    setError('')
    setSuggestions((s) => [...s, { label, on: true }])
    setCustom('')
  }

  const newColumns = canEditColumns ? suggestions.filter((s) => s.on && s.label.trim()).map((s) => s.label.trim()) : []
  const columnsAfter = [...screeningColumns, ...newColumns]

  async function run() {
    setError('')
    if (files.length === 0) { setError('Choose the CVs to upload.'); return }
    const tooBig = files.filter((f) => f.size > 4 * 1024 * 1024)
    if (tooBig.length) { setError(`Larger than 4 MB: ${tooBig.map((f) => f.name).join(', ')}. Remove them or compress them first.`); return }

    setStarted(true)
    if (newColumns.length) {
      const res = await fetch(`/api/recruiting/requisitions/${requisitionId}/post`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screeningColumns: columnsAfter }),
      })
      if (!res.ok) {
        const d = await readJson(res)
        setError(`Could not add the columns: ${String(d.error ?? res.statusText)}`)
        setStarted(false)
        return
      }
    }
    uploads.add(files)
  }

  useEffect(() => {
    if (phase === 'done') router.refresh()
  }, [phase, router])

  const states = uploads.items.map((i) => i.status)
  const counts = {
    created: states.filter((s) => s.state === 'created').length,
    updated: states.filter((s) => s.state === 'updated').length,
    failed: states.filter((s) => s.state === 'error').length,
    knocked: states.filter((s) => s.state === 'created' && s.knockedOut).length,
    textOnly: states.filter((s) => s.state === 'created' && s.readBy === 'text').length,
  }
  const done = uploads.done

  return (
    <Dialog open onOpenChange={(o) => { if (!o && phase !== 'running') onClose() }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload CVs</DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            Choose as many CVs as you like. Each one is read against this role’s job description and filled into the sheet —
            contact, experience, companies, education, a fit score and verdict, and an answer for every screening column.
            The CV itself is kept and opens from the CV column.
          </p>
        </DialogHeader>

        {phase === 'pick' && (
          <div className="space-y-5">
            <section>
              <p className="text-sm font-semibold text-slate-900">1. Columns for this role</p>
              <p className="text-xs text-slate-500 mb-2">
                Each CV is answered against these. {screeningColumns.length > 0 ? 'The role already has:' : 'The role has no screening columns yet.'}
              </p>
              {screeningColumns.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {screeningColumns.map((c) => (
                    <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{c}</span>
                  ))}
                </div>
              )}
              {suggesting ? (
                <p className="text-xs text-slate-500 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading the job description for columns to add…
                </p>
              ) : (
                <>
                  {suggestions.length > 0 && (
                    <>
                      <p className="text-xs text-slate-600 mb-1">
                        {canEditColumns ? 'Suggested from the job description — untick any you don’t want, or rename them:' : 'Suggested from the job description (HR adds columns):'}
                      </p>
                      <ul className="space-y-1.5">
                        {suggestions.map((s, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <input
                              type="checkbox" checked={s.on && canEditColumns} disabled={!canEditColumns}
                              aria-label={`Add ${s.label}`}
                              onChange={(e) => setSuggestions((all) => all.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))}
                            />
                            <input
                              value={s.label} disabled={!canEditColumns}
                              aria-label="Column name"
                              onChange={(e) => setSuggestions((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                              className="flex-1 h-8 rounded-md border border-slate-200 px-2 text-sm disabled:bg-slate-50"
                            />
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {note && <p className="text-xs text-slate-500 mt-2">{note}</p>}
                  {canEditColumns && (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        value={custom} onChange={(e) => setCustom(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
                        placeholder="Add your own column, e.g. Portfolio link"
                        className="flex-1 h-8 rounded-md border border-slate-200 px-2 text-sm"
                      />
                      <Button type="button" size="sm" variant="outline" onClick={addCustom} disabled={!custom.trim()}>Add column</Button>
                    </div>
                  )}
                </>
              )}
            </section>

            <section>
              <p className="text-sm font-semibold text-slate-900 mb-2">2. The CVs</p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
                className={`rounded-lg border-2 border-dashed p-5 text-center ${dragging ? 'border-slate-500 bg-slate-50' : 'border-slate-200'}`}
              >
                <Upload className="w-6 h-6 mx-auto text-slate-400" />
                <p className="text-sm text-slate-600 mt-1">Drop CVs here, or</p>
                <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => inputRef.current?.click()}>
                  Choose CVs
                </Button>
                <input
                  ref={inputRef} type="file" multiple hidden
                  accept=".pdf,.docx,.txt,.md,image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
                />
                <p className="text-[11px] text-slate-400 mt-2">PDF, Word (.docx), text or images · up to 4 MB each</p>
              </div>
              {files.length > 0 && (
                <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-100 max-h-48 overflow-y-auto">
                  {files.map((f, i) => (
                    <li key={`${f.name}:${f.size}`} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span className="flex-1 truncate text-slate-800">{f.name}</span>
                      <span className="text-[11px] text-slate-400">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                      <button type="button" className={btnSmall} onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>Remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {error && <p className="text-sm text-red-700">{error}</p>}
          </div>
        )}

        {phase !== 'pick' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              {phase === 'running' ? `Reading ${done} of ${files.length}…` : `Finished: ${counts.created} added, ${counts.updated} already on this role and updated, ${counts.failed} could not be read.`}
            </p>
            {phase === 'done' && (counts.knocked > 0 || counts.textOnly > 0) && (
              <p className="text-xs text-slate-500">
                {counts.knocked > 0 && `${counts.knocked} did not meet a hard requirement and are under the Inactive tab. `}
                {counts.textOnly > 0 && `${counts.textOnly} were read without AI, so only name, email and phone were filled.`}
              </p>
            )}
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-100 max-h-[50vh] overflow-y-auto">
              {uploads.items.map(({ file: f, status: s }) => {
                return (
                  <li key={`${f.name}:${f.size}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                    {s.state === 'reading' || s.state === 'waiting'
                      ? <Loader2 className={`w-3.5 h-3.5 ${s.state === 'reading' ? 'animate-spin text-slate-600' : 'text-slate-300'}`} />
                      : s.state === 'error' ? <X className="w-3.5 h-3.5 text-red-600" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                    <span className="truncate text-slate-800 w-56">{f.name}</span>
                    <span className="flex-1 text-xs text-slate-600 truncate">
                      {s.state === 'waiting' && 'Waiting'}
                      {s.state === 'reading' && 'Reading…'}
                      {s.state === 'created' && `${s.name} added${s.score != null ? ` · fit ${s.score}/100` : ''}${s.verdict ? ` · ${s.verdict.toLowerCase()}` : ''}${s.knockedOut ? ' · knocked out' : ''}`}
                      {s.state === 'updated' && `${s.name} is already on this role · ${s.filled} blank cell${s.filled === 1 ? '' : 's'} filled`}
                      {s.state === 'error' && <span className="text-red-700">{s.error}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
            {error && <p className="text-sm text-red-700">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {phase === 'pick' && (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={run} disabled={files.length === 0 || suggesting}>
                {newColumns.length ? `Add ${newColumns.length} column${newColumns.length === 1 ? '' : 's'} and read ${files.length || ''} CV${files.length === 1 ? '' : 's'}` : `Read ${files.length || ''} CV${files.length === 1 ? '' : 's'}`}
              </Button>
            </>
          )}
          {phase === 'running' && <Button disabled><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Reading CVs…</Button>}
          {phase === 'done' && <Button onClick={onClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Import screened sheet ───────────────────────────────────────────────────

interface Preview {
  fileName: string
  headers: string[]
  rows: string[][]
  sheetName: string | null
  note: string | null
  screeningColumns: string[]
  mapping: string[]
}

export function ImportSheetDialog({ requisitionId, canEditColumns, onClose }: {
  requisitionId: string
  canEditColumns: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<string[]>([])
  const [onDuplicate, setOnDuplicate] = useState<'update' | 'skip'>('update')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; skippedReasons: string[]; newColumns: string[] } | null>(null)

  async function choose(file: File | undefined) {
    if (!file) return
    setError(''); setReading(true); setPreview(null)
    const body = new FormData()
    body.append('file', file)
    const res = await fetch(`/api/recruiting/requisitions/${requisitionId}/intake/sheet`, { method: 'POST', body })
    const d = await readJson(res)
    setReading(false)
    if (!res.ok) { setError(String(d.error ?? 'Could not read this file.')); return }
    const p = d as unknown as Preview
    // A manager cannot add columns, so their unmatched columns start as skipped.
    setMapping(p.mapping.map((m) => (!canEditColumns && m.startsWith('new:') ? '' : m)))
    setPreview(p)
  }

  const options = useMemo(() => {
    if (!preview) return []
    return [
      { value: '', label: 'Skip this column' },
      { value: 'name', label: 'Candidate name' },
      { value: 'stage', label: 'Step (Applied, Screening, Interview…)' },
      ...TRACKER_COLUMNS.map((c) => ({ value: c.key as string, label: `${c.group} — ${c.label}` })),
      ...preview.screeningColumns.map((c) => ({ value: `screening:${c}`, label: `Screening — ${c}` })),
    ]
  }, [preview])

  const taken = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of mapping) if (t && !t.startsWith('new:')) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  }, [mapping])

  const clash = [...taken.values()].some((n) => n > 1)
  const hasName = mapping.includes('name')
  const newCount = mapping.filter((m) => m.startsWith('new:')).length

  async function commit() {
    if (!preview) return
    setError(''); setSaving(true)
    const res = await fetch(`/api/recruiting/requisitions/${requisitionId}/intake/sheet/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: preview.fileName, headers: preview.headers, rows: preview.rows, mapping, onDuplicate }),
    })
    const d = await readJson(res)
    setSaving(false)
    if (!res.ok) { setError(String(d.error ?? 'The import did not go through.')); return }
    setResult(d as unknown as NonNullable<typeof result>)
    router.refresh()
  }

  const sample = (col: number) => preview?.rows.map((r) => r[col]).filter(Boolean).slice(0, 2).join(' · ') ?? ''

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose() }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import screened sheet</DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            An Excel, CSV or PDF sheet of candidates you have already screened. Its columns are matched to this sheet’s;
            check the matches, then import.
          </p>
        </DialogHeader>

        {result ? (
          <div className="space-y-2 text-sm">
            <p className="text-slate-900 font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {result.created} added, {result.updated} updated, {result.skipped} skipped.
            </p>
            {result.newColumns.length > 0 && <p className="text-slate-600">New columns: {result.newColumns.join(', ')}.</p>}
            {result.skippedReasons.length > 0 && (
              <ul className="text-xs text-slate-500 list-disc pl-5 max-h-48 overflow-y-auto">
                {result.skippedReasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </div>
        ) : !preview ? (
          <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
            <FileSpreadsheet className="w-7 h-7 mx-auto text-slate-400" />
            <Button type="button" size="sm" variant="outline" className="mt-3" disabled={reading} onClick={() => inputRef.current?.click()}>
              {reading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Reading the sheet…</> : 'Choose a sheet'}
            </Button>
            <input
              ref={inputRef} type="file" hidden accept=".xlsx,.xls,.csv,.ods,.tsv,.pdf"
              onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = '' }}
            />
            <p className="text-[11px] text-slate-400 mt-2">Excel (.xlsx, .xls), CSV or PDF · up to 4 MB. A PDF is read with AI and takes a little longer.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              <strong>{preview.fileName}</strong>{preview.sheetName ? ` (sheet "${preview.sheetName}")` : ''} — {preview.rows.length} rows, {preview.headers.length} columns.
              {preview.note && <span className="block text-xs text-slate-500">{preview.note}</span>}
            </p>

            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Column in your sheet</th>
                    <th className="text-left px-3 py-2 font-semibold">Example values</th>
                    <th className="text-left px-3 py-2 font-semibold">Goes into</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.headers.map((h, i) => {
                    const m = mapping[i] ?? ''
                    const dup = m && !m.startsWith('new:') && (taken.get(m) ?? 0) > 1
                    return (
                      <tr key={i}>
                        <td className="px-3 py-2 text-slate-900 font-medium">{h}</td>
                        <td className="px-3 py-2 text-xs text-slate-500 max-w-[16rem] truncate">{sample(i) || '—'}</td>
                        <td className="px-3 py-2">
                          <select
                            value={m}
                            aria-label={`Where ${h} goes`}
                            onChange={(e) => setMapping((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
                            className={`w-full h-8 rounded-md border px-2 text-sm bg-white ${dup ? 'border-red-400' : 'border-slate-200'}`}
                          >
                            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            {canEditColumns && <option value={`new:${h}`}>New screening column: {h}</option>}
                          </select>
                          {dup && <p className="text-[11px] text-red-700 mt-0.5">Another column already goes here.</p>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <fieldset className="text-sm space-y-1">
              <legend className="text-xs font-semibold text-slate-600 mb-1">Candidates already on this role (same email, or same name)</legend>
              <label className="flex items-center gap-2">
                <input type="radio" checked={onDuplicate === 'update'} onChange={() => setOnDuplicate('update')} />
                Update them with the sheet’s filled cells
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={onDuplicate === 'skip'} onChange={() => setOnDuplicate('skip')} />
                Leave them as they are
              </label>
            </fieldset>

            {!hasName && <p className="text-sm text-red-700">Choose which column holds the candidate’s name.</p>}
            {newCount > 0 && <p className="text-xs text-slate-500">{newCount} column{newCount === 1 ? '' : 's'} will be added to this role’s screening columns.</p>}
          </div>
        )}

        {error && <p className="text-sm text-red-700">{error}</p>}

        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              {preview && <Button variant="outline" onClick={() => { setPreview(null); setMapping([]) }} disabled={saving}>Choose another file</Button>}
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              {preview && (
                <Button onClick={commit} disabled={saving || !hasName || clash}>
                  {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Importing…</> : `Import ${preview.rows.length} row${preview.rows.length === 1 ? '' : 's'}`}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
