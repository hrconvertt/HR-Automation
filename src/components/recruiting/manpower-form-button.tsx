'use client'

/**
 * Opens a requisition's Manpower Requisition Form, creating it on first click.
 *
 * Seeded from the requisition, so the department, designation, vacancies and
 * existing headcount are already filled — the form asks for what only a person
 * knows, not for what the system already has.
 *
 * One width whatever the state, like the JD and Filters chips beside it. The
 * label started as "Start requisition form", which on thirteen rows was a
 * column of long ragged buttons; the state sits in the dot instead.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList } from 'lucide-react'

export function ManpowerFormButton({
  requisitionId, existingFormId, status,
}: {
  requisitionId: string
  existingFormId: string | null
  status?: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function go() {
    if (existingFormId) {
      router.push(`/dashboard/recruiting/requisitions/${existingFormId}`)
      return
    }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/manpower-requisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requisitionId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.id) { setErr(d.error ?? 'Could not open the form.'); return }
      router.push(`/dashboard/recruiting/requisitions/${d.id}`)
    } finally { setBusy(false) }
  }

  const dot = !existingFormId
    ? 'bg-slate-300'
    : status === 'APPROVED' ? 'bg-emerald-500' : 'bg-amber-500'

  const title = !existingFormId
    ? 'Manpower Requisition Form — not started'
    : `Manpower Requisition Form — ${(status ?? 'DRAFT').toLowerCase()}`

  return (
    <>
      <button type="button" onClick={go} disabled={busy} title={title}
        className="inline-flex items-center justify-center gap-1.5 w-[74px] text-[11px] font-medium px-2 py-1 rounded-md border text-slate-700 border-slate-100 bg-slate-50 hover:bg-slate-100 disabled:opacity-40">
        <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <ClipboardList className="w-3 h-3" />
        {busy ? '…' : 'Form'}
      </button>
      {err && <p className="text-[11px] text-red-700 mt-1">{err}</p>}
    </>
  )
}
