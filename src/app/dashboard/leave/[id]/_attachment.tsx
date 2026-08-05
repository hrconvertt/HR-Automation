'use client'

/**
 * Evidence on a leave request — view it, or attach it after the fact.
 *
 * Attaching afterwards is the normal case, not the exception. Someone emails
 * the prescription the next morning; HR reconstructs a year of requests from
 * the inbox with the files in hand. Until now the reason could say "medical
 * certificate attached" while nothing was.
 */

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip, Upload, Loader2, Trash2, AlertTriangle } from 'lucide-react'

export function LeaveAttachment({ id, name, canEdit, canDelete }: {
  id: string
  name: string | null
  canEdit: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    const body = new FormData()
    body.append('file', file)
    const res = await fetch(`/api/leave/${id}/attachment`, { method: 'POST', body })
    setBusy(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Could not attach that file.')
      return
    }
    router.refresh()
  }

  async function remove() {
    if (!confirm('Remove this attachment?')) return
    setBusy(true)
    await fetch(`/api/leave/${id}/attachment`, { method: 'DELETE' }).catch(() => {})
    setBusy(false)
    router.refresh()
  }

  return (
    <div className="pt-3 border-t border-slate-100">
      <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
        Evidence
      </p>

      {name ? (
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <a
            href={`/api/leave/${id}/attachment`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-slate-900 hover:underline"
          >
            <Paperclip className="w-3.5 h-3.5" /> {name}
          </a>
          {canDelete && (
            <button
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-600 disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => input.current?.click()}
              disabled={busy}
              className="text-xs text-slate-500 hover:text-slate-900 hover:underline disabled:opacity-40"
            >
              Replace
            </button>
          )}
        </div>
      ) : canEdit ? (
        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 mt-1.5 rounded-md border border-dashed border-slate-300 text-slate-600 text-xs px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Attach a prescription, certificate or date sheet
        </button>
      ) : (
        <p className="text-sm text-slate-400 mt-1">None attached.</p>
      )}

      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) upload(f)
          e.target.value = ''
        }}
      />

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-700 mt-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
      {canEdit && !name && !error && (
        <p className="text-[11px] text-slate-400 mt-1">PDF or image, up to 5 MB.</p>
      )}
    </div>
  )
}
