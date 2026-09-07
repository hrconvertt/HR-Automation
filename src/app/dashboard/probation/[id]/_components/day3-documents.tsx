'use client'

/**
 * Day-3 paperwork — generate it, then put the signed copy back.
 *
 * "Open" produced a blank agreement with signature slots and that was the end
 * of the trail: the signed copy lived in somebody's email or a drawer, and the
 * row said "Open" forever, whether it had been signed on day three or not at
 * all. There was no way to tell the two apart from this screen.
 *
 * Uploading files it against the employee like any other document, so it shows
 * on their profile rather than only here, and the row says Submitted.
 */

import { useState, useEffect, useCallback } from 'react'
import { FileText, Upload, Check, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toastSuccess, toastError } from '@/components/ui/toaster'

interface Day3Doc {
  /** The generator's slug, e.g. employment_agreement. */
  slug: string
  /** The EmployeeDocument type the signed copy is filed under. */
  docType: string
  name: string
  sub: string
  /** Set when a signed copy is already on file. */
  uploaded: { id: string; name: string; createdAt: string } | null
}

/** The two documents signed in the first days on the job. */
const DAY3: Day3Doc[] = [
  {
    slug: 'employment_agreement', docType: 'EMPLOYMENT_AGREEMENT',
    name: 'Employment Agreement',
    sub: 'Appointment, salary, probation, leave and conduct policies',
    uploaded: null,
  },
  {
    slug: 'nda', docType: 'NDA',
    name: 'Non-Disclosure Agreement',
    sub: 'Confidentiality, intellectual property and non-solicitation',
    uploaded: null,
  },
]

const ACCEPT = 'application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function Day3Documents({ employeeId }: { employeeId: string }) {
  const [state, setState] = useState<Day3Doc[]>(DAY3)
  const [busy, setBusy] = useState<string | null>(null)

  // The page around this is a client component, so what is already on file is
  // read from the same endpoint the employee's own Documents tab uses.
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents?employeeId=${employeeId}`)
      if (!res.ok) return
      const d = await res.json()
      const docs: { id: string; type: string; name: string; createdAt: string }[] = d.documents ?? []
      setState(DAY3.map((row) => {
        const hit = docs
          .filter((x) => x.type === row.docType)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
        return hit
          ? { ...row, uploaded: { id: hit.id, name: hit.name, createdAt: hit.createdAt } }
          : row
      }))
    } catch { /* the rows still work without it */ }
  }, [employeeId])

  // The fetch runs first, so the state lands in a promise callback rather than
  // straight down the effect body.
  useEffect(() => {
    let cancelled = false
    void (async () => { if (!cancelled) await load() })()
    return () => { cancelled = true }
  }, [load])

  async function upload(doc: Day3Doc, file: File | null) {
    if (!file) return
    setBusy(doc.docType)
    try {
      const form = new FormData()
      form.append('employeeId', employeeId)
      form.append('type', doc.docType)
      form.append('name', `${doc.name} — signed`)
      form.append('file', file)
      const res = await fetch('/api/documents', { method: 'POST', body: form })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        toastError(`${doc.name} not uploaded`, d.error)
        return
      }
      toastSuccess(`${doc.name} submitted`, 'Filed on the employee’s documents.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="divide-y divide-slate-100">
      {state.map((doc) => {
        const done = !!doc.uploaded
        return (
          <div
            key={doc.docType}
            className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50/60 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 flex items-center gap-2">
                {doc.name}
                {done && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-800 border-emerald-200">
                    <Check className="w-3 h-3" /> Submitted
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {done
                  ? `Signed copy on file — ${new Date(doc.uploaded!.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : doc.sub}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {done ? (
                <a
                  href={`/api/documents/${doc.uploaded!.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> View signed
                  </Button>
                </a>
              ) : (
                <a
                  href={`/api/documents/generate?type=${doc.slug}&employeeId=${employeeId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm">
                    <FileText className="w-3.5 h-3.5 mr-1.5" /> Open
                  </Button>
                </a>
              )}

              {/* A label wrapping a hidden input — the file picker needs a real
                  input, and a button inside a label would swallow the click. */}
              <label className="inline-flex">
                <input
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  disabled={busy === doc.docType}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    e.target.value = ''
                    void upload(doc, f)
                  }}
                />
                <span
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium cursor-pointer ${
                    busy === doc.docType
                      ? 'border-slate-200 text-slate-400'
                      : done
                        ? 'border-slate-300 text-slate-600 hover:bg-slate-50'
                        : 'border-transparent bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {busy === doc.docType
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Upload className="w-3.5 h-3.5" />}
                  {done ? 'Replace' : 'Upload signed'}
                </span>
              </label>
            </div>
          </div>
        )
      })}
    </div>
  )
}
