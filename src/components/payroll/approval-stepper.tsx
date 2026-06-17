'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  PAYROLL_STAGES,
  TRANSITIONS,
  stageLabel,
  type PayrollAction,
} from '@/lib/payroll-workflow'
import { Check, Clock, X, ChevronRight, History, AlertTriangle } from 'lucide-react'

type Approval = {
  id: string
  fromStatus: string
  toStatus: string
  action: string
  actorName: string | null
  actorRole: string | null
  comment: string | null
  createdAt: string
}

type Props = {
  runId: string
  currentStatus: string
  userRoles: string[]      // current user's roles
  onChanged?: () => void   // parent refresh
}

export default function PayrollApprovalStepper({
  runId,
  currentStatus,
  userRoles,
  onChanged,
}: Props) {
  const router = useRouter()
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirmingReject, setConfirmingReject] = useState(false)
  const [rejectComment, setRejectComment] = useState('')

  useEffect(() => {
    fetch(`/api/payroll/${runId}/approvals`)
      .then((r) => r.json())
      .then((d) => setApprovals(d.approvals ?? []))
      .catch(() => {})
  }, [runId])

  async function performAction(action: PayrollAction, comment?: string) {
    setBusy(action)
    setError('')
    const res = await fetch(`/api/payroll/${runId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, comment }),
    })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) {
      setError(data.error ?? 'Action failed')
      return
    }
    setConfirmingReject(false)
    setRejectComment('')
    // Refresh history + parent
    fetch(`/api/payroll/${runId}/approvals`)
      .then((r) => r.json())
      .then((d) => setApprovals(d.approvals ?? []))
    onChanged?.()
    router.refresh()
  }

  const currentIdx = PAYROLL_STAGES.indexOf(currentStatus as (typeof PAYROLL_STAGES)[number])
  const isRejected = currentStatus === 'REJECTED'

  // Actions available to *this user* right now
  const availableTransitions = TRANSITIONS.filter(
    (t) => t.from === currentStatus && t.allowedRoles.some((r) => userRoles.includes(r)),
  )
  const canReject =
    !['DRAFT', 'LOCKED', 'DISBURSED', 'CLOSED', 'REJECTED'].includes(currentStatus) &&
    userRoles.some((r) => ['HR_ADMIN', 'EXECUTIVE', 'FINANCE'].includes(r))
  const canRecall =
    userRoles.includes('HR_ADMIN') &&
    !['LOCKED', 'DISBURSED', 'CLOSED', 'DRAFT', 'REJECTED'].includes(currentStatus)

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5 space-y-4">
        {/* ── Stepper bar ────────────────────────────────────────────────── */}
        {isRejected ? (
          <div className="flex items-center gap-2 text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium">Rejected — sent back to draft for re-calculation.</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {PAYROLL_STAGES.map((stage, idx) => {
              const done = idx < currentIdx
              const here = idx === currentIdx
              return (
                <div key={stage} className="flex items-center gap-1 shrink-0">
                  <div
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${
                      done
                        ? 'bg-slate-50 text-slate-700 border-slate-100'
                        : here
                        ? 'bg-slate-700 text-white border-slate-700'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                  >
                    {done ? <Check className="w-3 h-3" /> : here ? <Clock className="w-3 h-3" /> : null}
                    {stageLabel(stage)}
                  </div>
                  {idx < PAYROLL_STAGES.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Action buttons ─────────────────────────────────────────────── */}
        {!confirmingReject && (
          <div className="flex flex-wrap gap-2 items-center">
            {availableTransitions.length === 0 && !canReject && !canRecall && (
              <p className="text-xs text-slate-500">
                {currentStatus === 'CLOSED'
                  ? 'Period closed — read-only.'
                  : 'No actions available to you at this stage.'}
              </p>
            )}
            {availableTransitions.map((t) => (
              <div key={t.action} className="flex flex-col">
                <Button
                  size="sm"
                  onClick={() => performAction(t.action)}
                  disabled={busy !== null}
                  variant={t.action === 'APPROVE' ? 'success' : 'default'}
                >
                  {busy === t.action ? 'Working…' : t.label}
                </Button>
                <p className="text-[10px] text-slate-400 mt-0.5 max-w-[180px]">{t.description}</p>
              </div>
            ))}
            {canRecall && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => performAction('RECALL')}
                disabled={busy !== null}
              >
                Recall One Stage
              </Button>
            )}
            {canReject && (
              <Button
                size="sm"
                variant="outline"
                className="text-slate-700 border-slate-100 hover:bg-slate-50"
                onClick={() => setConfirmingReject(true)}
                disabled={busy !== null}
              >
                <X className="w-3.5 h-3.5 mr-1" /> Reject
              </Button>
            )}
          </div>
        )}

        {confirmingReject && (
          <div className="border border-slate-100 bg-slate-50 rounded-lg p-3 space-y-2">
            <p className="text-sm text-slate-900 font-medium">Reject this payroll run</p>
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="Reason for rejection (required)…"
              className="w-full text-sm rounded border border-slate-100 px-2 py-1"
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => performAction('REJECT', rejectComment)}
                disabled={busy !== null || !rejectComment.trim()}
                className="bg-slate-700 hover:bg-slate-700 text-white"
              >
                Confirm Reject
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmingReject(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded px-2 py-1">
            {error}
          </p>
        )}

        {/* ── History toggle ─────────────────────────────────────────────── */}
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
          >
            <History className="w-3.5 h-3.5" />
            {showHistory ? 'Hide' : 'Show'} approval history ({approvals.length})
          </button>
        </div>
        {showHistory && (
          <div className="border-t border-slate-100 pt-3 space-y-2">
            {approvals.length === 0 ? (
              <p className="text-xs text-slate-400">No approval events yet.</p>
            ) : (
              approvals.map((a) => (
                <div key={a.id} className="text-xs flex gap-3 items-start">
                  <span className="text-slate-400 shrink-0 w-32">
                    {new Date(a.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <div className="flex-1">
                    <p className="text-slate-700">
                      <strong>{a.actorName ?? 'System'}</strong>
                      <span className="text-slate-500"> ({a.actorRole}) </span>
                      <span className="text-slate-400">·</span>{' '}
                      <span className="font-medium">{a.action}</span>
                      <span className="text-slate-400"> → </span>
                      <span className="text-slate-700">{stageLabel(a.toStatus)}</span>
                    </p>
                    {a.comment && <p className="text-slate-500 italic mt-0.5">"{a.comment}"</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
