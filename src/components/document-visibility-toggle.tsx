'use client'

/**
 * HR-only per-row toggle: shows an eye / eye-off icon and PATCHes
 * /api/documents/[id] with the flipped visibleToEmployee value.
 * Optimistic — flips immediately, reverts on failure.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'

export default function DocumentVisibilityToggle({
  documentId,
  initialVisible,
}: {
  documentId: string
  initialVisible: boolean
}) {
  const router = useRouter()
  const [visible, setVisible] = useState(initialVisible)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    if (busy) return
    const next = !visible
    setBusy(true)
    setVisible(next)
    const res = await fetch(`/api/documents/${documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibleToEmployee: next }),
    })
    setBusy(false)
    if (!res.ok) {
      setVisible(!next) // revert
      return
    }
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={visible ? 'Visible to employee — click to hide' : 'Hidden from employee — click to show'}
      className={`p-1 rounded-md transition-colors ${
        visible
          ? 'text-emerald-600 hover:bg-emerald-50'
          : 'text-slate-400 hover:bg-slate-100'
      } disabled:opacity-50`}
    >
      {visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
    </button>
  )
}
