'use client'

/**
 * The event planner.
 *
 * Everything lives in one form held in state and saved whole, rather than
 * field-by-field: planning an event is a sitting, not a series of decisions,
 * and a tab you half-filled should not be half-saved when you move to the next
 * one. One Save writes the plan, the costs and the roles in a single
 * transaction.
 *
 * Generate Proposal is deliberately the last thing on the last tab. It reads
 * the saved plan on the server, so it saves first — otherwise it would quietly
 * propose the version you started editing rather than the one on screen.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  ArrowLeft, Loader2, Plus, Trash2, FileText, Copy, Check, Printer, Save,
} from 'lucide-react'
import {
  EVENT_CATEGORIES, CATEGORY_LABELS, EVENT_STATUSES, STATUS_LABELS, STATUS_TONE,
  COST_CATEGORIES, COST_CATEGORY_LABELS,
  type EventCategory, type EventStatus, type CostCategory,
} from '@/lib/event-presets'

interface CostRow {
  label: string; category: string; quantity: number; unitCost: number
  actual: number | null; notes: string
}
interface RoleRow {
  role: string; headcount: number; responsibility: string; employeeId: string
}
export interface EventForm {
  id: string
  title: string; category: string; status: string
  eventDate: string; startTime: string; endTime: string
  location: string; expectedGuests: number | null; description: string
  overview: string; objectives: string
  refreshments: string; activities: string; rewards: string
  decoration: string; runOfShow: string
  requirements: string; successMetrics: string; whyItMatters: string; notes: string
  currency: string; financeOwnerId: string
  proposalBody: string | null; proposalAt: string | null; approvedByName: string
  costItems: CostRow[]; eventRoles: RoleRow[]
}
interface Staff { id: string; fullName: string; designation: string | null }

const money = (n: number, c: string) => `${c} ${Math.round(n).toLocaleString('en-PK')}`

// ── Small field primitives, so every tab looks the same ─────────────────────

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">{label}</span>
      {hint && <span className="block text-[11px] text-slate-400 mt-0.5">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  )
}

const inputCls =
  'w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none ' +
  'focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50'

function Lines({ value, onChange, rows = 5, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; rows?: number
  placeholder?: string; disabled?: boolean
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} font-normal leading-relaxed resize-y`}
    />
  )
}

// ── The planner ─────────────────────────────────────────────────────────────

export function EventDetail({ event, staff, isHR }: {
  event: EventForm; staff: Staff[]; isHR: boolean
}) {
  const router = useRouter()
  const [f, setF] = useState<EventForm>(event)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const set = <K extends keyof EventForm>(k: K, v: EventForm[K]) => {
    setF((p) => ({ ...p, [k]: v }))
    setSavedAt(null)
  }

  const budget = f.costItems.reduce((n, c) => n + (c.quantity || 0) * (c.unitCost || 0), 0)
  const spent = f.costItems.reduce((n, c) => n + (c.actual ?? 0), 0)
  const anyActual = f.costItems.some((c) => c.actual != null)
  const volunteers = f.eventRoles.reduce((n, r) => n + (r.headcount || 0), 0)

  async function save(): Promise<boolean> {
    setSaving(true); setErr(null)
    const res = await fetch(`/api/culture/events/${f.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(f),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error ?? 'Could not save.')
      return false
    }
    setSavedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    router.refresh()
    return true
  }

  /** Save, then render the proposal from what the server now holds. */
  async function generate() {
    setGenerating(true)
    if (!(await save())) { setGenerating(false); return }
    const res = await fetch(`/api/culture/events/${f.id}`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setGenerating(false)
    if (!res.ok) { setErr(d.error ?? 'Could not generate the proposal.'); return }
    setF((p) => ({
      ...p, proposalBody: d.proposalBody, proposalAt: d.proposalAt, status: d.status,
    }))
    router.refresh()
  }

  async function remove() {
    if (!confirm(`Delete "${f.title}"? This removes its plan, costs and roles.`)) return
    setDeleting(true)
    const res = await fetch(`/api/culture/events/${f.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) { setErr('Could not delete.'); return }
    router.push('/dashboard/culture/events')
  }

  function copyProposal() {
    if (!f.proposalBody) return
    navigator.clipboard.writeText(f.proposalBody)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  function printProposal() {
    if (!f.proposalBody) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(
      `<html><head><title>${f.title} — Proposal</title>`
      + '<style>@page{size:A4;margin:18mm}'
      + 'body{font-family:"Courier New",monospace;font-size:10.5pt;line-height:1.5;white-space:pre-wrap;color:#111}'
      + '</style></head><body></body></html>',
    )
    w.document.body.textContent = f.proposalBody
    w.document.close()
    w.focus()
    w.print()
  }

  const ro = !isHR

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow-md">
        <Link
          href="/dashboard/culture/events"
          className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-xs mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All events
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{f.title || 'Untitled event'}</h1>
            <p className="text-white/70 text-sm mt-1">
              {CATEGORY_LABELS[f.category as EventCategory] ?? f.category}
              {f.eventDate && ` · ${new Date(`${f.eventDate}T00:00:00Z`).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
              })}`}
              {f.location && ` · ${f.location}`}
            </p>
          </div>
          <div className="text-right">
            <span className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border ${
              STATUS_TONE[f.status as EventStatus] ?? STATUS_TONE.PLANNING
            }`}>
              {STATUS_LABELS[f.status as EventStatus] ?? f.status}
            </span>
            <p className="text-white/80 text-sm mt-2 tabular-nums">
              {budget ? money(budget, f.currency) : 'No budget yet'}
            </p>
            {anyActual && (
              <p className="text-white/55 text-[11px] tabular-nums">spent {money(spent, f.currency)}</p>
            )}
          </div>
        </div>
      </div>

      {err && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{err}</p>
      )}

      <Tabs defaultValue="event" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="event">Event</TabsTrigger>
          <TabsTrigger value="included">What&apos;s included</TabsTrigger>
          <TabsTrigger value="decor">Decoration &amp; run of show</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="money">Financials</TabsTrigger>
          <TabsTrigger value="wrap">Requirements &amp; outcome</TabsTrigger>
          <TabsTrigger value="proposal">Proposal</TabsTrigger>
        </TabsList>

        {/* ── Event ───────────────────────────────────────────────── */}
        <TabsContent value="event">
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Title">
                <input className={inputCls} disabled={ro} value={f.title}
                  onChange={(e) => set('title', e.target.value)} />
              </Field>
              <Field label="Kind of event">
                <select className={inputCls} disabled={ro} value={f.category}
                  onChange={(e) => set('category', e.target.value)}>
                  {EVENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Date">
                <input type="date" className={inputCls} disabled={ro} value={f.eventDate}
                  onChange={(e) => set('eventDate', e.target.value)} />
              </Field>
              <Field label="Status">
                <select className={inputCls} disabled={ro} value={f.status}
                  onChange={(e) => set('status', e.target.value)}>
                  {EVENT_STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Starts" hint="As it reads on the invite — 15:00">
                <input className={inputCls} disabled={ro} value={f.startTime} placeholder="15:00"
                  onChange={(e) => set('startTime', e.target.value)} />
              </Field>
              <Field label="Ends">
                <input className={inputCls} disabled={ro} value={f.endTime} placeholder="17:00"
                  onChange={(e) => set('endTime', e.target.value)} />
              </Field>
              <Field label="Venue" hint="Blank means the office">
                <input className={inputCls} disabled={ro} value={f.location}
                  onChange={(e) => set('location', e.target.value)} />
              </Field>
              <Field label="Expected turnout" hint="Drives quantities and the budget">
                <input type="number" min={0} className={inputCls} disabled={ro}
                  value={f.expectedGuests ?? ''}
                  onChange={(e) => set('expectedGuests', e.target.value === '' ? null : Number(e.target.value))} />
              </Field>
            </div>
            <div className="mt-4 space-y-4">
              <Field label="Overview" hint="The opening paragraph of the proposal">
                <Lines value={f.overview} disabled={ro} rows={4}
                  onChange={(v) => set('overview', v)} />
              </Field>
              <Field label="Objectives" hint="One per line">
                <Lines value={f.objectives} disabled={ro}
                  onChange={(v) => set('objectives', v)} />
              </Field>
              <Field label="Why this matters" hint="The closing argument to the CEO">
                <Lines value={f.whyItMatters} disabled={ro} rows={3}
                  onChange={(v) => set('whyItMatters', v)} />
              </Field>
            </div>
          </Card>
        </TabsContent>

        {/* ── What's included ─────────────────────────────────────── */}
        <TabsContent value="included">
          <Card>
            <div className="space-y-4">
              <Field label="Refreshments" hint="One per line">
                <Lines value={f.refreshments} disabled={ro} onChange={(v) => set('refreshments', v)} />
              </Field>
              <Field label="Games and activities" hint="One per line">
                <Lines value={f.activities} disabled={ro} onChange={(v) => set('activities', v)} />
              </Field>
              <Field label="Rewards" hint="Prizes, giveaways, trophies — one per line">
                <Lines value={f.rewards} disabled={ro} rows={4} onChange={(v) => set('rewards', v)} />
              </Field>
            </div>
          </Card>
        </TabsContent>

        {/* ── Decoration & run of show ────────────────────────────── */}
        <TabsContent value="decor">
          <Card>
            <div className="space-y-4">
              <Field label="Decoration and set-up" hint="One per line">
                <Lines value={f.decoration} disabled={ro} rows={6} onChange={(v) => set('decoration', v)} />
              </Field>
              <Field
                label="Run of show"
                hint="One per line, as: 0:00–0:10 | Welcome and kickoff"
              >
                <Lines value={f.runOfShow} disabled={ro} rows={8}
                  onChange={(v) => set('runOfShow', v)} />
              </Field>
            </div>
          </Card>
        </TabsContent>

        {/* ── Roles ──────────────────────────────────────────────── */}
        <TabsContent value="roles">
          <Card
            title="Who is doing what"
            subtitle={volunteers ? `${volunteers} people across ${f.eventRoles.length} roles` : undefined}
            action={!ro && (
              <Button size="sm" variant="outline" onClick={() => set('eventRoles', [
                ...f.eventRoles, { role: '', headcount: 1, responsibility: '', employeeId: '' },
              ])}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add role
              </Button>
            )}
          >
            {f.eventRoles.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">
                No roles yet. Nobody is named on the proposal until there are.
              </p>
            ) : (
              <div className="space-y-2">
                {f.eventRoles.map((r, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start">
                    <input
                      className={`${inputCls} col-span-12 sm:col-span-3`} disabled={ro}
                      placeholder="Role — e.g. Refreshments volunteer" value={r.role}
                      onChange={(e) => set('eventRoles', f.eventRoles.map((x, j) =>
                        j === i ? { ...x, role: e.target.value } : x))}
                    />
                    <input
                      type="number" min={1}
                      className={`${inputCls} col-span-3 sm:col-span-1 tabular-nums`} disabled={ro}
                      value={r.headcount}
                      onChange={(e) => set('eventRoles', f.eventRoles.map((x, j) =>
                        j === i ? { ...x, headcount: Number(e.target.value) || 1 } : x))}
                    />
                    <select
                      className={`${inputCls} col-span-9 sm:col-span-3`} disabled={ro}
                      value={r.employeeId}
                      onChange={(e) => set('eventRoles', f.eventRoles.map((x, j) =>
                        j === i ? { ...x, employeeId: e.target.value } : x))}
                    >
                      <option value="">Nobody named yet</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                    </select>
                    <input
                      className={`${inputCls} col-span-11 sm:col-span-4`} disabled={ro}
                      placeholder="What they are responsible for" value={r.responsibility}
                      onChange={(e) => set('eventRoles', f.eventRoles.map((x, j) =>
                        j === i ? { ...x, responsibility: e.target.value } : x))}
                    />
                    {!ro && (
                      <button
                        type="button" aria-label="Remove role"
                        className="col-span-1 h-[38px] flex items-center justify-center text-slate-400 hover:text-red-600"
                        onClick={() => set('eventRoles', f.eventRoles.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Financials ─────────────────────────────────────────── */}
        <TabsContent value="money">
          <Card
            title="Budget"
            subtitle="Estimated is what goes to the CEO. Fill Actual in after the event to close it out."
            action={!ro && (
              <Button size="sm" variant="outline" onClick={() => set('costItems', [
                ...f.costItems,
                { label: '', category: 'OTHER', quantity: 1, unitCost: 0, actual: null, notes: '' },
              ])}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add line
              </Button>
            )}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Field label="Currency">
                <input className={inputCls} disabled={ro} value={f.currency}
                  onChange={(e) => set('currency', e.target.value.toUpperCase())} />
              </Field>
              <Field label="Who handles the money" hint="Buys on the day, keeps receipts, reconciles after">
                <select className={inputCls} disabled={ro} value={f.financeOwnerId}
                  onChange={(e) => set('financeOwnerId', e.target.value)}>
                  <option value="">Nobody named yet</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}{s.designation ? ` — ${s.designation}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {f.costItems.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">
                No costs yet — the proposal will go out without a budget.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <th className="text-left font-semibold py-2 pr-2">Line</th>
                      <th className="text-left font-semibold py-2 px-2 w-36">Category</th>
                      <th className="text-right font-semibold py-2 px-2 w-20">Qty</th>
                      <th className="text-right font-semibold py-2 px-2 w-28">Unit</th>
                      <th className="text-right font-semibold py-2 px-2 w-28">Estimated</th>
                      <th className="text-right font-semibold py-2 px-2 w-28">Actual</th>
                      {!ro && <th className="w-8" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {f.costItems.map((c, i) => {
                      const upd = (patch: Partial<CostRow>) =>
                        set('costItems', f.costItems.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                      return (
                        <tr key={i}>
                          <td className="py-1.5 pr-2">
                            <input className={inputCls} disabled={ro} value={c.label}
                              placeholder="What is being bought"
                              onChange={(e) => upd({ label: e.target.value })} />
                          </td>
                          <td className="py-1.5 px-2">
                            <select className={inputCls} disabled={ro} value={c.category}
                              onChange={(e) => upd({ category: e.target.value })}>
                              {COST_CATEGORIES.map((k) => (
                                <option key={k} value={k}>{COST_CATEGORY_LABELS[k as CostCategory]}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="number" min={0} step="any" disabled={ro}
                              className={`${inputCls} text-right tabular-nums`} value={c.quantity}
                              onChange={(e) => upd({ quantity: Number(e.target.value) || 0 })} />
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="number" min={0} step="any" disabled={ro}
                              className={`${inputCls} text-right tabular-nums`} value={c.unitCost}
                              onChange={(e) => upd({ unitCost: Number(e.target.value) || 0 })} />
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-slate-700">
                            {money((c.quantity || 0) * (c.unitCost || 0), f.currency)}
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="number" min={0} step="any" disabled={ro} placeholder="—"
                              className={`${inputCls} text-right tabular-nums`}
                              value={c.actual ?? ''}
                              onChange={(e) => upd({ actual: e.target.value === '' ? null : Number(e.target.value) })} />
                          </td>
                          {!ro && (
                            <td className="py-1.5">
                              <button
                                type="button" aria-label="Remove line"
                                className="text-slate-400 hover:text-red-600"
                                onClick={() => set('costItems', f.costItems.filter((_, j) => j !== i))}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
                      <td className="py-2.5" colSpan={4}>Total</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{money(budget, f.currency)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">
                        {anyActual ? money(spent, f.currency) : <span className="text-slate-300">—</span>}
                      </td>
                      {!ro && <td />}
                    </tr>
                    {anyActual && (
                      <tr className="text-[11px]">
                        <td className="pb-2 text-slate-500" colSpan={4}>
                          {spent > budget ? 'Over budget by' : 'Under budget by'}
                        </td>
                        <td className="pb-2 px-2" />
                        <td className={`pb-2 px-2 text-right tabular-nums font-semibold ${
                          spent > budget ? 'text-red-600' : 'text-emerald-700'
                        }`}>
                          {money(Math.abs(spent - budget), f.currency)}
                        </td>
                        {!ro && <td />}
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Requirements & outcome ─────────────────────────────── */}
        <TabsContent value="wrap">
          <Card>
            <div className="space-y-4">
              <Field label="What needs arranging" hint="One per line — the to-do list before the day">
                <Lines value={f.requirements} disabled={ro} rows={6}
                  onChange={(v) => set('requirements', v)} />
              </Field>
              <Field label="Success metrics" hint="How we will know it worked">
                <Lines value={f.successMetrics} disabled={ro} onChange={(v) => set('successMetrics', v)} />
              </Field>
              <Field label="Notes" hint="Anything else the proposal should carry">
                <Lines value={f.notes} disabled={ro} rows={3} onChange={(v) => set('notes', v)} />
              </Field>
              <Field label="Approved by" hint="Filled in once the CEO or co-founder signs off">
                <input className={inputCls} disabled={ro} value={f.approvedByName}
                  onChange={(e) => set('approvedByName', e.target.value)} />
              </Field>
            </div>
          </Card>
        </TabsContent>

        {/* ── Proposal ───────────────────────────────────────────── */}
        <TabsContent value="proposal">
          <Card
            title="Proposal"
            subtitle="Built from everything on the other tabs. Regenerate after any change."
            action={
              <div className="flex items-center gap-2 flex-wrap">
                {f.proposalBody && (
                  <>
                    <Button size="sm" variant="outline" onClick={copyProposal}>
                      {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={printProposal}>
                      <Printer className="w-3.5 h-3.5 mr-1.5" /> Print / PDF
                    </Button>
                  </>
                )}
                {!ro && (
                  <Button size="sm" onClick={generate} disabled={generating || saving}>
                    {generating
                      ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      : <FileText className="w-3.5 h-3.5 mr-1.5" />}
                    {f.proposalBody ? 'Regenerate' : 'Generate proposal'}
                  </Button>
                )}
              </div>
            }
          >
            {f.proposalAt && (
              <p className="text-[11px] text-slate-500 mb-3">
                Generated {new Date(f.proposalAt).toLocaleString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
            {f.proposalBody ? (
              <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-4 overflow-x-auto">
                {f.proposalBody}
              </pre>
            ) : (
              <div className="text-center py-10">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">
                  Nothing generated yet. Fill in the tabs, then generate — it pulls the
                  overview, decoration, run of show, roles and the budget into one
                  document for the CEO and co-founder.
                </p>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Sticky save bar ───────────────────────────────────────── */}
      {!ro && (
        <div className="sticky bottom-0 -mx-1 px-1 pb-1">
          <div className="flex items-center justify-between gap-3 flex-wrap bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
            <p className="text-[11px] text-slate-500">
              {savedAt ? `Saved at ${savedAt}` : 'Unsaved changes'}
              {volunteers > 0 && ` · ${volunteers} volunteers`}
              {budget > 0 && ` · ${money(budget, f.currency)} budget`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm" variant="outline" onClick={remove} disabled={deleting}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                {deleting
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                Delete
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <Save className="w-3.5 h-3.5 mr-1.5" />}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Card({ title, subtitle, action, children }: {
  title?: string; subtitle?: string
  action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl">
      {(title || action) && (
        <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}
