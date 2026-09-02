'use client'

/**
 * Opens somebody's appraisal form, creating it on the first click.
 *
 * A row on the due list is a person who needs a form. Making HR create one
 * from a separate screen first would put a step between "this is due" and
 * "here is the form", which is the whole distance this page exists to close.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function OpenAppraisal({
  employeeId, existingFormId,
}: {
  employeeId: string
  existingFormId: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function go() {
    if (existingFormId) { router.push(`/dashboard/performance/appraisals/${existingFormId}`); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/appraisals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.id) { setErr(d.error ?? 'Could not open the form.'); return }
      router.push(`/dashboard/performance/appraisals/${d.id}`)
    } finally { setBusy(false) }
  }

  return (
    <>
      <button type="button" onClick={go} disabled={busy}
        className={`text-[13px] px-3 py-1.5 rounded-lg border whitespace-nowrap disabled:opacity-40 ${
          existingFormId
            ? 'bg-white text-slate-900 border-slate-300'
            : 'bg-slate-900 text-white border-slate-900'
        }`}>
        {busy ? 'Opening…' : existingFormId ? 'Open appraisal form' : 'Start appraisal form'}
      </button>
      {err && <p className="text-[11px] text-red-700 mt-1">{err}</p>}
    </>
  )
}
