'use client'

/**
 * Overtime approvals.
 *
 * Leave used to appear here too, which meant the same request sat in two
 * inboxes with no indication of which one counted. Leave is decided in the
 * Leave module; this decides time.
 *
 * A decision removes the row for good — rejecting writes REJECTED rather than
 * "not approved yet", which is why a rejected item used to come straight back.
 * Everything decided is in the Overtime record.
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { CheckCircle2, XCircle, Inbox, Clock, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { safeFetch } from '@/lib/safe-fetch'
import { OT_RATES, formatHours } from '@/lib/overtime'

type OTItem = {
  kind: 'OT'
  id: string
  employeeId: string
  fullName: string
  department: string
  date: string
  overtimeHours: number
  hoursWorked: number | null
  ratePct: number
  amount: number | null
  note: string | null
}

const money = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 0 })

export function ApprovalsInbox(_props: { role: string }) {
  const [ot, setOT] = useState<OTItem[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<OTItem | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rates, setRates] = useState<Record<string, number>>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await safeFetch<{ ot: OTItem[] }>('/api/time/approvals')
    if (r.ok && r.data) setOT(r.data.ot ?? [])
    else {
      setOT([])
      if (!r.sessionExpired) console.warn('[approvals]', r.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function approveOT(item: OTItem) {
    setActing(item.id)
    const r = await safeFetch('/api/attendance/overtime', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attendanceLogId: item.id,
        overtimeHours: item.overtimeHours,
        approve: true,
        ratePct: rates[item.id] ?? item.ratePct,
      }),
    })
    setActing(null)
    if (!r.ok) alert(r.error ?? 'Could not approve.')
    fetchData()
  }

  async function submitReject() {
    if (!rejectTarget || !rejectReason.trim()) return
    setActing(rejectTarget.id)
    const r = await safeFetch('/api/attendance/overtime', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attendanceLogId: rejectTarget.id,
        overtimeHours: rejectTarget.overtimeHours,
        approve: false,
        note: rejectReason.trim(),
      }),
    })
    setActing(null)
    if (!r.ok) { alert(r.error ?? 'Could not reject.'); return }
    setRejectTarget(null)
    setRejectReason('')
    fetchData()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Overtime approvals</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Hours worked beyond the standard day, waiting on your decision
          </p>
        </div>
        <Link
          href="/dashboard/time/overtime"
          className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 hover:underline mt-1"
        >
          Overtime record <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="bg-white border border-slate-200">
        <div className="bg-[#005691] text-white px-4 py-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Inbox className="w-4 h-4" /> My Inbox
          </h2>
          <div className="text-[11px] text-white/90">{ot.length} item{ot.length === 1 ? '' : 's'}</div>
        </div>

        {loading ? (
          <p className="text-center text-slate-400 py-10 text-sm">Loading…</p>
        ) : ot.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">All caught up</p>
            <p className="text-xs text-slate-500 mt-1">
              No overtime waiting. Everything already decided is in the{' '}
              <Link href="/dashboard/time/overtime" className="underline">overtime record</Link>.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {ot.map((item) => (
              <li key={item.id} className="px-4 py-3 hover:bg-slate-50/30">
                <OTRow
                  item={item}
                  ratePct={rates[item.id] ?? item.ratePct}
                  onRate={(pct) => setRates((p) => ({ ...p, [item.id]: pct }))}
                  acting={acting === item.id}
                  onApprove={() => approveOT(item)}
                  onReject={() => setRejectTarget(item)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason('') } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject overtime</DialogTitle></DialogHeader>
          {rejectTarget && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                <strong>{rejectTarget.fullName}</strong> — {formatHours(rejectTarget.overtimeHours)} on{' '}
                {new Date(rejectTarget.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.
                These hours will not be paid.
              </p>
              <label className="block text-sm font-medium text-slate-700">Reason</label>
              <textarea
                autoFocus
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full text-sm rounded-md border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500"
                placeholder="The employee will see this — be specific."
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason('') }}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectReason.trim()} onClick={submitReject}>
              {acting ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OTRow({ item, ratePct, onRate, acting, onApprove, onReject }: {
  item: OTItem
  ratePct: number
  onRate: (pct: number) => void
  acting: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const date = new Date(item.date)
  // The amount from the API is priced at the stored rate; re-price live so
  // changing the dropdown shows what is actually being approved.
  const shown = item.amount != null ? Math.round((item.amount / item.ratePct) * ratePct) : null

  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 shrink-0 flex items-center justify-center">
        <Clock className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-slate-900">{item.fullName}</p>
          <Badge variant="warning">Overtime</Badge>
          <span className="text-xs text-slate-500">
            {date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            {item.hoursWorked != null && <> · {item.hoursWorked.toFixed(1)}h worked</>}
            {' · '}<strong className="text-slate-700">{formatHours(item.overtimeHours)} OT</strong>
          </span>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5">{item.department}</p>
        {item.note && <p className="text-xs text-slate-600 italic mt-1">&quot;{item.note}&quot;</p>}
        <div className="flex items-center gap-2 mt-2">
          <label className="text-[11px] text-slate-500">Rate</label>
          <select
            value={ratePct}
            onChange={(e) => onRate(Number(e.target.value))}
            disabled={acting}
            className="border border-slate-300 rounded-md px-2 py-1 text-xs bg-white"
          >
            {OT_RATES.map((o) => <option key={o.pct} value={o.pct}>{o.label}</option>)}
          </select>
          {shown != null && (
            <span className="text-[11px] text-slate-500 tabular-nums">
              ≈ PKR {money(shown)}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <Button size="sm" onClick={onApprove} disabled={acting} className="bg-slate-700 hover:bg-slate-700 text-white">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
        </Button>
        <Button size="sm" variant="outline" onClick={onReject} disabled={acting} className="text-slate-700 border-slate-100 hover:bg-slate-50">
          <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
        </Button>
      </div>
    </div>
  )
}
