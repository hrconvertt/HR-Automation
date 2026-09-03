'use client'

/**
 * Evidence on a request — as many files as it takes.
 *
 * It was one file. Rayyan's Friday needed two, the challan that evidenced the
 * day and the form the payment was for, and attaching the second meant losing
 * the first. Files are listed, added several at a time, and removed one at a
 * time; images preview inline, because a challan is read by looking at it.
 */
import { useState, useCallback, useRef } from 'react'
import { Paperclip, Trash2, Upload, FileText, ImageIcon, Loader2 } from 'lucide-react'

export interface EvidenceFile {
  id: string
  name: string
  mime: string
  size: number
  createdAt: string
}

const MAX_BYTES = 5 * 1024 * 1024

export function EvidencePanel({
  requestId, initial, canAdd, canDelete,
}: {
  requestId: string
  initial: EvidenceFile[]
  canAdd: boolean
  canDelete: boolean
}) {
  const [files, setFiles] = useState<EvidenceFile[]>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useCallback(async (picked: FileList | null) => {
    if (!picked || picked.length === 0) return
    setBusy(true); setErr('')
    try {
      const payload: { base64: string; mime: string; name: string }[] = []
      for (const f of Array.from(picked)) {
        if (f.size > MAX_BYTES) { setErr(`${f.name} is over 5 MB.`); return }
        const buf = await f.arrayBuffer()
        let bin = ''
        const view = new Uint8Array(buf)
        // Chunked, because spreading a multi-megabyte array into
        // String.fromCharCode blows the call stack.
        for (let i = 0; i < view.length; i += 8192) {
          bin += String.fromCharCode(...view.subarray(i, i + 8192))
        }
        payload.push({ base64: btoa(bin), mime: f.type || 'application/octet-stream', name: f.name })
      }
      const res = await fetch(`/api/leave/${requestId}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: payload }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'Could not upload.'); return }
      setFiles(d.files)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }, [requestId])

  async function remove(fileId: string, name: string) {
    if (!confirm(`Remove “${name}” from this request?`)) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/leave/${requestId}/evidence?fileId=${fileId}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'Could not remove.'); return }
      setFiles(d.files)
    } finally { setBusy(false) }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Evidence{files.length > 0 ? ` · ${files.length}` : ''}
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            PDF, JPG, PNG or WebP · up to 5 MB each · 10 files
          </p>
        </div>
        {canAdd && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => upload(e.target.files)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 disabled:opacity-40 whitespace-nowrap"
            >
              {busy
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Upload className="w-3.5 h-3.5" />}
              Add files
            </button>
          </>
        )}
      </div>

      {err && <p className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100">{err}</p>}

      {files.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-400 flex items-center gap-2">
          <Paperclip className="w-4 h-4" /> Nothing attached yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {files.map((f) => {
            const isImage = f.mime.startsWith('image/')
            const href = `/api/leave/${requestId}/attachment?fileId=${f.id}`
            return (
              <li key={f.id} className="px-4 py-3 flex items-center gap-3">
                <a href={href} target="_blank" rel="noreferrer" className="flex-shrink-0">
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={href}
                      alt={f.name}
                      className="w-14 h-14 object-cover rounded-md border border-slate-200 bg-slate-50"
                    />
                  ) : (
                    <span className="w-14 h-14 rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-slate-400" />
                    </span>
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-slate-900 hover:underline break-words inline-flex items-center gap-1.5"
                  >
                    {isImage
                      ? <ImageIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      : <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
                    {f.name}
                  </a>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {kb(f.size)} · added{' '}
                    {new Date(f.createdAt).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </p>
                </div>
                {canDelete && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(f.id, f.name)}
                    title="Remove this file"
                    className="text-slate-400 hover:text-red-700 disabled:opacity-40 flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const kb = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
