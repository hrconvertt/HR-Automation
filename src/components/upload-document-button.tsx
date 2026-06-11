'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Upload, X, FileText, CheckCircle2, AlertCircle } from 'lucide-react'
import { DOC_TYPES } from '@/lib/document-types'

interface Props {
  employeeId: string
  /** When true, render a small inline button (used on employee profile). */
  compact?: boolean
}

const MAX_SIZE_MB = 10
const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.docx,.doc'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return '📄'
  if (ext === 'doc' || ext === 'docx') return '📝'
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') return '🖼️'
  return '📎'
}

/**
 * Reusable "Upload Document" button + modal. Posts to /api/documents.
 * Used in: Employee Profile → Documents tab.
 *
 * UX: drag-and-drop zone, file preview with icon + size, type dropdown,
 * inline validation (size cap, no-type), error states.
 */
export default function UploadDocumentButton({ employeeId, compact }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<string>('OTHER')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndSet = useCallback((f: File | null) => {
    setErr(null)
    if (!f) { setFile(null); return }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setErr(`File exceeds ${MAX_SIZE_MB} MB limit.`)
      return
    }
    setFile(f)
  }, [])

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0] ?? null
    validateAndSet(f)
  }

  async function handleUpload() {
    if (!file) { setErr('Please choose a file.'); return }
    setBusy(true); setErr(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', type)
      fd.append('employeeId', employeeId)
      fd.append('name', file.name)
      const res = await fetch('/api/documents', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Upload failed')
      }
      setOpen(false); setFile(null); setType('OTHER')
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    if (busy) return
    setOpen(false); setFile(null); setType('OTHER'); setErr(null)
  }

  return (
    <>
      <Button size={compact ? 'sm' : 'default'} onClick={() => setOpen(true)}>
        <Upload className="w-4 h-4 mr-1.5" /> Upload Document
      </Button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={reset}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base text-slate-900">Upload document</h3>
                <p className="text-xs text-slate-500 mt-0.5">PDF, JPG, PNG, DOC, DOCX · max {MAX_SIZE_MB} MB</p>
              </div>
              <button
                onClick={reset}
                className="text-slate-400 hover:text-slate-700 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Document type */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block uppercase tracking-wider">
                  Document type <span className="text-rose-500">*</span>
                </label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* File picker — drag-and-drop zone */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block uppercase tracking-wider">
                  File <span className="text-rose-500">*</span>
                </label>

                {file ? (
                  // Preview card when file chosen
                  <div className="border-2 border-emerald-200 bg-emerald-50/60 rounded-xl p-4 flex items-center gap-3">
                    <div className="text-3xl">{fileIcon(file.name)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{formatSize(file.size)}</p>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <button
                      onClick={() => validateAndSet(null)}
                      disabled={busy}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                      aria-label="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  // Drop zone
                  <div
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    className={`
                      border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                      ${dragOver
                        ? 'border-blue-400 bg-blue-50/60'
                        : 'border-slate-300 bg-slate-50/40 hover:border-blue-300 hover:bg-blue-50/30'}
                    `}
                  >
                    <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                      <Upload className="w-6 h-6 text-blue-600" />
                    </div>
                    <p className="text-sm font-medium text-slate-900 mb-1">
                      Click to browse or drag a file here
                    </p>
                    <p className="text-xs text-slate-500">
                      PDF, JPG, PNG, DOC, DOCX · up to {MAX_SIZE_MB} MB
                    </p>
                    <input
                      ref={inputRef}
                      type="file"
                      accept={ACCEPTED}
                      className="hidden"
                      onChange={(e) => validateAndSet(e.target.files?.[0] ?? null)}
                    />
                  </div>
                )}
              </div>

              {/* Error banner */}
              {err && (
                <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-700 leading-relaxed">{err}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {file ? (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    Ready to upload
                  </span>
                ) : 'No file selected'}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset} disabled={busy}>Cancel</Button>
                <Button onClick={handleUpload} disabled={busy || !file}>
                  {busy ? 'Uploading…' : 'Upload'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
