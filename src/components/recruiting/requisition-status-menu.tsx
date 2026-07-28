'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical, Pause, Play, X, CheckCheck, RotateCcw } from 'lucide-react'

interface Props {
  requisitionId: string
  status: string
  title: string
}

/**
 * Three-dot menu on each Job Requisition row.
 *
 *   OPEN    → Pause · Mark as Filled · Close
 *   PAUSED  → Resume · Close
 *   CLOSED  → Reopen
 *   FILLED  → Reopen (in case the hire fell through)
 *
 * HR_ADMIN only — the page already gates rendering by role.
 */
export function RequisitionStatusMenu({ requisitionId, status, title }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function transition(target: string, confirmCopy?: string) {
    setOpen(false)
    if (confirmCopy && !confirm(confirmCopy)) return
    setSaving(true)
    const res = await fetch(`/api/recruiting/requisitions/${requisitionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: target }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Failed to change status')
      return
    }
    router.refresh()
  }

  const actions: { label: string; target: string; icon: React.ReactNode; tone?: string; confirmCopy?: string }[] = []
  if (status === 'OPEN') {
    actions.push({ label: 'Pause hiring',     target: 'PAUSED', icon: <Pause     className="w-3.5 h-3.5" /> })
    actions.push({ label: 'Mark as Filled',   target: 'FILLED', icon: <CheckCheck className="w-3.5 h-3.5" />, tone: 'text-slate-700', confirmCopy: `Mark "${title}" as Filled? It will leave the active hiring board.` })
    actions.push({ label: 'Close (abandon)',  target: 'CLOSED', icon: <X         className="w-3.5 h-3.5" />, tone: 'text-slate-700',  confirmCopy: `Close "${title}" without hiring? It can be reopened later.` })
  }
  if (status === 'PAUSED') {
    actions.push({ label: 'Resume',           target: 'OPEN',   icon: <Play  className="w-3.5 h-3.5" />, tone: 'text-slate-700' })
    actions.push({ label: 'Close (abandon)',  target: 'CLOSED', icon: <X     className="w-3.5 h-3.5" />, tone: 'text-slate-700' })
  }
  if (status === 'CLOSED' || status === 'FILLED') {
    actions.push({ label: 'Reopen',           target: 'OPEN',   icon: <RotateCcw className="w-3.5 h-3.5" />, tone: 'text-slate-700' })
  }

  if (actions.length === 0) return null

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100"
        title="Status actions"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-48">
            {actions.map((a) => (
              <button
                key={a.target}
                onClick={() => transition(a.target, a.confirmCopy)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 ${a.tone ?? 'text-slate-700'}`}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
