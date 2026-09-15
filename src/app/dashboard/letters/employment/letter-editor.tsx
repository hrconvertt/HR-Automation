'use client'

/**
 * The employment letter, line by line: the date, the subject, each paragraph
 * and the signatory, all editable, with the PDF redrawn beside them as you
 * type. Download saves exactly what the preview shows.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Download, FileText, Loader2, Plus, RotateCcw } from 'lucide-react'

interface Staff { id: string; fullName: string; employeeCode: string; designation: string | null }

/** Mirrors EmploymentLetterText in src/lib/pdf/employment-letter.ts. */
interface LetterText {
  letterDate: string
  subject: string
  paragraphs: string[]
  signatoryName: string
  signatoryTitle: string
}

/** Mirrors LETTER_TEXT_LIMITS; that module draws PDFs and stays on the server. */
const MAX_PARAGRAPHS = 20

const inputCls =
  'w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none '
  + 'focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400'

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

export function LetterEditor({ staff, initialEmployeeId }: { staff: Staff[]; initialEmployeeId: string }) {
  const [employeeId, setEmployeeId] = useState(initialEmployeeId)
  const [employeeName, setEmployeeName] = useState('')
  const [text, setText] = useState<LetterText | null>(null)
  const [original, setOriginal] = useState<LetterText | null>(null)
  const [loading, setLoading] = useState(!!initialEmployeeId)
  const [err, setErr] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [fits, setFits] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const urlRef = useRef<string | null>(null)

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/documents/employment-letter?employeeId=${id}&defaults=1`, { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((d as { error?: string }).error ?? 'Could not load that employee.')
    return d as { employeeName: string; text: LetterText }
  }, [])

  function applyLoaded(d: { employeeName: string; text: LetterText }) {
    setEmployeeName(d.employeeName)
    setText(d.text)
    setOriginal(d.text)
  }

  // Arriving from a probation page: load that person straight away.
  useEffect(() => {
    if (!initialEmployeeId) return
    let cancelled = false
    load(initialEmployeeId)
      .then((d) => { if (!cancelled) applyLoaded(d) })
      .catch((e: Error) => { if (!cancelled) setErr(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [initialEmployeeId, load])

  async function pick(id: string) {
    setEmployeeId(id)
    setErr(null)
    setText(null)
    setOriginal(null)
    if (!id) { setEmployeeName(''); return }
    setLoading(true)
    try {
      applyLoaded(await load(id))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
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
          setErr(null)
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
      a.download = `Employment Letter - ${employeeName || 'Letter'}.pdf`
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
  const edited = !!text && !!original && JSON.stringify(text) !== JSON.stringify(original)

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Employment Letter</h1>
          <p className="text-sm text-slate-500 mt-1">
            Written from the employee’s record. Change any line — the preview follows. Nothing here changes their record.
          </p>
        </div>
        {text && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!edited} onClick={() => original && setText(original)}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset to the record
            </Button>
            <Button size="sm" onClick={download} disabled={downloading}>
              {downloading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
              Download PDF
            </Button>
          </div>
        )}
      </div>

      {err && <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

      <section className="bg-white border border-slate-200 rounded-xl p-4 max-w-xl">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Employee</span>
          <select className={`${inputCls} mt-1`} value={employeeId} onChange={(e) => void pick(e.target.value)}>
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
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Add paragraph
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
              <iframe title="Employment letter preview" src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
