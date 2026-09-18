'use client'

/**
 * One editor for every letter: pick the letter and the employee, and the
 * letter is written from their record. Every line (date, subject, each
 * paragraph, who signs) can be changed, with the letterhead PDF redrawn
 * beside it as you type. Save keeps it under Letter requests; Download PDF
 * saves exactly what the preview shows.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { toastSuccess } from '@/components/ui/toaster'
import { AlertTriangle, ArrowLeft, Download, FileText, Loader2, Plus, RotateCcw, Save } from 'lucide-react'
import { letterLabel, WRITABLE_LETTERS, type LetterText } from '@/lib/letter-text'

interface Staff { id: string; fullName: string; employeeCode: string; designation: string | null; left: boolean }

interface Details { purpose: string; bankName: string; destinationCountry: string; travelFrom: string; travelTo: string }
const NO_DETAILS: Details = { purpose: '', bankName: '', destinationCountry: '', travelFrom: '', travelTo: '' }

export type WriterStart =
  | { mode: 'new'; type: string; employeeId: string }
  | { mode: 'request'; id: string; type: string; employeeId: string; details: Details }
  | { mode: 'letter'; id: string; type: string; employeeId: string; letterNumber: string | null; text: LetterText | null }

const MAX_PARAGRAPHS = 20
const OFFER = 'OFFER'

/** What each letter asks for beyond the record. */
const PURPOSE: Record<string, { label: string; placeholder: string }> = {
  EXPERIENCE: { label: 'Purpose (optional)', placeholder: 'e.g. for a visa application' },
  SALARY_CERTIFICATE: { label: 'Purpose (optional)', placeholder: 'e.g. for a car loan' },
  NOC_VISA: { label: 'Purpose of travel (optional)', placeholder: 'e.g. for a family visit' },
  BONAFIDE: { label: 'Purpose (optional)', placeholder: 'e.g. for a house rental' },
  SERVICE_CERTIFICATE: { label: 'Purpose (optional)', placeholder: 'e.g. for a new job application' },
  WARNING: { label: 'What the warning is about', placeholder: 'e.g. repeated late arrivals in August' },
}

const inputCls =
  'w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none '
  + 'focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500'

async function drawLetter(employeeId: string, text: LetterText): Promise<{ blob: Blob; fits: boolean }> {
  const res = await fetch('/api/documents/employment-letter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId, text }),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error((d as { error?: string }).error ?? 'Could not draw the letter.')
  }
  return { blob: await res.blob(), fits: res.headers.get('X-Letter-Fits') !== '0' }
}

async function writeFromRecord(type: string, employeeId: string, details: Details): Promise<LetterText> {
  const url = type === 'EMPLOYMENT'
    ? `/api/documents/employment-letter?employeeId=${employeeId}&defaults=1`
    : `/api/letters/draft?${new URLSearchParams({ type, employeeId, ...details })}`
  const res = await fetch(url, { cache: 'no-store' })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((d as { error?: string }).error ?? 'Could not write the letter.')
  return (d as { text: LetterText }).text
}

