'use client'

/**
 * Opens a requisition's Manpower Requisition Form, creating it on first click.
 *
 * Seeded from the requisition, so the department, designation, vacancies and
 * existing headcount are already filled — the form asks for what only a person
 * knows, not for what the system already has.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ManpowerFormButton({
  requisitionId, existingFormId,
}: {
  requisitionId: string
  existingFormId: string | null
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

  return (
    <>
      <button type="button" onClick={go} disabled={busy} title="Manpower Requisition Form"
        className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 whitespace-nowrap disabled:opacity-40">
        {busy ? 'Opening…' : existingFormId ? 'Requisition form' : 'Start requisition form'}
      </button>
      {err && <p className="text-[11px] text-red-700 mt-1">{err}</p>}
    </>
  )
}
