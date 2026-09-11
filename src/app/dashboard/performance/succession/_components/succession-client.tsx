'use client'

/**
 * Succession plans, drawn the way Workday's Navigate Succession Plans draws
 * them: the incumbent on top, the people who could step in underneath, each
 * with how soon they would be ready. HR edits; executives read.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { READINESS, readinessLabel } from '@/lib/talent-labels'
import { getInitials } from '@/lib/utils'

export interface PlanView {
  id: string
  roleTitle: string
  critical: boolean
  note: string | null
  incumbent: { id: string; fullName: string; designation: string | null; flightRisk: string | null } | null
  candidates: {
    id: string
    readiness: string
    note: string | null
    employee: { id: string; fullName: string; designation: string | null; boxName: string | null }
  }[]
}

const inputCls =
  'w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900'

async function readError(res: Response) {
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Something went wrong.'
}

export function SuccessionClient({ plans, people, canManage }: {
  plans: PlanView[]
  people: { id: string; fullName: string; designation: string | null }[]
  canManage: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ roleTitle: '', incumbentId: '', critical: true, note: '' })

  async function call(url: string, init: RequestInit, ok: string, fail: string) {
    setBusy(true)
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      if (!res.ok) { toastError(fail, await readError(res)); return false }
      toastSuccess(ok)
      router.refresh()
      return true
    } finally { setBusy(false) }
  }

  // Picking an incumbent fills the role with their designation, the usual case.
  function pickIncumbent(id: string) {
    const p = people.find((x) => x.id === id)
    setForm((f) => ({ ...f, incumbentId: id, roleTitle: f.roleTitle || p?.designation || '' }))
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div>
          {!adding ? (
            <button type="button" onClick={() => setAdding(true)}
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white">
              New succession plan
            </button>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-900">New succession plan</p>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1">Current holder</span>
                  <select className={inputCls} value={form.incumbentId} onChange={(e) => pickIncumbent(e.target.value)}>
                    <option value="">— vacant or not yet named —</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}{p.designation ? ` — ${p.designation}` : ''}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1">Role</span>
                  <input className={inputCls} value={form.roleTitle}
                    onChange={(e) => setForm({ ...form, roleTitle: e.target.value })}
                    placeholder="e.g. Head of Web Development" />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="accent-slate-900" checked={form.critical}
                  onChange={(e) => setForm({ ...form, critical: e.target.checked })} />
                Critical role — counted on the scorecard
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 mb-1">Note <span className="text-slate-400">(optional)</span></span>
                <input className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </label>
              <div className="flex gap-2">
                <button type="button" disabled={busy || !form.roleTitle.trim()}
                  onClick={async () => {
                    if (await call('/api/succession', { method: 'POST', body: JSON.stringify(form) },
                      'Succession plan created', 'Could not create the plan')) {
                      setAdding(false)
                      setForm({ roleTitle: '', incumbentId: '', critical: true, note: '' })
                    }
                  }}
                  className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-40">
                  Create plan
                </button>
                <button type="button" onClick={() => setAdding(false)}
                  className="text-sm px-4 py-1.5 rounded-lg border border-slate-300">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {plans.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center text-sm text-slate-500">
          No succession plans yet.{canManage ? ' Start with the roles the company could least afford to lose.' : ''}
        </p>
      ) : (
        <div className="space-y-4">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} people={people} canManage={canManage} busy={busy} call={call} />
          ))}
        </div>
      )}
    </div>
  )
}

function PlanCard({ plan, people, canManage, busy, call }: {
  plan: PlanView
  people: { id: string; fullName: string; designation: string | null }[]
  canManage: boolean
  busy: boolean
  call: (url: string, init: RequestInit, ok: string, fail: string) => Promise<boolean>
}) {
  const [candidate, setCandidate] = useState({ employeeId: '', readiness: 'ONE_YEAR' })
  const taken = new Set([plan.incumbent?.id, ...plan.candidates.map((c) => c.employee.id)])
  const order = (r: string) => READINESS.findIndex((x) => x.value === r)
  const sorted = [...plan.candidates].sort((a, b) => order(a.readiness) - order(b.readiness))

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {plan.roleTitle}
            {plan.critical && (
              <span className="ml-2 text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                Critical
              </span>
            )}
          </p>
          {plan.note && <p className="text-xs text-slate-500 mt-0.5">{plan.note}</p>}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button type="button" disabled={busy}
              onClick={() => call(`/api/succession/${plan.id}`, {
                method: 'PATCH', body: JSON.stringify({ critical: !plan.critical }),
              }, plan.critical ? 'No longer marked critical' : 'Marked critical', 'Could not update the plan')}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40">
              {plan.critical ? 'Unmark critical' : 'Mark critical'}
            </button>
            <button type="button" disabled={busy}
              onClick={() => {
                if (confirm(`Delete the succession plan for ${plan.roleTitle}?`)) {
                  call(`/api/succession/${plan.id}`, { method: 'DELETE' }, 'Plan deleted', 'Could not delete the plan')
                }
              }}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40">
              Delete plan
            </button>
          </div>
        )}
      </div>

      <div className="p-4 overflow-x-auto">
        {/* Incumbent on top, successors below — the org-chart shape. */}
        <div className="flex flex-col items-center min-w-[520px]">
          <div className="w-60 rounded-lg border-t-4 border-slate-900 border-x border-b border-slate-200 px-3 py-3 text-center">
            <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Current holder</p>
            {plan.incumbent ? (
              <>
                <div className="w-10 h-10 mx-auto mt-2 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-semibold">
                  {getInitials(plan.incumbent.fullName)}
                </div>
                <p className="text-sm font-semibold text-slate-900 mt-1.5">{plan.incumbent.fullName}</p>
                <p className="text-xs text-slate-500">{plan.incumbent.designation ?? '—'}</p>
                {plan.incumbent.flightRisk && (
                  <p className={`text-[11px] mt-1 font-medium ${plan.incumbent.flightRisk === 'HIGH' ? 'text-red-800' : plan.incumbent.flightRisk === 'MEDIUM' ? 'text-amber-800' : 'text-slate-500'}`}>
                    Flight risk: {plan.incumbent.flightRisk.toLowerCase()}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500 mt-2">Vacant</p>
            )}
          </div>

          <div className="w-px h-5 bg-slate-300" />

          {sorted.length === 0 ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              No successor named.
            </p>
          ) : (
            <div className="flex gap-3 flex-wrap justify-center border-t border-slate-300 pt-4">
              {sorted.map((c) => (
                <div key={c.id} className="w-52 rounded-lg border border-slate-200 px-3 py-3 text-center">
                  <div className="w-9 h-9 mx-auto rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-semibold">
                    {getInitials(c.employee.fullName)}
                  </div>
                  <p className="text-sm font-semibold text-slate-900 mt-1.5">{c.employee.fullName}</p>
                  <p className="text-xs text-slate-500">{c.employee.designation ?? '—'}</p>
                  <p className={`text-xs mt-1 font-medium ${c.readiness === 'READY_NOW' ? 'text-emerald-800' : 'text-slate-700'}`}>
                    {readinessLabel(c.readiness)}
                  </p>
                  {c.employee.boxName && <p className="text-[11px] text-slate-500">Nine-box: {c.employee.boxName}</p>}
                  {canManage && (
                    <div className="mt-2 space-y-1.5">
                      <select value={c.readiness} disabled={busy}
                        onChange={(e) => call(`/api/succession/${plan.id}/candidates`, {
                          method: 'PATCH', body: JSON.stringify({ candidateId: c.id, readiness: e.target.value }),
                        }, 'Readiness updated', 'Could not update readiness')}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white"
                        aria-label={`Readiness of ${c.employee.fullName}`}>
                        {READINESS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <button type="button" disabled={busy}
                        onClick={() => call(`/api/succession/${plan.id}/candidates?candidateId=${c.id}`, { method: 'DELETE' },
                          `${c.employee.fullName} removed from the plan`, 'Could not remove them')}
                        className="text-[11px] text-slate-500 underline hover:text-slate-900">
                        Remove from plan
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {canManage && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2 flex-wrap items-end">
            <label className="block flex-1 min-w-[200px]">
              <span className="block text-xs font-medium text-slate-600 mb-1">Add a successor</span>
              <select className={inputCls} value={candidate.employeeId}
                onChange={(e) => setCandidate({ ...candidate, employeeId: e.target.value })}>
                <option value="">Select a person…</option>
                {people.filter((p) => !taken.has(p.id)).map((p) => (
                  <option key={p.id} value={p.id}>{p.fullName}{p.designation ? ` — ${p.designation}` : ''}</option>
                ))}
              </select>
            </label>
            <label className="block w-44">
              <span className="block text-xs font-medium text-slate-600 mb-1">Readiness</span>
              <select className={inputCls} value={candidate.readiness}
                onChange={(e) => setCandidate({ ...candidate, readiness: e.target.value })}>
                {READINESS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <button type="button" disabled={busy || !candidate.employeeId}
              onClick={async () => {
                if (await call(`/api/succession/${plan.id}/candidates`, {
                  method: 'POST', body: JSON.stringify(candidate),
                }, 'Successor added', 'Could not add the successor')) setCandidate({ employeeId: '', readiness: 'ONE_YEAR' })
              }}
              className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-40">
              Add successor
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
