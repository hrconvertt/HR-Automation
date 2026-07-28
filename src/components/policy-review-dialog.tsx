'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface ReviewerOption {
  id: string
  fullName: string
  designation: string
  role: string
}

/**
 * Reviewer-picker dialog. HR uses this to send a DRAFT policy out for review.
 * Reviewer pool = active EXECUTIVE-role users + active HR_ADMIN users (excluding
 * the submitter — no self-review).
 */
export function PolicyReviewDialog({
  policyId,
  policyTitle,
  open,
  onOpenChange,
}: {
  policyId: string
  policyTitle: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const router = useRouter()
  const [pool, setPool] = useState<ReviewerOption[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setLoading(true)
    fetch('/api/policies/reviewer-pool', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        setPool(Array.isArray(j.reviewers) ? j.reviewers : [])
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [open])

  function toggle(id: string) {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  async function submit() {
    if (picked.size === 0) {
      setError('Pick at least one reviewer')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch(`/api/policies/${policyId}/submit-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewerIds: Array.from(picked) }),
      })
      const j = await r.json()
      if (!r.ok) {
        setError(j.error ?? 'Submission failed')
        return
      }
      onOpenChange(false)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send for Review</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">
          Pick reviewers for <span className="font-semibold">{policyTitle}</span>. The policy will be
          held in <span className="font-medium">IN_REVIEW</span> until <strong>all</strong> picked
          reviewers approve. A single rejection bounces it back to draft.
        </p>
        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1">
          {loading ? (
            <div className="text-center py-6 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading reviewers…
            </div>
          ) : pool.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No eligible reviewers found.</p>
          ) : (
            pool.map((r) => (
              <label
                key={r.id}
                className={`flex items-start gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm ${
                  picked.has(r.id) ? 'bg-slate-50' : 'hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={picked.has(r.id)}
                  onChange={() => toggle(r.id)}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 truncate">{r.fullName}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {r.designation} · <span className="uppercase">{r.role}</span>
                  </p>
                </div>
              </label>
            ))
          )}
        </div>
        {error && (
          <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || picked.size === 0}>
            {submitting ? 'Submitting…' : `Submit for Review (${picked.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
