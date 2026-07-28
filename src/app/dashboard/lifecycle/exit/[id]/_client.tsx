'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  DoorOpen, Check, ShieldCheck, Banknote, FileSignature,
  MessageSquare, ClipboardList, Trash2, RefreshCw, ExternalLink,
} from 'lucide-react'

interface Clearance {
  id: string
  employeeId: string
  employee: {
    id: string
    fullName: string
    employeeCode: string
    designation: string
    status: string
    joiningDate: string
    exitDate: string | null
    department: { name: string } | null
    reportingManager: { id: string; fullName: string } | null
    assets: { id: string; asset: { name: string; type: string; serialNo: string | null } }[]
  }
  initiatedAt: string
  lastWorkingDay: string | null
  itCleared: boolean; itClearedAt: string | null
  financeCleared: boolean; financeClearedAt: string | null
  adminCleared: boolean; adminClearedAt: string | null
  hrCleared: boolean; hrClearedAt: string | null
  finalSettlementAmount: number | null
  duesCleared: boolean
  settlementNotes: string | null
  prorataSalary: number | null
  leaveEncashment: number | null
  outstandingDeductions: number | null
  employeeAcknowledged: boolean
  employeeSignedAt: string | null
  hrCertifiedAt: string | null
  interviewReason: string | null
  interviewNextRole: string | null
  interviewMgrSupport: number | null
  interviewWorkEnv: number | null
  interviewCompensation: number | null
  interviewGrowth: number | null
  interviewWorkLife: number | null
  interviewImprovement: string | null
  interviewRecommendScore: number | null
  interviewCompletedAt: string | null
  handoverCurrentProjects: string | null
  handoverPendingTasks: string | null
  handoverKeyContacts: string | null
  handoverDocLocations: string | null
  handoverPasswords: string | null
  handoverSignedAt: string | null
  handoverSignedByMgr: boolean
  status: string
  triggerType: string
  terminationId: string | null
  completedAt: string | null
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '—'
const fmtMoney = (n: number | null) =>
  n == null ? '—' : `PKR ${Math.round(n).toLocaleString('en-PK')}`

const DEPTS = [
  { key: 'IT', label: 'IT — access revocation & equipment', cleared: (c: Clearance) => c.itCleared, at: (c: Clearance) => c.itClearedAt },
  { key: 'FINANCE', label: 'Finance — advances, loans & expense dues', cleared: (c: Clearance) => c.financeCleared, at: (c: Clearance) => c.financeClearedAt },
  { key: 'ADMIN', label: 'Admin — keys, cards & office property', cleared: (c: Clearance) => c.adminCleared, at: (c: Clearance) => c.adminClearedAt },
  { key: 'HR', label: 'HR — documents & records', cleared: (c: Clearance) => c.hrCleared, at: (c: Clearance) => c.hrClearedAt },
] as const

export default function ExitClearanceDetailClient({ initial, canAct, isSelf }: {
  initial: Clearance
  canAct: boolean
  isSelf: boolean
}) {
  const router = useRouter()
  const [c, setC] = useState<Clearance>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isDone = c.status === 'COMPLETED'
  const agingDays = Math.floor((Date.now() - new Date(c.initiatedAt).getTime()) / 86400000)

  const deptsDone = DEPTS.every((d) => d.cleared(c))
  const gates: { label: string; done: boolean }[] = [
    { label: 'Departmental clearance', done: deptsDone },
    { label: 'Final settlement', done: c.duesCleared },
    { label: 'Employee acknowledgment', done: c.employeeAcknowledged },
    { label: 'HR certification', done: !!c.hrCertifiedAt },
    { label: 'Exit interview', done: !!c.interviewCompletedAt },
    { label: 'Handover (signed + manager confirmed)', done: !!c.handoverSignedAt && c.handoverSignedByMgr },
  ]
  const gatesDone = gates.filter((g) => g.done).length
  const pct = Math.round((gatesDone / gates.length) * 100)

  async function act(payload: Record<string, unknown>) {
    setBusy(true); setError('')
    const res = await fetch(`/api/exit-clearance/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Action failed'); return false }
    if (data.clearance) setC((prev) => ({ ...prev, ...data.clearance }))
    router.refresh()
    return true
  }

  async function cancelClearance() {
    const reason = confirm('Cancel and delete this exit clearance record? This cannot be undone.')
    if (!reason) return
    setBusy(true); setError('')
    const res = await fetch(`/api/exit-clearance/${c.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to cancel')
      return
    }
    router.push('/dashboard/lifecycle/exit')
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <DoorOpen className="w-6 h-6 text-slate-700" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Exit Clearance — {c.employee.fullName}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {c.employee.employeeCode} · {c.employee.designation}
              {c.employee.department?.name ? ` · ${c.employee.department.name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {canAct && !isDone && (
            <Button variant="outline" disabled={busy} onClick={cancelClearance} title="Delete this clearance record entirely" className="text-slate-700">
              <Trash2 className="w-4 h-4 mr-1.5" /> Cancel Clearance
            </Button>
          )}
          <Link href="/dashboard/lifecycle/exit"><Button variant="outline">Back</Button></Link>
        </div>
      </div>

      {/* Progress header */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{gatesDone}<span className="text-sm text-slate-400 font-semibold"> / {gates.length}</span></p>
                <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">sections cleared</p>
              </div>
              <div className="w-44">
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-700 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className={`px-2 py-0.5 rounded border font-semibold ${isDone ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                {isDone ? 'Completed' : 'In Progress'}
              </span>
              {!isDone && (
                <span className={`px-2 py-0.5 rounded border tabular-nums ${agingDays > 14 ? 'bg-slate-100 text-slate-800 border-slate-300 font-semibold' : 'bg-slate-50 text-slate-600 border-slate-200'}`} title={`Initiated ${fmtDate(c.initiatedAt)}`}>
                  {agingDays === 0 ? 'Started today' : `${agingDays}d since initiated`}{agingDays > 14 ? ' — aging' : ''}
                </span>
              )}
              <span className="px-2 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                Last working day: {fmtDate(c.lastWorkingDay)}
              </span>
            </div>
          </div>
          {c.terminationId && (
            <p className="mt-3 text-xs text-slate-600 border-t border-slate-100 pt-2">
              Triggered by termination —{' '}
              <Link href={`/dashboard/lifecycle/termination/${c.terminationId}`} className="underline underline-offset-2 font-medium text-slate-800" title="Open the originating termination workflow and notice">
                view termination &amp; notice
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      {error && <p className="mb-3 text-sm text-slate-800 bg-slate-50 border border-slate-200 p-2 rounded">{error}</p>}

      <div className="space-y-4">
        {/* 1 — Assets pending return */}
        <Section icon={ClipboardList} title="1 · Assets pending return" done={c.employee.assets.length === 0}>
          {c.employee.assets.length === 0 ? (
            <p className="text-sm text-slate-600">No assets outstanding — all company property returned.</p>
          ) : (
            <>
              <ul className="text-sm text-slate-700 space-y-1">
                {c.employee.assets.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                    {a.asset.name} <span className="text-xs text-slate-400">({a.asset.type}{a.asset.serialNo ? ` · ${a.asset.serialNo}` : ''})</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500 mt-2">
                Record returns in the{' '}
                <Link href="/dashboard/assets" className="underline font-medium">Assets module</Link>
                {' '}— IT/Admin clearance below should only be granted once equipment is back.
              </p>
            </>
          )}
        </Section>

        {/* 2 — Departmental clearance */}
        <Section icon={ShieldCheck} title="2 · Departmental clearance" done={deptsDone}>
          <div className="space-y-2">
            {DEPTS.map((d) => {
              const cleared = d.cleared(c)
              return (
                <div key={d.key} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${cleared ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200'}`}>
                  <div className="min-w-0">
                    <p className={`text-sm ${cleared ? 'text-slate-500' : 'text-slate-900'}`}>{d.label}</p>
                    {cleared && <p className="text-[11px] text-slate-500 mt-0.5">Cleared {fmtDate(d.at(c))}</p>}
                  </div>
                  {cleared ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded px-2 py-0.5 shrink-0"><Check className="w-3 h-3" /> Cleared</span>
                  ) : canAct && !isDone ? (
                    <Button
                      size="sm" variant="outline" disabled={busy}
                      title={`Mark ${d.key} clearance as granted`}
                      onClick={() => { if (confirm(`Mark ${d.key} clearance as granted? This is recorded with your user and timestamp.`)) act({ action: 'CLEAR_DEPT', dept: d.key }) }}
                    >
                      Mark Cleared
                    </Button>
                  ) : (
                    <span className="text-[11px] text-slate-400 shrink-0">Pending</span>
                  )}
                </div>
              )
            })}
          </div>
        </Section>

        {/* 3 — Final settlement */}
        <Section icon={Banknote} title="3 · Final settlement" done={c.duesCleared}>
          <SettlementSection c={c} canAct={canAct && !isDone} busy={busy} act={act} />
        </Section>

        {/* 4 — Employee acknowledgment */}
        <Section icon={FileSignature} title="4 · Employee acknowledgment" done={c.employeeAcknowledged}>
          {c.employeeAcknowledged ? (
            <p className="text-sm text-slate-600">Acknowledged by employee on {fmtDate(c.employeeSignedAt)}.</p>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-slate-700">The departing employee confirms the clearance details and settlement are accurate.</p>
              {(isSelf || canAct) && !isDone && (
                <Button
                  size="sm" disabled={busy}
                  title={isSelf ? 'Sign your exit clearance acknowledgment' : 'Record the employee’s acknowledgment (obtained in person / in writing)'}
                  onClick={() => { if (confirm(isSelf ? 'Acknowledge your exit clearance? This is recorded as your signature.' : 'Record employee acknowledgment on their behalf? Only do this with a signed physical form on file.')) act({ action: 'ACKNOWLEDGE' }) }}
                >
                  {isSelf ? 'Acknowledge' : 'Record Acknowledgment'}
                </Button>
              )}
            </div>
          )}
        </Section>

        {/* 5 — HR certification */}
        <Section icon={ShieldCheck} title="5 · HR certification" done={!!c.hrCertifiedAt}>
          {c.hrCertifiedAt ? (
            <p className="text-sm text-slate-600">Certified by HR on {fmtDate(c.hrCertifiedAt)}.</p>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-slate-700">HR certifies all clearance information above is complete and correct.</p>
              {canAct && !isDone && (
                <Button size="sm" disabled={busy} title="Certify this clearance as HR" onClick={() => { if (confirm('Certify this exit clearance? Recorded under your HR account.')) act({ action: 'CERTIFY' }) }}>
                  Certify
                </Button>
              )}
            </div>
          )}
        </Section>

        {/* 6 — Exit interview */}
        <Section icon={MessageSquare} title="6 · Exit interview" done={!!c.interviewCompletedAt}>
          <InterviewSection c={c} canAct={canAct && !isDone} busy={busy} act={act} />
        </Section>

        {/* 7 — Handover */}
        <Section icon={ClipboardList} title="7 · Handover document" done={!!c.handoverSignedAt && c.handoverSignedByMgr}>
          <HandoverSection c={c} canEdit={(canAct || isSelf) && !isDone} canConfirm={canAct && !isDone} busy={busy} act={act} />
        </Section>

        {/* Complete */}
        {isDone ? (
          <Card className="border-slate-300">
            <CardContent className="p-4">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Check className="w-4 h-4" /> Clearance completed {fmtDate(c.completedAt)}</h3>
              <p className="text-sm text-slate-600 mt-1">
                Login disabled, employee status finalized, and Experience + Relieving letters auto-generated (available under{' '}
                <Link href="/dashboard/letters" className="underline font-medium">Letters</Link>).
              </p>
            </CardContent>
          </Card>
        ) : canAct && (
          <Card className="border-slate-300">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="font-semibold text-slate-900">Complete Exit Clearance</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Finalizes the exit: disables login, sets employee status, closes any linked termination, and auto-generates Experience + Relieving letters.
                  </p>
                  {gatesDone < gates.length && (
                    <p className="text-xs text-slate-700 mt-1.5 font-medium">
                      Blocked: {gates.filter((g) => !g.done).map((g) => g.label).join(' · ')}
                    </p>
                  )}
                </div>
                <Button
                  disabled={busy || gatesDone < gates.length}
                  title={gatesDone < gates.length ? 'All sections must be cleared first' : 'Complete this exit clearance'}
                  className="bg-slate-800 hover:bg-slate-800 text-white"
                  onClick={() => { if (confirm('Complete this exit clearance? This disables the employee’s login and cannot be undone.')) act({ action: 'COMPLETE' }) }}
                >
                  {busy ? 'Working…' : 'Complete Clearance'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, done, children }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  done: boolean
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-sm"><Icon className="w-4 h-4 text-slate-500" /> {title}</h3>
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded px-2 py-0.5 border ${done ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
            {done && <Check className="w-3 h-3" />}{done ? 'Done' : 'Pending'}
          </span>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

function SettlementSection({ c, canAct, busy, act }: {
  c: Clearance; canAct: boolean; busy: boolean
  act: (p: Record<string, unknown>) => Promise<boolean>
}) {
  const [amount, setAmount] = useState(c.finalSettlementAmount != null ? String(Math.round(c.finalSettlementAmount)) : '')
  const [notes, setNotes] = useState(c.settlementNotes ?? '')
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div><p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Pro-rata salary</p><p className="text-slate-800 tabular-nums">{fmtMoney(c.prorataSalary)}</p></div>
        <div><p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Leave encashment</p><p className="text-slate-800 tabular-nums">{fmtMoney(c.leaveEncashment)}</p></div>
        <div><p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Deductions</p><p className="text-slate-800 tabular-nums">{fmtMoney(c.outstandingDeductions)}</p></div>
        <div><p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Final amount</p><p className="text-slate-900 font-semibold tabular-nums">{fmtMoney(c.finalSettlementAmount)}</p></div>
      </div>
      {c.duesCleared ? (
        <p className="text-sm text-slate-600">Dues settled{c.settlementNotes ? ` — ${c.settlementNotes}` : ''}.</p>
      ) : canAct && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Final settlement amount (PKR)</label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-44" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Notes (optional)</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. paid via off-cycle run, June payroll" />
            </div>
            <Button
              size="sm" disabled={busy || amount === ''}
              title="Record the settled amount and mark dues as cleared"
              onClick={() => { if (confirm('Mark dues as settled with this amount?')) act({ action: 'SETTLE', amount: Number(amount), notes: notes || null }) }}
            >
              Mark Settled
            </Button>
            <Button
              size="sm" variant="outline" disabled={busy}
              title="Recompute pro-rata salary, leave encashment and deductions from current records"
              onClick={() => act({ action: 'RECOMPUTE_SETTLEMENT' })}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Recompute
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            To actually pay it out, create a <span className="font-medium">Final Settlement</span> off-cycle run in{' '}
            <Link href="/dashboard/payroll" className="underline font-medium inline-flex items-center gap-0.5" title="Open Payroll — use Off-cycle → Final Settlement">
              Payroll <ExternalLink className="w-3 h-3" />
            </Link>.
          </p>
        </div>
      )}
    </div>
  )
}

const RATINGS: { key: 'interviewMgrSupport' | 'interviewWorkEnv' | 'interviewCompensation' | 'interviewGrowth' | 'interviewWorkLife'; label: string }[] = [
  { key: 'interviewMgrSupport', label: 'Manager support' },
  { key: 'interviewWorkEnv', label: 'Work environment' },
  { key: 'interviewCompensation', label: 'Compensation' },
  { key: 'interviewGrowth', label: 'Growth opportunities' },
  { key: 'interviewWorkLife', label: 'Work-life balance' },
]

function InterviewSection({ c, canAct, busy, act }: {
  c: Clearance; canAct: boolean; busy: boolean
  act: (p: Record<string, unknown>) => Promise<boolean>
}) {
  const [reason, setReason] = useState(c.interviewReason ?? '')
  const [nextRole, setNextRole] = useState(c.interviewNextRole ?? '')
  const [ratings, setRatings] = useState<Record<string, string>>(
    Object.fromEntries(RATINGS.map((r) => [r.key, c[r.key] != null ? String(c[r.key]) : ''])),
  )
  const [improvement, setImprovement] = useState(c.interviewImprovement ?? '')
  const [recommend, setRecommend] = useState(c.interviewRecommendScore != null ? String(c.interviewRecommendScore) : '')

  if (c.interviewCompletedAt) {
    return (
      <div className="text-sm space-y-2">
        <p className="text-slate-600">Completed {fmtDate(c.interviewCompletedAt)}.</p>
        {c.interviewReason && <p><span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 block">Reason for leaving</span><span className="text-slate-800">{c.interviewReason}</span></p>}
        <div className="flex gap-4 flex-wrap">
          {RATINGS.map((r) => c[r.key] != null && (
            <span key={r.key} className="text-xs text-slate-600">{r.label}: <strong className="tabular-nums">{c[r.key]}/5</strong></span>
          ))}
          {c.interviewRecommendScore != null && <span className="text-xs text-slate-600">Would recommend: <strong className="tabular-nums">{c.interviewRecommendScore}/10</strong></span>}
        </div>
        {c.interviewImprovement && <p className="text-xs text-slate-600 italic border-l-2 border-slate-200 pl-2">&ldquo;{c.interviewImprovement}&rdquo;</p>}
      </div>
    )
  }
  if (!canAct) return <p className="text-sm text-slate-500">Exit interview not recorded yet.</p>
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Primary reason for leaving</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Better compensation elsewhere" />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Next role / destination (optional)</label>
          <Input value={nextRole} onChange={(e) => setNextRole(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {RATINGS.map((r) => (
          <div key={r.key}>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">{r.label}</label>
            <select
              value={ratings[r.key]}
              onChange={(e) => setRatings((prev) => ({ ...prev, [r.key]: e.target.value }))}
              className="w-full text-sm rounded-md border border-slate-200 px-2 py-1.5 bg-white"
              title={`Rate ${r.label.toLowerCase()} from 1 (poor) to 5 (excellent)`}
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div>
        <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">What could we improve?</label>
        <textarea value={improvement} onChange={(e) => setImprovement(e.target.value)} rows={2} className="w-full text-sm rounded-md border border-slate-200 px-3 py-2" />
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Would recommend Convertt (0–10)</label>
          <Input type="number" min={0} max={10} value={recommend} onChange={(e) => setRecommend(e.target.value)} className="w-24" />
        </div>
        <Button
          size="sm" disabled={busy || !reason.trim()}
          title="Save the exit interview — marks this section done"
          onClick={() => act({
            action: 'INTERVIEW',
            interviewReason: reason,
            interviewNextRole: nextRole || null,
            interviewImprovement: improvement || null,
            interviewRecommendScore: recommend === '' ? null : Number(recommend),
            ...Object.fromEntries(RATINGS.map((r) => [r.key, ratings[r.key] === '' ? null : Number(ratings[r.key])])),
          })}
        >
          Save Interview
        </Button>
      </div>
    </div>
  )
}

const HANDOVER_FIELDS: { key: 'handoverCurrentProjects' | 'handoverPendingTasks' | 'handoverKeyContacts' | 'handoverDocLocations' | 'handoverPasswords'; label: string; hint: string }[] = [
  { key: 'handoverCurrentProjects', label: 'Current projects', hint: 'Status and next steps for anything in flight' },
  { key: 'handoverPendingTasks', label: 'Pending tasks', hint: 'Open items with owners or suggested owners' },
  { key: 'handoverKeyContacts', label: 'Key contacts', hint: 'Clients, vendors, internal stakeholders' },
  { key: 'handoverDocLocations', label: 'Document locations', hint: 'Drives, folders, repos' },
  { key: 'handoverPasswords', label: 'Credentials / access notes', hint: 'Where shared credentials were transferred (never paste raw passwords)' },
]

function HandoverSection({ c, canEdit, canConfirm, busy, act }: {
  c: Clearance; canEdit: boolean; canConfirm: boolean; busy: boolean
  act: (p: Record<string, unknown>) => Promise<boolean>
}) {
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(HANDOVER_FIELDS.map((f) => [f.key, c[f.key] ?? ''])),
  )
  const submitted = !!c.handoverSignedAt
  if (submitted) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-slate-600">Submitted {fmtDate(c.handoverSignedAt)}.</p>
        {HANDOVER_FIELDS.map((f) => c[f.key] && (
          <div key={f.key}>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">{f.label}</p>
            <p className="text-slate-800 whitespace-pre-wrap">{c[f.key]}</p>
          </div>
        ))}
        <div className="border-t border-slate-100 pt-2 flex items-center justify-between gap-3 flex-wrap">
          {c.handoverSignedByMgr ? (
            <p className="text-slate-600 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Confirmed received by manager{c.employee.reportingManager ? ` (${c.employee.reportingManager.fullName})` : ''}.</p>
          ) : (
            <>
              <p className="text-slate-700">Awaiting confirmation from the reporting manager{c.employee.reportingManager ? ` (${c.employee.reportingManager.fullName})` : ''}.</p>
              {canConfirm && (
                <Button size="sm" variant="outline" disabled={busy} title="Confirm the handover was received (as HR, on the manager's behalf)" onClick={() => { if (confirm('Confirm handover received? Normally done by the reporting manager.')) act({ action: 'HANDOVER_CONFIRM' }) }}>
                  Confirm Received
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }
  if (!canEdit) return <p className="text-sm text-slate-500">Handover not submitted yet.</p>
  return (
    <div className="space-y-2">
      {HANDOVER_FIELDS.map((f) => (
        <div key={f.key}>
          <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">{f.label}</label>
          <textarea
            value={vals[f.key]}
            onChange={(e) => setVals((prev) => ({ ...prev, [f.key]: e.target.value }))}
            rows={2} placeholder={f.hint}
            className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
          />
        </div>
      ))}
      <Button
        size="sm" disabled={busy || HANDOVER_FIELDS.every((f) => !vals[f.key].trim())}
        title="Submit the handover document — the reporting manager then confirms receipt"
        onClick={() => act({
          action: 'HANDOVER_SUBMIT',
          ...Object.fromEntries(HANDOVER_FIELDS.map((f) => [f.key, vals[f.key].trim() || null])),
        })}
      >
        Submit Handover
      </Button>
    </div>
  )
}
