'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Send, CheckCircle2, XCircle, Power } from 'lucide-react'
import { PolicyReviewDialog } from '@/components/policy-review-dialog'

interface MyReview {
  id: string
  status: string
  comment: string | null
  reviewedAt: Date | null
}

/**
 * Workflow action panel — rendered in the policy detail sidebar.
 *
 *   • HR + DRAFT             → "Send for Review" button (opens reviewer-picker)
 *   • Reviewer + IN_REVIEW   → Approve / Reject buttons (Reject requires a reason)
 *   • HR + APPROVED          → "Activate Policy" button
 */
export function PolicyApprovalActions({
  policyId,
  policyTitle,
  status,
  isHR,
  isReviewer,
  myReview,
}: {
  policyId: string
  policyTitle: string
  status: string
  isHR: boolean
  isReviewer: boolean
  myReview: MyReview | null
}) {
  const router = useRouter()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submitReview(decision: 'APPROVE' | 'REJECT') {
    if (decision === 'REJECT' && !rejectReason.trim()) {
      setErr('Please give a reason')
      return
    }
    setSubmitting(true)
    setErr(null)
    try {
      const r = await fetch(`/api/policies/${policyId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comment: decision === 'REJECT' ? rejectReason.trim() : '' }),
      })
      const j = await r.json()
      if (!r.ok) {
        setErr(j.error ?? 'Failed')
        return
      }
      setRejecting(false)
      setRejectReason('')
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  async function activate() {
    if (!confirm('Activate this policy? An announcement will be created and every employee will be notified.')) return
    setSubmitting(true)
    setErr(null)
    try {
      const r = await fetch(`/api/policies/${policyId}/activate`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) {
        setErr(j.error ?? 'Failed')
        return
      }
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  // HR + draft → Send for Review
  if (isHR && status === 'DRAFT') {
    return (
      <>
        <div className="space-y-2">
          <Button onClick={() => setReviewOpen(true)} className="w-full" size="sm">
            <Send className="w-3.5 h-3.5 mr-1.5" /> Send for Review
          </Button>
          <p className="text-[11px] text-slate-500">
            Picks reviewers (Executives + HR). The policy stays in IN_REVIEW until everyone approves.
          </p>
        </div>
        <PolicyReviewDialog
          policyId={policyId}
          policyTitle={policyTitle}
          open={reviewOpen}
          onOpenChange={setReviewOpen}
        />
      </>
    )
  }

  // HR + approved → Activate
  if (isHR && status === 'APPROVED') {
    return (
      <div className="space-y-2">
        <Button onClick={activate} className="w-full" size="sm" disabled={submitting}>
          <Power className="w-3.5 h-3.5 mr-1.5" /> {submitting ? 'Activating…' : 'Activate Policy'}
        </Button>
        <p className="text-[11px] text-slate-500">
          Goes live to its audience + creates an announcement + notifies everyone.
        </p>
        {err && <p className="text-xs text-rose-600">{err}</p>}
      </div>
    )
  }

  // Reviewer with a pending row → Approve / Reject
  if (isReviewer && status === 'IN_REVIEW' && myReview && myReview.status === 'PENDING') {
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Your decision</p>
        {!rejecting ? (
          <div className="flex gap-2">
            <Button onClick={() => submitReview('APPROVE')} size="sm" className="flex-1" disabled={submitting}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
            </Button>
            <Button onClick={() => setRejecting(true)} size="sm" variant="outline" className="flex-1" disabled={submitting}>
              <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why are you rejecting? HR will see this."
              rows={3}
              className="w-full text-xs border border-slate-200 rounded-md p-2 focus:outline-none focus:border-rose-400"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => submitReview('REJECT')}
                size="sm"
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
                disabled={submitting || !rejectReason.trim()}
              >
                {submitting ? 'Sending…' : 'Confirm Reject'}
              </Button>
              <Button onClick={() => { setRejecting(false); setRejectReason(''); setErr(null) }} size="sm" variant="outline" disabled={submitting}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {err && <p className="text-xs text-rose-600">{err}</p>}
      </div>
    )
  }

  // Reviewer who already voted
  if (isReviewer && myReview && myReview.status !== 'PENDING') {
    return (
      <div className="text-xs text-slate-500">
        You {myReview.status === 'APPROVED' ? 'approved' : 'rejected'} this policy
        {myReview.reviewedAt ? ` on ${new Date(myReview.reviewedAt).toLocaleDateString()}` : ''}.
      </div>
    )
  }

  return null
}
