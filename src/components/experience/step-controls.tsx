'use client'

/** Complete Step / Undo, and the quiet "opened" ping when a step is shown. */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'

async function record(assignmentId: string, stepId: string, action: 'VIEW' | 'COMPLETE' | 'UNCOMPLETE') {
  const res = await fetch('/api/experience/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignmentId, stepId, action }),
  })
  return res.ok ? null : (((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Something went wrong.')
}

export function ViewPing({ assignmentId, stepId }: { assignmentId: string; stepId: string }) {
  useEffect(() => {
    void record(assignmentId, stepId, 'VIEW')
  }, [assignmentId, stepId])
  return null
}

export function CompleteStepButton({ assignmentId, stepId, done, nextHref }: {
  assignmentId: string
  stepId: string
  done: boolean
  /** Where to go once it is complete — the next step. */
  nextHref: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  if (done) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-emerald-800">Step complete ✓</span>
        <button type="button" disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const err = await record(assignmentId, stepId, 'UNCOMPLETE')
              if (err) { toastError('Could not undo it', err); return }
              router.refresh()
            } finally { setBusy(false) }
          }}
          className="text-xs text-slate-500 underline disabled:opacity-40">
          Mark as not done
        </button>
      </div>
    )
  }

  return (
    <button type="button" disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const err = await record(assignmentId, stepId, 'COMPLETE')
          if (err) { toastError('Could not complete the step', err); return }
          toastSuccess('Step complete')
          if (nextHref) router.push(nextHref)
          router.refresh()
        } finally { setBusy(false) }
      }}
      className="text-sm font-semibold px-6 py-2.5 rounded-full bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-40">
      {busy ? 'Saving…' : 'Complete step ✓'}
    </button>
  )
}
