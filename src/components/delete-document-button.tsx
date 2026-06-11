'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

interface Props {
  documentId: string
  documentName: string
}

/**
 * HR-only inline delete for an employee document. Calls
 * DELETE /api/documents/[id]/download which removes the BYTEA row.
 *
 * Two-click confirmation pattern to avoid accidental deletes:
 *   click 1 → button turns red + asks "Sure?"
 *   click 2 → fires DELETE
 *   click outside or wait 4s → resets
 */
export default function DeleteDocumentButton({ documentId, documentName }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function doDelete() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/documents/${documentId}/download`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Delete failed')
      }
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed')
      setBusy(false)
      setConfirming(false)
    }
  }

  function handleClick() {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 4000)
      return
    }
    doDelete()
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title={confirming ? `Click again to permanently delete "${documentName}"` : 'Delete document'}
        className={`
          inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors
          ${confirming
            ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
            : 'text-rose-600 hover:bg-rose-50'}
          ${busy ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <Trash2 className="w-3.5 h-3.5" />
        {busy ? 'Deleting…' : confirming ? 'Sure?' : 'Delete'}
      </button>
      {err && <span className="text-xs text-rose-700">{err}</span>}
    </span>
  )
}
