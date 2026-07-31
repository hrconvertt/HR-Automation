'use client'

/**
 * One row of the Documents table on an employee profile.
 *
 * This owns the whole row rather than just the action cell because renaming
 * edits the Name and Type cells in place — the edit form and the cells it
 * replaces have to share state, and a server component can't hold it.
 *
 * HR gets three things beyond View: rename (name + type + expiry), extract
 * (read the file and fill the profile from it), and delete. Everyone else sees
 * the row read-only.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Sparkles, Check, X, Loader2, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { TableRow, TableCell } from '@/components/ui/table'
import { DOC_TYPES, docTypeLabel } from '@/lib/document-types'
import DeleteDocumentButton from '@/components/delete-document-button'
import DocumentVisibilityToggle from '@/components/document-visibility-toggle'

export interface DocumentRowData {
  id: string
  name: string
  type: string
  url: string
  createdAt: string
  expiryDate: string | null
  visibleToEmployee: boolean
  /** False for link-only rows (e.g. imported Drive URLs) — nothing to read. */
  hasFile: boolean
}

interface ExtractOutcome {
  applied: { label: string; value: string }[]
  conflicts: { label: string; existing: string; found: string }[]
  unchanged: { label: string; value: string }[]
  note: string | null
  wrote: boolean
}

export default function EmployeeDocumentRow({
  doc, canEdit, formatDate,
}: {
  doc: DocumentRowData
  canEdit: boolean
  /** Pre-formatted date string from the server, so the row renders identically
   *  on both sides of hydration regardless of the viewer's locale. */
  formatDate: string
}) {
  const router = useRouter()

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(doc.name)
  const [type, setType] = useState(doc.type)
  const [expiry, setExpiry] = useState(doc.expiryDate?.slice(0, 10) ?? '')
  const [saving, setSaving] = useState(false)

  const [extracting, setExtracting] = useState(false)
  const [outcome, setOutcome] = useState<ExtractOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Salary slips link straight to the printable route (lazy-rendered — no blob
  // to stream); everything else streams its stored bytes.
  const viewHref = doc.type === 'SALARY_SLIP' && doc.url
    ? doc.url
    : `/api/documents/${doc.id}/download`

  async function save() {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, type, expiryDate: expiry || null }),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Could not save the changes.')
      return
    }
    setEditing(false)
    router.refresh()
  }

  function cancel() {
    setName(doc.name)
    setType(doc.type)
    setExpiry(doc.expiryDate?.slice(0, 10) ?? '')
    setError(null)
    setEditing(false)
  }

  async function extract() {
    if (extracting) return
    setExtracting(true)
    setError(null)
    setOutcome(null)
    const res = await fetch(`/api/documents/${doc.id}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const j = await res.json().catch(() => ({}))
    setExtracting(false)
    if (!res.ok) {
      setError(j.error ?? 'Could not read this document.')
      return
    }
    setOutcome(j as ExtractOutcome)
    if (j.wrote) router.refresh()
  }

  if (editing) {
    return (
      <TableRow>
        <TableCell colSpan={4} className="bg-slate-50">
          <div className="flex flex-wrap items-end gap-3 py-1">
            <label className="flex flex-col gap-1 min-w-[240px] flex-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
                autoFocus
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Expires</span>
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
              />
            </label>
            <div className="flex items-center gap-2 pb-0.5">
              <button
                onClick={save}
                disabled={saving || !name.trim()}
                className="inline-flex items-center gap-1 rounded-md bg-slate-900 text-white text-xs px-3 py-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save
              </button>
              <button
                onClick={cancel}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 text-slate-700 text-xs px-3 py-2"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>
            {error && <p className="w-full text-xs text-red-600">{error}</p>}
          </div>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <>
      <TableRow>
        <TableCell>
          {doc.name}
          {doc.expiryDate && (
            <span className="ml-2 text-[11px] text-slate-400">
              expires {doc.expiryDate.slice(0, 10)}
            </span>
          )}
        </TableCell>
        <TableCell><Badge variant="secondary">{docTypeLabel(doc.type)}</Badge></TableCell>
        <TableCell>{formatDate}</TableCell>
        <TableCell>
          <div className="flex items-center gap-3">
            <a
              href={viewHref}
              target="_blank"
              rel="noreferrer"
              className="text-slate-700 text-xs hover:underline"
            >View</a>

            {canEdit && (
              <button
                onClick={() => setEditing(true)}
                title="Rename / change type"
                aria-label={`Edit ${doc.name}`}
                className="text-slate-400 hover:text-slate-900"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}

            {canEdit && (
              <button
                onClick={extract}
                disabled={extracting || !doc.hasFile}
                title={doc.hasFile
                  ? 'Read this document and fill any blank profile fields from it'
                  : 'This document is a link, not a stored file — nothing to read'}
                aria-label={`Extract details from ${doc.name}`}
                className="text-slate-400 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-400"
              >
                {extracting
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Sparkles className="w-3.5 h-3.5" />}
              </button>
            )}

            {canEdit && (
              <DocumentVisibilityToggle
                documentId={doc.id}
                initialVisible={doc.visibleToEmployee}
              />
            )}

            {canEdit && (
              <DeleteDocumentButton documentId={doc.id} documentName={doc.name} />
            )}
          </div>
        </TableCell>
      </TableRow>

      {(outcome || error) && (
        <TableRow>
          <TableCell colSpan={4} className="bg-slate-50 text-xs">
            {error && (
              <p className="flex items-start gap-2 text-red-700 py-1">
                <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                <span>{error}</span>
              </p>
            )}
            {outcome && (
              <div className="space-y-2 py-1">
                {outcome.applied.length > 0 && (
                  <div>
                    <p className="font-medium text-emerald-700">
                      Filled {outcome.applied.length} blank field{outcome.applied.length === 1 ? '' : 's'}:
                    </p>
                    <ul className="mt-1 space-y-0.5 text-slate-700">
                      {outcome.applied.map((a) => (
                        <li key={a.label}>
                          <span className="text-slate-500">{a.label}:</span> {a.value}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {outcome.conflicts.length > 0 && (
                  <div>
                    <p className="font-medium text-amber-700">
                      {outcome.conflicts.length} value{outcome.conflicts.length === 1 ? '' : 's'} disagree with
                      the profile — the profile was kept, change it by hand if the document is right:
                    </p>
                    <ul className="mt-1 space-y-0.5 text-slate-700">
                      {outcome.conflicts.map((c) => (
                        <li key={c.label}>
                          <span className="text-slate-500">{c.label}:</span> profile &ldquo;{c.existing}&rdquo; · document &ldquo;{c.found}&rdquo;
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {outcome.applied.length === 0 && outcome.conflicts.length === 0 && (
                  <p className="text-slate-600">
                    {outcome.unchanged.length > 0
                      ? `Nothing new — the ${outcome.unchanged.length} value${outcome.unchanged.length === 1 ? '' : 's'} readable here already match the profile.`
                      : 'Nothing readable could be pulled from this document.'}
                  </p>
                )}

                {outcome.note && (
                  <p className="text-slate-500 italic">Reader&rsquo;s note: {outcome.note}</p>
                )}

                <button
                  onClick={() => setOutcome(null)}
                  className="text-slate-500 hover:text-slate-900 underline"
                >
                  Dismiss
                </button>
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
