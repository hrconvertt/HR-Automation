'use client'

/**
 * Exit clearance document board — one row per prerequisite from the master
 * sheet's exit process.
 *
 * Each row does three things: generate a draft, upload the signed copy, and
 * open what is already on file. Generating opens the document in a new tab
 * where the browser's own print dialog covers print, save-as-PDF and download,
 * rather than three buttons that all do the same thing.
 *
 * A row is only complete once a file is attached. Generating a draft
 * deliberately does not tick it — the process is satisfied by a signed copy,
 * not by having produced a template.
 */

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, Upload, Check, Loader2, AlertTriangle, ExternalLink, Circle,
} from 'lucide-react'
import type { ExitDocument } from '@/lib/exit-documents'

export interface AttachedDoc {
  id: string
  name: string
  createdAt: string
}

export function ExitDocumentBoard({
  employeeId, employeeName, scenario, documents, attached, canEdit, lastWorkingDay,
}: {
  employeeId: string
  employeeName: string
  scenario: 'TERMINATION' | 'RESIGNATION'
  documents: ExitDocument[]
  /** Prerequisite key -> the file already on record for it. */
  attached: Record<string, AttachedDoc | undefined>
  canEdit: boolean
  lastWorkingDay: string | null
}) {
  const done = documents.filter((d) => attached[d.key]).length

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Exit documents — {employeeName}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {scenario === 'TERMINATION' ? 'Termination' : 'Resignation'} ·{' '}
              {documents.length} prerequisites
              {lastWorkingDay && <> · last working day {lastWorkingDay}</>}
            </p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-slate-900 tabular-nums">
              {done}<span className="text-slate-400">/{documents.length}</span>
            </div>
            <div className="text-[11px] text-slate-500">on file</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-slate-900 transition-all"
            style={{ width: `${documents.length ? (done / documents.length) * 100 : 0}%` }}
          />
        </div>
        {scenario === 'RESIGNATION' && (
          <p className="text-[11px] text-slate-400 mt-3">
            Show Cause, Notice Period, Termination Letter and Termination Email are not
            listed — they only apply when the company ends the employment.
          </p>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {documents.map((d) => (
          <Row
            key={d.key}
            doc={d}
            employeeId={employeeId}
            attached={attached[d.key]}
            canEdit={canEdit}
            lastWorkingDay={lastWorkingDay}
          />
        ))}
      </div>
    </div>
  )
}

function Row({ doc, employeeId, attached, canEdit, lastWorkingDay }: {
  doc: ExitDocument
  employeeId: string
  attached?: AttachedDoc
  canEdit: boolean
  lastWorkingDay: string | null
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function generate() {
    if (!doc.generator) return
    const qs = new URLSearchParams({ type: doc.generator, employeeId })
    if (lastWorkingDay) {
      qs.set('effectiveDate', lastWorkingDay)
      qs.set('lastWorkingDay', lastWorkingDay)
    }
    // New tab: the browser's print dialog there gives print, save-as-PDF and
    // download without us reimplementing any of them.
    window.open(`/api/documents/generate?${qs}`, '_blank')
  }

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    const body = new FormData()
    body.append('file', file)
    body.append('employeeId', employeeId)
    body.append('type', doc.fileAs)
    body.append('name', doc.label)
    const res = await fetch('/api/documents', { method: 'POST', body })
    setBusy(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Upload failed.')
      return
    }
    router.refresh()
  }

  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">
          {attached
            ? <Check className="w-4 h-4 text-emerald-600" />
            : <Circle className="w-4 h-4 text-slate-300" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${attached ? 'text-slate-900' : 'text-slate-700'}`}>
            {doc.label}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{doc.hint}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Drive: {doc.driveFile}
            {!doc.generator && ' · no draft — upload evidence only'}
          </p>
          {attached && (
            <p className="text-[11px] text-emerald-700 mt-1">
              On file: {attached.name} · {attached.createdAt}
            </p>
          )}
          {error && (
            <p className="flex items-center gap-1.5 text-[11px] text-red-700 mt-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {attached && (
            <a
              href={`/api/documents/${attached.id}/download`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-slate-700 hover:underline"
            >
              View <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {doc.generator && (
            <button
              onClick={generate}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 text-slate-700 text-xs px-2.5 py-1.5 hover:bg-slate-50"
              title="Open a draft — print, save as PDF or download from there"
            >
              <FileText className="w-3.5 h-3.5" /> Generate
            </button>
          )}
          {canEdit && (
            <>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) upload(f)
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 text-white text-xs px-2.5 py-1.5 disabled:opacity-50"
                title="Attach the signed copy"
              >
                {busy
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Upload className="w-3.5 h-3.5" />}
                {attached ? 'Replace' : 'Upload'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
