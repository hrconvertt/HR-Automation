'use client'

/**
 * Evidence on a request — as many files as it takes, shown large.
 *
 * The first version listed files with 56px thumbnails, which is a filename with
 * a decoration next to it: you still had to open every one to see what it was.
 * Evidence is the thing an approver looks at, so the document is the content
 * and the filename is the caption.
 */
import { useState, useCallback, useRef } from 'react'
import { Paperclip, Trash2, Upload, FileText, Loader2, Maximize2 } from 'lucide-react'

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
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useCallback(async (picked: FileList | File[] | null) => {
    const list = picked ? Array.from(picked) : []
    if (list.length === 0) return
    setBusy(true); setErr('')
    try {
      const payload: { base64: string; mime: string; name: string }[] = []
      for (const f of list) {
        if (f.size > MAX_BYTES) { setErr(`${f.name} is over 5 MB.`); return }
        const buf = await f.arrayBuffer()
        let bin = ''
        const view = new Uint8Array(buf)
        // Chunked — spreading a multi-megabyte array into fromCharCode
        // overflows the call stack.
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
    <section
      className={`bg-white border rounded-xl overflow-hidden transition-colors ${
        dragging ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200'
      }`}
      onDragOver={(e) => { if (canAdd) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!canAdd) return
        e.preventDefault(); setDragging(false)
        upload(e.dataTransfer.files)
      }}
    >
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Evidence{files.length > 0 ? ` · ${files.length}` : ''}
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {canAdd ? 'Drop files here, or ' : ''}PDF, JPG, PNG or WebP · 5 MB each · up to 10
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
        <div className="px-4 py-14 text-center">
          <Paperclip className="w-6 h-6 text-slate-300 mx-auto" />
          <p className="text-sm text-slate-400 mt-2">Nothing attached yet.</p>
          {canAdd && (
            <p className="text-[11px] text-slate-400 mt-1">Drop a file here or use Add files.</p>
          )}
        </div>
      ) : (
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {files.map((f) => {
            const isImage = f.mime.startsWith('image/')
            const href = `/api/leave/${requestId}/attachment?fileId=${f.id}`
            return (
              <figure
                key={f.id}
                className="group relative border border-slate-200 rounded-lg overflow-hidden bg-slate-50 flex flex-col"
              >
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="block relative bg-white"
                  title="Open full size"
                >
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={href}
                      alt={f.name}
                      loading="lazy"
                      className="w-full h-64 object-contain bg-white"
                    />
                  ) : (
                    <span className="w-full h-64 flex flex-col items-center justify-center gap-2 text-slate-400">
                      <FileText className="w-10 h-10" />
                      <span className="text-xs">PDF — open to read</span>
                    </span>
                  )}
                  <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 text-white rounded p-1">
                    <Maximize2 className="w-3.5 h-3.5" />
                  </span>
                </a>
                <figcaption className="px-3 py-2 border-t border-slate-200 bg-white flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-xs font-medium text-slate-900 hover:underline break-words"
                    >
                      {f.name}
                    </a>
                    <span className="block text-[11px] text-slate-400 mt-0.5">
                      {kb(f.size)} · added{' '}
                      {new Date(f.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </span>
                  </span>
                  {canDelete && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(f.id, f.name)}
                      title="Remove this file"
                      className="text-slate-300 hover:text-red-700 disabled:opacity-40 flex-shrink-0 mt-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </figcaption>
              </figure>
            )
          })}
        </div>
      )}
    </section>
  )
}

const kb = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
