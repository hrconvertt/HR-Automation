'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Upload, X } from 'lucide-react'
import { DOC_TYPES } from '@/lib/document-types'

interface Props {
  employeeId: string
  /** When true, render a small inline button (used on employee profile). */
  compact?: boolean
}

/**
 * Reusable "Upload Document" button + modal. Posts to /api/documents.
 * Used in: Employee Profile → Documents tab.
 */
export default function UploadDocumentButton({ employeeId, compact }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<string>('OTHER')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleUpload() {
    if (!file) { setErr('Pick a file first.'); return }
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

  return (
    <>
      <Button size={compact ? 'sm' : 'default'} onClick={() => setOpen(true)}>
        <Upload className="w-4 h-4 mr-1.5" /> Upload Document
      </Button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Upload document</h3>
              <button onClick={() => !busy && setOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Document type</label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">File</label>
                <Input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>

              {err && <p className="text-xs text-red-600">{err}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
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