export function LetterWriter({ staff, start }: { staff: Staff[]; start: WriterStart }) {
  const router = useRouter()
  const locked = start.mode !== 'new'
  const [type, setType] = useState(start.type)
  const [employeeId, setEmployeeId] = useState(start.employeeId)
  const [details, setDetails] = useState<Details>(start.mode === 'request' ? start.details : NO_DETAILS)
  const [text, setText] = useState<LetterText | null>(start.mode === 'letter' ? start.text : null)
  const [original, setOriginal] = useState<LetterText | null>(start.mode === 'letter' ? start.text : null)
  const [loading, setLoading] = useState(start.mode !== 'letter' && !!start.employeeId)
  const [err, setErr] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [fits, setFits] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [saving, setSaving] = useState(false)
  const urlRef = useRef<string | null>(null)

  const employee = staff.find((s) => s.id === employeeId)
  const edited = !!text && !!original && JSON.stringify(text) !== JSON.stringify(original)

  const load = useCallback(async (t: string, emp: string, d: Details) => {
    setErr(null)
    setLoading(true)
    try {
      const written = await writeFromRecord(t, emp, d)
      setText(written)
      setOriginal(written)
    } catch (e) {
      setText(null)
      setOriginal(null)
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  // A new letter, or a received request, starts from the record.
  useEffect(() => {
    if (start.mode === 'letter' || !start.employeeId) return
    let cancelled = false
    writeFromRecord(start.type, start.employeeId, start.mode === 'request' ? start.details : NO_DETAILS)
      .then((written) => { if (!cancelled) { setText(written); setOriginal(written) } })
      .catch((e: Error) => { if (!cancelled) setErr(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [start])

  function confirmDiscard(): boolean {
    return !edited || window.confirm('This rewrites the letter from the record, and your changes to it are lost. Continue?')
  }

  function pickType(t: string) {
    if (t === OFFER) { router.push('/dashboard/letters/offer'); return }
    if (!confirmDiscard()) return
    setType(t)
    setDetails(NO_DETAILS)
    if (employeeId) void load(t, employeeId, NO_DETAILS)
  }

  function pickEmployee(id: string) {
    if (!confirmDiscard()) return
    setEmployeeId(id)
    setText(null)
    setOriginal(null)
    setPreviewUrl(null)
    if (id) void load(type, id, details)
  }

  // Redraw the preview a moment after typing stops.
  useEffect(() => {
    if (!employeeId || !text) return
    let cancelled = false
    const timer = setTimeout(() => {
      setDrawing(true)
      drawLetter(employeeId, text)
        .then(({ blob, fits: ok }) => {
          if (cancelled) return
          const url = URL.createObjectURL(blob)
          if (urlRef.current) URL.revokeObjectURL(urlRef.current)
          urlRef.current = url
          setPreviewUrl(url)
          setFits(ok)
        })
        .catch((e: Error) => { if (!cancelled) setErr(e.message) })
        .finally(() => { if (!cancelled) setDrawing(false) })
    }, 600)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [employeeId, text])

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  async function download() {
    if (!employeeId || !text) return
    setDownloading(true)
    try {
      const { blob } = await drawLetter(employeeId, text)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${employee?.fullName ?? 'Letter'} - ${letterLabel(type)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  async function save() {
    if (!employeeId || !text) return
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch('/api/letters/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text, letterType: type, employeeId, ...details,
          requestId: start.mode === 'request' ? start.id : undefined,
          letterId: start.mode === 'letter' ? start.id : undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Could not save the letter.')
      toastSuccess(
        start.mode === 'request' ? 'Request approved' : start.mode === 'letter' ? 'Changes saved' : 'Letter saved',
        d.letter?.letterNumber ? `Letter number ${d.letter.letterNumber}.` : undefined,
      )
      router.push(`/dashboard/letters?open=${d.letter.id}`)
    } catch (e) {
      setErr((e as Error).message)
      setSaving(false)
    }
  }

  const set = <K extends keyof LetterText>(k: K, v: LetterText[K]) => setText((p) => (p ? { ...p, [k]: v } : p))
  const setParagraph = (i: number, v: string) =>
    setText((p) => (p ? { ...p, paragraphs: p.paragraphs.map((x, j) => (j === i ? v : x)) } : p))
  const move = (i: number, by: number) =>
    setText((p) => {
      if (!p) return p
      const j = i + by
      if (j < 0 || j >= p.paragraphs.length) return p
      const next = [...p.paragraphs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return { ...p, paragraphs: next }
    })
  const remove = (i: number) => setText((p) => (p ? { ...p, paragraphs: p.paragraphs.filter((_, j) => j !== i) } : p))
  const add = () => setText((p) => (p && p.paragraphs.length < MAX_PARAGRAPHS ? { ...p, paragraphs: [...p.paragraphs, ''] } : p))
  const setDetail = (k: keyof Details, v: string) => setDetails((d) => ({ ...d, [k]: v }))

  const title = start.mode === 'request' ? `Review request: ${letterLabel(type)}`
    : start.mode === 'letter' ? `Edit ${letterLabel(type)}${start.letterNumber ? ` · ${start.letterNumber}` : ''}`
    : 'Write a letter'
  const saveLabel = start.mode === 'request' ? 'Approve & save letter' : start.mode === 'letter' ? 'Save changes' : 'Save letter'
  const showDetails = !locked || start.mode === 'request'
  const askPurpose = type in PURPOSE

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Link href="/dashboard/letters" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 mb-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Letter requests
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Written from the employee’s record. Change any line and the preview follows. Nothing here changes their record.
          </p>
        </div>
        {text && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" disabled={!edited} onClick={() => original && setText(original)}>
              <RotateCcw className="w-3.5 h-3.5" /> {start.mode === 'letter' ? 'Undo my changes' : 'Reset to the record'}
            </Button>
            <Button variant="outline" size="sm" onClick={download} disabled={downloading}>
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download PDF
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saveLabel}
            </Button>
          </div>
        )}
      </div>

      {err && <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

      <section className="bg-white border border-slate-200 rounded-xl p-4 grid gap-4 md:grid-cols-2">
        <Field label="Letter">
          <select className={inputCls} value={type} onChange={(e) => pickType(e.target.value)} disabled={locked}>
            {WRITABLE_LETTERS.map((l) => <option key={l.type} value={l.type}>{l.label}</option>)}
            {!locked && <option value={OFFER}>Offer Letter (opens its own form)</option>}
          </select>
        </Field>
        <Field label="Employee">
          <select className={inputCls} value={employeeId} onChange={(e) => pickEmployee(e.target.value)} disabled={locked}>
            <option value="">Pick who the letter is for…</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName} — {s.employeeCode}{s.designation ? ` · ${s.designation}` : ''}{s.left ? ' (left)' : ''}
              </option>
            ))}
          </select>
        </Field>

        {showDetails && (askPurpose || type === 'SALARY_CERTIFICATE' || type === 'NOC_VISA') && (
          <div className="md:col-span-2 grid gap-4 md:grid-cols-2 border-t border-slate-100 pt-4">
            {askPurpose && (
              <Field label={PURPOSE[type].label} wide={type !== 'SALARY_CERTIFICATE'}>
                <input className={inputCls} value={details.purpose} placeholder={PURPOSE[type].placeholder} onChange={(e) => setDetail('purpose', e.target.value)} />
              </Field>
            )}
            {type === 'SALARY_CERTIFICATE' && (
              <Field label="Addressed to (bank), optional">
                <input className={inputCls} value={details.bankName} onChange={(e) => setDetail('bankName', e.target.value)} placeholder="e.g. Meezan Bank" />
              </Field>
            )}
            {type === 'NOC_VISA' && (
              <>
                <Field label="Country" wide>
                  <input className={inputCls} value={details.destinationCountry} onChange={(e) => setDetail('destinationCountry', e.target.value)} placeholder="e.g. United Arab Emirates" />
                </Field>
                <Field label="Travelling from">
                  <input type="date" className={inputCls} value={details.travelFrom} onChange={(e) => setDetail('travelFrom', e.target.value)} />
                </Field>
                <Field label="Travelling until">
                  <input type="date" className={inputCls} value={details.travelTo} onChange={(e) => setDetail('travelTo', e.target.value)} />
                </Field>
              </>
            )}
            <div className="md:col-span-2">
              <Button variant="outline" size="sm" disabled={!employeeId || loading}
                onClick={() => { if (confirmDiscard()) void load(type, employeeId, details) }}>
                <RotateCcw className="w-3.5 h-3.5" /> Rewrite the letter with these details
              </Button>
            </div>
          </div>
        )}
      </section>

      {loading && (
        <p className="text-sm text-slate-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Writing the letter from their record…
        </p>
      )}

      {!employeeId && !loading && (
        <div className="text-center py-10 text-slate-400">
          <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">Pick an employee to start the letter.</p>
        </div>
      )}

      {text && !loading && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)] items-start">
          <div className="space-y-4 min-w-0">
            <section className="bg-white border border-slate-200 rounded-xl p-4 grid gap-4 sm:grid-cols-2">
              <Field label="Date">
                <input className={inputCls} value={text.letterDate} onChange={(e) => set('letterDate', e.target.value)} />
              </Field>
              <Field label="Subject">
                <input className={inputCls} value={text.subject} onChange={(e) => set('subject', e.target.value)} />
              </Field>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl">
              <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">The letter</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  One box per paragraph. Press Enter inside a box to start a new line without a gap.
                </p>
              </div>
              <ol className="divide-y divide-slate-100">
                {text.paragraphs.map((p, i) => (
                  <li key={i} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Paragraph {i + 1}</span>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                          className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                          Move up
                        </button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === text.paragraphs.length - 1}
                          className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                          Move down
                        </button>
                        <button type="button" onClick={() => remove(i)}
                          className="text-xs px-2 py-1 rounded border border-slate-200 text-red-700 hover:bg-red-50">
                          Remove
                        </button>
                      </div>
                    </div>
                    <textarea
                      className={`${inputCls} leading-relaxed`}
                      rows={Math.max(2, Math.ceil(p.length / 80) + (p.match(/\n/g)?.length ?? 0))}
                      value={p}
                      onChange={(e) => setParagraph(i, e.target.value)}
                    />
                  </li>
                ))}
              </ol>
              <div className="px-4 py-3 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={add} disabled={text.paragraphs.length >= MAX_PARAGRAPHS}>
                  <Plus className="w-3.5 h-3.5" /> Add paragraph
                </Button>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-4 grid gap-4 sm:grid-cols-2">
              <Field label="Signed by">
                <input className={inputCls} value={text.signatoryName} onChange={(e) => set('signatoryName', e.target.value)} />
              </Field>
              <Field label="Their title">
                <input className={inputCls} value={text.signatoryTitle} onChange={(e) => set('signatoryTitle', e.target.value)} />
              </Field>
            </section>
          </div>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden xl:sticky xl:top-4">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Preview</h2>
              <span className="text-[11px] text-slate-500 inline-flex items-center gap-1.5">
                {drawing ? <><Loader2 className="w-3 h-3 animate-spin" /> Updating…</> : 'Up to date'}
              </span>
            </div>
            {!fits && (
              <p className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border-b border-amber-200 px-4 py-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                The letter runs into the space kept for the signature and stamp. Shorten or remove a paragraph.
              </p>
            )}
            {previewUrl ? (
              <iframe title="Letter preview" src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
                className="w-full bg-slate-100" style={{ aspectRatio: '595 / 842' }} />
            ) : (
              <div className="flex items-center justify-center text-sm text-slate-400 bg-slate-50" style={{ aspectRatio: '595 / 842' }}>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Drawing the letter…
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${wide ? 'md:col-span-2' : ''}`}>
      <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
