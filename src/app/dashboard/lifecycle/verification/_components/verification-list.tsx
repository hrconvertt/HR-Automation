'use client'

/**
 * Who has been verified, who has not, and what is outstanding.
 *
 * The "what to ask first" panel sits at the top rather than buried in a check,
 * because it is the thing you need before opening one — and the reason
 * verifications stall is almost always that nobody collected it.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Plus, Loader2, Search, ChevronDown, ShieldCheck, Mail, AlertTriangle, Check,
} from 'lucide-react'
import {
  STATUS_LABELS, STATUS_TONE, OUTCOME_LABELS, WHAT_TO_ASK,
  type VerificationStatus, type Outcome,
} from '@/lib/background-verification'

interface Employee {
  id: string; fullName: string; employeeCode: string
  designation: string | null; department: string | null
  employeeType: string | null; joiningDate: string | null
}
interface Check {
  id: string; employeeId: string; employerName: string
  status: string; outcome: string | null
  assignedTo: string | null; emailCount: number; consented: boolean
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }) : '—'

export function VerificationList({ employees, checks }: {
  employees: Employee[]; checks: Check[]
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'all' | 'unverified'>('all')
  const [askOpen, setAskOpen] = useState(false)
  const [newFor, setNewFor] = useState<Employee | null>(null)
  const [draft, setDraft] = useState({ employerName: '', contactName: '', contactEmail: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const byEmployee = useMemo(() => {
    const m = new Map<string, Check[]>()
    for (const c of checks) {
      if (!m.has(c.employeeId)) m.set(c.employeeId, [])
      m.get(c.employeeId)!.push(c)
    }
    return m
  }, [checks])

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return employees.filter((e) => {
      if (needle
        && !e.fullName.toLowerCase().includes(needle)
        && !e.employeeCode.toLowerCase().includes(needle)) return false
      if (only === 'unverified') {
        const cs = byEmployee.get(e.id) ?? []
        if (cs.length > 0 && cs.every((c) => c.status === 'COMPLETED')) return false
      }
      return true
    })
  }, [employees, q, only, byEmployee])

  async function create() {
    if (!newFor) return
    setBusy(true); setErr(null)
    const res = await fetch('/api/verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: newFor.id, ...draft }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(d.error ?? 'Could not open that check.'); return }
    router.push(`/dashboard/lifecycle/verification/${d.verification.id}`)
  }

  const open = checks.filter((c) => c.status !== 'COMPLETED').length
  const flagged = checks.filter((c) => c.outcome === 'MAJOR_DISCREPANCY').length

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Background Verification</h1>
            <p className="text-white/85 text-sm mt-1">
              What the candidate told us, against what their previous employer says.
              {open > 0 && ` ${open} open`}
              {flagged > 0 && ` · ${flagged} flagged`}
            </p>
          </div>
        </div>
      </div>

      {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</p>}

      {/* ── What to ask first ────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setAskOpen(!askOpen)}
          className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/60"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              What to ask the employee before you start
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Three of these block everything else. Collect them in one email rather than four.
            </p>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${askOpen ? 'rotate-180' : ''}`} />
        </button>
        {askOpen && (
          <div className="border-t border-slate-100 divide-y divide-slate-50">
            {WHAT_TO_ASK.map((item) => (
              <div key={item.key} className="px-4 py-3 flex items-start gap-3">
                <span className={`mt-0.5 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 ${
                  item.blocking
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}>
                  {item.blocking ? 'Required' : 'Ask'}
                </span>
                <div>
                  <p className="text-sm text-slate-900">{item.ask}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{item.why}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── People ───────────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-900">{view.length}</span> employees ·{' '}
            {checks.length} checks on record
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name or code"
                className="pl-8 pr-3 py-1.5 rounded-md border border-slate-300 text-sm w-48"
              />
            </div>
            <div className="inline-flex rounded-md border border-slate-300 overflow-hidden">
              {(['all', 'unverified'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOnly(k)}
                  className={`px-2.5 py-1.5 text-xs ${
                    only === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {k === 'all' ? 'Everyone' : 'Not yet closed'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-50">
          {view.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">Nobody matches that.</p>
          ) : view.map((e) => {
            const cs = byEmployee.get(e.id) ?? []
            return (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{e.fullName}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      <span className="font-mono">{e.employeeCode}</span>
                      {e.designation && ` · ${e.designation}`}
                      {e.department && ` · ${e.department}`}
                      {' · joined '}{day(e.joiningDate)}
                    </p>
                  </div>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => { setNewFor(e); setDraft({ employerName: '', contactName: '', contactEmail: '' }) }}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Verify an employer
                  </Button>
                </div>

                {cs.length === 0 ? (
                  <p className="text-[11px] text-slate-400 mt-2">No checks opened yet.</p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {cs.map((c) => (
                      <Link
                        key={c.id}
                        href={`/dashboard/lifecycle/verification/${c.id}`}
                        className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50/70"
                      >
                        <span className="text-sm text-slate-800 flex items-center gap-2 flex-wrap">
                          {c.employerName}
                          <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                            STATUS_TONE[c.status as VerificationStatus] ?? STATUS_TONE.NOT_STARTED
                          }`}>
                            {STATUS_LABELS[c.status as VerificationStatus] ?? c.status}
                          </span>
                          {c.consented && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700">
                              <Check className="w-2.5 h-2.5" /> consent
                            </span>
                          )}
                          {c.outcome === 'MAJOR_DISCREPANCY' && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-red-700">
                              <AlertTriangle className="w-2.5 h-2.5" /> major discrepancy
                            </span>
                          )}
                          {c.outcome && c.outcome !== 'MAJOR_DISCREPANCY' && (
                            <span className="text-[10px] text-slate-500">
                              {OUTCOME_LABELS[c.outcome as Outcome]?.label ?? c.outcome}
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-400 flex items-center gap-2">
                          {c.assignedTo && <span>{c.assignedTo}</span>}
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {c.emailCount}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <Dialog open={!!newFor} onOpenChange={(o) => !o && setNewFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verify an employer{newFor ? ` — ${newFor.fullName}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                Previous employer
              </span>
              <input
                value={draft.employerName}
                onChange={(e) => setDraft({ ...draft, employerName: e.target.value })}
                placeholder="Legal company name"
                className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                Referee
              </span>
              <span className="block text-[11px] text-slate-400 mt-0.5">
                A former direct manager where possible — an HR inbox confirms dates and little else.
              </span>
              <input
                value={draft.contactName}
                onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
                placeholder="Name and designation"
                className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                Their work email
              </span>
              <input
                type="email"
                value={draft.contactEmail}
                onChange={(e) => setDraft({ ...draft, contactEmail: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
              />
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewFor(null)}>Cancel</Button>
            <Button disabled={!draft.employerName.trim() || busy} onClick={create}>
              {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Open the check
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
