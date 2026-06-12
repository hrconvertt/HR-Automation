'use client'

/**
 * CEO Review Panel — surfaced on the Executive payroll page when a run is
 * awaiting CEO sign-off. Approve advances to PENDING_HR_FINAL; Send Back
 * returns to DRAFT with a reason.
 */

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Undo2, FileText } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { safeFetch } from '@/lib/safe-fetch'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface Props {
  runId: string
  month: number
  year: number
  totalNet: number
  totalGross: number
}

export function CeoReviewPanel({ runId, month, year, totalNet, totalGross }: Props) {
  const [busy, setBusy] = useState(false)
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [reason, setReason] = useState('')

  async function approve() {
    if (!confirm(`Approve ${MONTHS[month - 1]} ${year} payroll? It will return to HR for final review.`)) return
    setBusy(true)
    const r = await safeFetch(`/api/payroll/${runId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CEO_APPROVE' }),
    })
    setBusy(false)
    if (!r.ok) { alert(r.error ?? 'Approve failed'); return }
    window.location.reload()
  }

  async function sendBack() {
    const trimmed = reason.trim()
    if (trimmed.length < 3) { alert('A reason is required.'); return }
    setBusy(true)
    const r = await safeFetch(`/api/payroll/${runId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'SEND_BACK', reason: trimmed }),
    })
    setBusy(false)
    if (!r.ok) { alert(r.error ?? 'Send back failed'); return }
    window.location.reload()
  }

  return (
    <Card className="rounded-2xl border-amber-200 bg-amber-50">
      <div className="p-5 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-700" />
            <h3 className="text-base font-bold text-amber-900">
              Payroll awaiting your review — {MONTHS[month - 1]} {year}
            </h3>
          </div>
          <p className="text-sm text-amber-800 mt-1">
            Total Net: <span className="font-semibold">{formatCurrency(totalNet)}</span>
            {' · '}Gross: <span className="font-semibold">{formatCurrency(totalGross)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/dashboard/payroll/payslip?run=${runId}`}
            className="text-sm text-amber-900 underline hover:no-underline"
          >
            View detail →
          </a>
          <Button
            onClick={() => setSendBackOpen(true)}
            disabled={busy}
            variant="outline"
            className="text-amber-800 border-amber-300 hover:bg-amber-100"
          >
            <Undo2 className="w-4 h-4 mr-1.5" /> Send Back
          </Button>
          <Button
            onClick={approve}
            disabled={busy}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve
          </Button>
        </div>
      </div>

      {sendBackOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSendBackOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">Send Back to HR</h3>
            <p className="text-sm text-slate-600">HR will see this reason and can revise the run.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What needs to change?"
              className="w-full min-h-[100px] px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setSendBackOpen(false); setReason('') }}>Cancel</Button>
              <Button onClick={sendBack} className="bg-amber-600 hover:bg-amber-700 text-white">
                <Undo2 className="w-4 h-4 mr-1.5" /> Send Back
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
