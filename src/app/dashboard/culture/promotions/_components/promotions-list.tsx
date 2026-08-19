'use client'

/**
 * The promotions list, and the New Promotion dialog.
 *
 * The gate pips on each row are the point of this screen: at a glance you can
 * see that a case has evidence and sponsorship but nobody has done the
 * fairness check, which is the thing that quietly does not happen.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Loader2, FileText, PenLine, Check } from 'lucide-react'
import { GATES, gateStates, LEVEL_LABEL, needsBusinessCase } from '@/lib/promotion'

interface Row {
  id: string
  employeeName: string
  employeeCode: string | null
  fromDesignation: string | null
  newDesignation: string
  fromLevel: string | null
  toLevel: string | null
  effectiveDate: string
  status: string
  fromSalaryAmount: number | null
  newSalaryAmount: number | null
  hasLetter: boolean
  signed: boolean
  evidence: string | null
  sponsorship: string | null
  sponsorName: string | null
  fairnessNote: string | null
  businessNeed: string | null
  signatureDataUrl: string | null
}
interface Staff { id: string; fullName: string; designation: string | null; employeeCode: string | null }

const money = (n: number | null) => (n == null ? '—' : `PKR ${Math.round(n).toLocaleString('en-PK')}`)
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })

const STATUS_TONE: Record<string, string> = {
  PENDING_HR: 'bg-slate-50 text-slate-600 border-slate-200',
  PENDING_CEO: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-slate-100 text-slate-500 border-slate-200',
}
const STATUS_LABEL: Record<string, string> = {
  PENDING_HR: 'With HR', PENDING_CEO: 'With the Founder',
  APPROVED: 'Approved', REJECTED: 'Not approved',
}

export function PromotionsList({ rows, staff }: { rows: Row[]; staff: Staff[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [draft, setDraft] = useState({ employeeId: '', newDesignation: '', effectiveDate: '' })

  async function create() {
    setBusy(true); setErr(null)
    const res = await fetch('/api/culture/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(d.error ?? 'Could not start that.'); return }
    router.push(`/dashboard/culture/promotions/${d.promotion.id}`)
  }

  const picked = staff.find((s) => s.id === draft.employeeId)

  return (
    <div className="space-y-4">
      {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</p>}

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Promotions <span className="text-slate-400 font-normal">· {rows.length}</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Playbook 4.4 — evidence, sponsorship, fairness check, business need, then approval.
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New promotion
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">
            No promotions recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-50">
            {rows.map((p) => {
              const states = gateStates(p)
              const met = states.filter((s) => s.met).length
              return (
                <Link
                  key={p.id}
                  href={`/dashboard/culture/promotions/${p.id}`}
                  className="block px-4 py-3 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{p.employeeName}</span>
                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          STATUS_TONE[p.status] ?? STATUS_TONE.PENDING_HR
                        }`}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                        {p.hasLetter && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <FileText className="w-3 h-3" /> letter
                          </span>
                        )}
                        {p.signed && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700">
                            <PenLine className="w-3 h-3" /> signed
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {p.fromDesignation ?? '—'} → <span className="text-slate-700">{p.newDesignation}</span>
                        {p.toLevel && ` · ${LEVEL_LABEL(p.toLevel)}`}
                        {' · effective '}{day(p.effectiveDate)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 tabular-nums">
                      <p className="text-sm text-slate-900">
                        {money(p.fromSalaryAmount)} → {money(p.newSalaryAmount)}
                      </p>
                      {p.fromSalaryAmount && p.newSalaryAmount && p.fromSalaryAmount > 0 && (
                        <p className="text-[11px] text-slate-500">
                          {(((p.newSalaryAmount - p.fromSalaryAmount) / p.fromSalaryAmount) * 100).toFixed(1)}% increase
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Gate pips */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {GATES.map((g) => {
                      const s = states.find((x) => x.key === g.key)
                      const na = g.key === 'businessNeed' && !needsBusinessCase(p.toLevel)
                      return (
                        <span
                          key={g.key}
                          title={na ? `${g.name} — not required below L4` : g.requirement}
                          className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
                            na
                              ? 'bg-slate-50 text-slate-300 border-slate-100'
                              : s?.met
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-white text-slate-400 border-slate-200'
                          }`}
                        >
                          {s?.met && !na && <Check className="w-2.5 h-2.5" />}
                          {g.name}
                        </span>
                      )
                    })}
                    <span className="text-[10px] text-slate-400 ml-1">{met} of {GATES.length}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New promotion</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Who</span>
              <select
                value={draft.employeeId}
                onChange={(e) => setDraft({ ...draft, employeeId: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white"
              >
                <option value="">Pick an employee</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}{s.designation ? ` — ${s.designation}` : ''}
                  </option>
                ))}
              </select>
              {picked && (
                <span className="block text-[11px] text-slate-400 mt-1">
                  Currently {picked.designation ?? 'no designation on record'}. Their present
                  salary is snapshotted when you create this.
                </span>
              )}
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">New title</span>
              <input
                value={draft.newDesignation}
                onChange={(e) => setDraft({ ...draft, newDesignation: e.target.value })}
                placeholder="Senior CRO Specialist"
                className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Effective from</span>
              <input
                type="date"
                value={draft.effectiveDate}
                onChange={(e) => setDraft({ ...draft, effectiveDate: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
              />
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!draft.employeeId || busy} onClick={create}>
              {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
