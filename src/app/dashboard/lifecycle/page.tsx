'use client'

/**
 * Employee Lifecycle — unified module for joining, active, and exiting employees.
 *
 *   Onboarding      → checklists + probation tracker (links to existing pages)
 *   Active          → directory link (covered by People module)
 *   Exit Clearance  → resigned/terminated employees + 5-section clearance
 */
import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Sprout, Users, DoorOpen, X, ShieldCheck, Info } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { ProbationTrackerTabs, type ProbationListItem } from '@/components/probation/tracker-tabs'

interface OnboardingItem {
  id: string
  progress: number
  employee: { id: string; fullName: string; employeeCode: string; designation: string; joiningDate: string }
}
interface Clearance {
  id: string
  status: string
  initiatedAt: string
  lastWorkingDay: string | null
  itCleared: boolean
  financeCleared: boolean
  adminCleared: boolean
  hrCleared: boolean
  employeeAcknowledged: boolean
  hrCertifiedAt: string | null
  completedAt: string | null
  employee: { id: string; fullName: string; employeeCode: string; designation: string; status: string }
}

export default function LifecyclePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading…</div>}>
      <LifecyclePageInner />
    </Suspense>
  )
}

function LifecyclePageInner() {
  const sp = useSearchParams()
  const tabParam = sp.get('tab') ?? 'onboarding'
  const initialTab = ['onboarding', 'probation', 'active', 'exit'].includes(tabParam)
    ? tabParam
    : 'onboarding'
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-600 p-6 text-white shadow-md">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <Users className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Employee Lifecycle</h1>
            <p className="text-white/85 mt-1 text-sm">
              Unified workflow from joining to exit — onboarding checklists, probation reviews, and exit clearance.
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList className="bg-white border border-slate-200 rounded-lg p-1 inline-flex flex-wrap">
          <TabsTrigger value="onboarding"><Sprout className="w-3.5 h-3.5 mr-1.5" /> Onboarding</TabsTrigger>
          <TabsTrigger value="probation"><ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Probation</TabsTrigger>
          <TabsTrigger value="active"><Users className="w-3.5 h-3.5 mr-1.5" /> Active</TabsTrigger>
          <TabsTrigger value="exit"><DoorOpen className="w-3.5 h-3.5 mr-1.5" /> Exit Clearance</TabsTrigger>
        </TabsList>

        <TabsContent value="onboarding" className="mt-4 transition-opacity duration-150">
          <OnboardingTab />
        </TabsContent>

        <TabsContent value="probation" className="mt-4 transition-opacity duration-150">
          <ProbationTab />
        </TabsContent>

        <TabsContent value="active" className="mt-4 transition-opacity duration-150">
          <ActiveEmployeesTab />
        </TabsContent>

        <TabsContent value="exit" className="mt-4 transition-opacity duration-150">
          <ExitClearanceTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OnboardingTab() {
  const [items, setItems] = useState<OnboardingItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/onboarding').then((r) => r.json()).then((d) => {
      setItems(d.checklists ?? d.items ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const inProgress = items.filter((i) => i.progress < 100)
  const complete = items.filter((i) => i.progress >= 100)

  return (
    <Card>
      <CardHeader className="border-b border-slate-100 flex items-center justify-between flex-row">
        <CardTitle>Onboarding Checklists</CardTitle>
        <Link href="/dashboard/onboarding" className="text-xs text-blue-600 hover:underline">Full view →</Link>
      </CardHeader>
      {loading ? (
        <CardContent className="py-10 text-center text-slate-400">Loading…</CardContent>
      ) : items.length === 0 ? (
        <CardContent className="py-10 text-center text-slate-400">
          <Sprout className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No new hires in onboarding.
        </CardContent>
      ) : (
        <CardContent className="p-4 space-y-3">
          <div className="text-xs text-slate-500">
            {inProgress.length} in progress · {complete.length} complete
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {inProgress.slice(0, 8).map((i) => (
              <Link
                key={i.id}
                href={`/dashboard/employees/${i.employee.id}`}
                prefetch
                className="rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{i.employee.fullName}</p>
                    <p className="text-xs text-slate-500 truncate">{i.employee.designation}</p>
                  </div>
                  <Badge variant="secondary">{i.progress}%</Badge>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all" style={{ width: `${i.progress}%` }} />
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

function ProbationTab() {
  const [records, setRecords] = useState<ProbationListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/probation').then((r) => r.json()).then((d) => {
      setRecords(d.records ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-slate-400">Loading probation records…</CardContent>
      </Card>
    )
  }
  return <ProbationTrackerTabs records={records} />
}

interface ActiveSummary {
  birthdays: { id: string; fullName: string; date: string; manager: string | null }[]
  anniversaries: { id: string; fullName: string; date: string; years: number; milestone: boolean }[]
  probationEnding: { id: string; fullName: string; daysLeft: number; endDate: string }[]
  promotions: { employeeId: string; employee: string; newDesignation: string; effectiveDate: string }[]
  managerChanges: { employeeId: string; employee: string; oldManager: string | null; newManager: string | null; changedAt: string }[]
  deptTransfers: { employeeId: string; employee: string; from: string | null; to: string | null; at: string }[]
  tenure: { lt6: number; m6to2y: number; y2to5: number; y5plus: number }
}

function ActiveEmployeesTab() {
  const [data, setData] = useState<ActiveSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/lifecycle/active-summary').then((r) => r.json()).then((d) => {
      setData(d)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <Card><CardContent className="py-10 text-center text-slate-400">Loading…</CardContent></Card>
  if (!data) return <Card><CardContent className="py-10 text-center text-slate-400">Failed to load.</CardContent></Card>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b border-slate-100"><CardTitle>This Month</CardTitle></CardHeader>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">🎂 Birthdays ({data.birthdays.length})</p>
            {data.birthdays.length === 0 ? <p className="text-sm text-slate-400">None this month.</p> : (
              <ul className="space-y-1">
                {data.birthdays.map((b) => (
                  <li key={b.id} className="text-sm">
                    <Link href={`/dashboard/employees/${b.id}`} className="text-blue-600 hover:underline">{b.fullName}</Link>
                    <span className="text-xs text-slate-500"> · {formatDate(b.date)}{b.manager ? ` · ${b.manager}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">🎉 Anniversaries ({data.anniversaries.length})</p>
            {data.anniversaries.length === 0 ? <p className="text-sm text-slate-400">None this month.</p> : (
              <ul className="space-y-1">
                {data.anniversaries.map((a) => (
                  <li key={a.id} className="text-sm">
                    <Link href={`/dashboard/employees/${a.id}`} className={a.milestone ? 'text-purple-700 font-semibold hover:underline' : 'text-blue-600 hover:underline'}>
                      {a.fullName} · {a.years}y{a.milestone ? ' ⭐' : ''}
                    </Link>
                    <span className="text-xs text-slate-500"> · {formatDate(a.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">⏰ Probation conversions ({data.probationEnding.length})</p>
            {data.probationEnding.length === 0 ? <p className="text-sm text-slate-400">None within 30 days.</p> : (
              <ul className="space-y-1">
                {data.probationEnding.map((p) => (
                  <li key={p.id} className="text-sm">
                    <Link href={`/dashboard/employees/${p.id}`} className="text-blue-600 hover:underline">{p.fullName}</Link>
                    <span className="text-xs text-slate-500"> · ends in {p.daysLeft}d</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-100"><CardTitle>Recent Moves (last 90 days)</CardTitle></CardHeader>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">📈 Promotions</p>
            {data.promotions.length === 0 ? <p className="text-sm text-slate-400">None.</p> : (
              <ul className="space-y-1">
                {data.promotions.map((p, i) => (
                  <li key={i} className="text-sm">
                    <Link href={`/dashboard/employees/${p.employeeId}`} className="text-blue-600 hover:underline">{p.employee}</Link>
                    <span className="text-xs text-slate-500"> → {p.newDesignation} ({formatDate(p.effectiveDate)})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">🔄 Manager changes</p>
            {data.managerChanges.length === 0 ? <p className="text-sm text-slate-400">None.</p> : (
              <ul className="space-y-1">
                {data.managerChanges.map((m, i) => (
                  <li key={i} className="text-sm">
                    <Link href={`/dashboard/employees/${m.employeeId}`} className="text-blue-600 hover:underline">{m.employee}</Link>
                    <span className="text-xs text-slate-500"> · {m.oldManager ?? '—'} → {m.newManager ?? '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">🏢 Department transfers</p>
            {data.deptTransfers.length === 0 ? <p className="text-sm text-slate-400">None.</p> : (
              <ul className="space-y-1">
                {data.deptTransfers.map((d, i) => (
                  <li key={i} className="text-sm">
                    <Link href={`/dashboard/employees/${d.employeeId}`} className="text-blue-600 hover:underline">{d.employee}</Link>
                    <span className="text-xs text-slate-500"> · {d.from ?? '—'} → {d.to ?? '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-100"><CardTitle>Tenure Distribution</CardTitle></CardHeader>
        <CardContent className="p-4 space-y-2">
          {([
            ['< 6 months', data.tenure.lt6, 'bg-blue-400'],
            ['6mo - 2yr', data.tenure.m6to2y, 'bg-emerald-400'],
            ['2-5 yr', data.tenure.y2to5, 'bg-violet-400'],
            ['5+ yr', data.tenure.y5plus, 'bg-amber-400'],
          ] as [string, number, string][]).map(([label, count, color]) => {
            const max = Math.max(1, data.tenure.lt6, data.tenure.m6to2y, data.tenure.y2to5, data.tenure.y5plus)
            const pct = (count / max) * 100
            return (
              <div key={label} className="flex items-center gap-3 text-sm">
                <span className="w-28 text-slate-600">{label}</span>
                <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-10 text-right tabular-nums text-slate-900 font-medium">{count}</span>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

function ExitClearanceTab() {
  const [clearances, setClearances] = useState<Clearance[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)

  function refresh() {
    setLoading(true)
    fetch('/api/exit-clearance').then((r) => r.json()).then((d) => {
      setClearances(d.clearances ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    fetch('/api/exit-clearance').then((r) => r.json()).then((d) => {
      setClearances(d.clearances ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <Card>
      <CardHeader className="border-b border-slate-100">
        <CardTitle>Exit Clearance</CardTitle>
        <div className="flex items-start gap-2 mt-2 rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-900">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p>
            Employees appear here automatically when their status changes to{' '}
            <span className="font-medium">Resigned</span>, <span className="font-medium">Terminated</span>, or{' '}
            <span className="font-medium">Laid Off</span>. Update status from the{' '}
            <Link href="/dashboard/employees" className="underline font-medium">People module</Link>.
          </p>
        </div>
      </CardHeader>
      {loading ? (
        <CardContent className="py-8 text-center text-slate-400">Loading…</CardContent>
      ) : clearances.length === 0 ? (
        <CardContent className="py-10 text-center text-slate-400">
          <DoorOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No exit clearances in progress.
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Last Working Day</TableHead>
              <TableHead>Clearances</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clearances.map((c) => {
              const totalClear = [c.itCleared, c.financeCleared, c.adminCleared, c.hrCleared].filter(Boolean).length
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <p className="font-medium">{c.employee.fullName}</p>
                    <p className="text-xs text-slate-500">{c.employee.employeeCode} · {c.employee.designation}</p>
                  </TableCell>
                  <TableCell>{c.lastWorkingDay ? formatDate(c.lastWorkingDay) : '—'}</TableCell>
                  <TableCell>{totalClear}/4 cleared</TableCell>
                  <TableCell>
                    <Badge variant={c.status === 'COMPLETED' ? 'success' : 'default'}>{c.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <button onClick={() => setActiveId(c.id)} className="text-blue-600 hover:underline text-sm font-medium">
                      Open →
                    </button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {activeId && (
        <ClearanceDetailDialog
          id={activeId}
          onClose={() => setActiveId(null)}
          onChanged={refresh}
        />
      )}
    </Card>
  )
}

function ClearanceDetailDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [settleAmt, setSettleAmt] = useState('')
  const [settleNotes, setSettleNotes] = useState('')

  function refresh() {
    fetch(`/api/exit-clearance/${id}`).then((r) => r.json()).then((d) => setData(d.clearance ?? null)).catch(() => {})
  }
  useEffect(() => {
    fetch(`/api/exit-clearance/${id}`).then((r) => r.json()).then((d) => setData(d.clearance ?? null)).catch(() => {})
  }, [id])

  async function act(body: Record<string, unknown>) {
    setBusy(true)
    await fetch(`/api/exit-clearance/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    await refresh()
    onChanged()
  }

  async function cancelClearance() {
    if (!confirm('Cancel this exit clearance? This will permanently delete the clearance record. The employee will remain active. This cannot be undone.')) return
    setBusy(true)
    const res = await fetch(`/api/exit-clearance/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Failed to cancel clearance')
      return
    }
    onChanged()
    onClose()
  }

  if (!data) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl p-8 text-slate-500">Loading…</div>
      </div>
    )
  }

  const c = data
  const e = c.employee

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 sticky top-0 bg-white">
          <div>
            <h2 className="text-base font-semibold">Exit Clearance — {e.fullName}</h2>
            <p className="text-xs text-slate-500">{e.employeeCode} · {e.designation}</p>
          </div>
          <div className="flex items-center gap-2">
            {c.status !== 'COMPLETED' && (
              <button
                onClick={cancelClearance}
                disabled={busy}
                className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Cancel Clearance
              </button>
            )}
            <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
          </div>
        </div>
        <div className="p-5 space-y-5">

          <Section title="1. Asset & Property Return">
            {e.assets && e.assets.length > 0 ? (
              <ul className="text-sm text-slate-700 space-y-1">
                {e.assets.map((a: { id: string; assetCode: string | null; asset: { name: string; type: string } }) => (
                  <li key={a.id}>
                    • {a.asset.name} <span className="text-xs text-slate-500">({a.assetCode ?? a.asset.type})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No active asset assignments.</p>
            )}
            <p className="text-xs text-slate-400 mt-2">Return each item via the Assets module before completing clearance.</p>
          </Section>

          <Section title="2. Departmental Clearance">
            <div className="grid grid-cols-2 gap-2">
              {[
                ['IT', c.itCleared, c.itClearedAt],
                ['FINANCE', c.financeCleared, c.financeClearedAt],
                ['ADMIN', c.adminCleared, c.adminClearedAt],
                ['HR', c.hrCleared, c.hrClearedAt],
              ].map(([dept, cleared, at]) => (
                <div key={String(dept)} className={`rounded-lg border p-3 flex items-center justify-between ${cleared ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'}`}>
                  <div>
                    <p className="text-sm font-medium">{String(dept)}</p>
                    <p className="text-[11px] text-slate-500">{cleared ? `Cleared ${formatDate(String(at))}` : 'Pending'}</p>
                  </div>
                  {!cleared && <Button size="sm" disabled={busy} onClick={() => act({ action: 'CLEAR_DEPT', dept })}>Clear</Button>}
                </div>
              ))}
            </div>
          </Section>

          <Section title="3. Final Settlement">
            {(c.prorataSalary != null || c.leaveEncashment != null) && (
              <div className="text-xs text-slate-600 mb-2 space-y-0.5">
                <p>Prorata salary: PKR {(c.prorataSalary ?? 0).toLocaleString()}</p>
                <p>Leave encashment: PKR {(c.leaveEncashment ?? 0).toLocaleString()}</p>
                <p>Outstanding deductions: PKR {(c.outstandingDeductions ?? 0).toLocaleString()}</p>
                <p className="font-semibold text-slate-800">Computed total: PKR {((c.prorataSalary ?? 0) + (c.leaveEncashment ?? 0) - (c.outstandingDeductions ?? 0)).toLocaleString()}</p>
                <button onClick={() => act({ action: 'RECOMPUTE_SETTLEMENT' })} className="text-xs text-blue-600 hover:underline" disabled={busy}>Recompute</button>
              </div>
            )}
            {c.duesCleared ? (
              <p className="text-sm text-emerald-700">Cleared. Amount: PKR {c.finalSettlementAmount?.toLocaleString() ?? '0'}</p>
            ) : (
              <div className="space-y-2">
                <Input type="number" placeholder="Final settlement amount (PKR)" value={settleAmt || (c.finalSettlementAmount?.toString() ?? '')} onChange={(e) => setSettleAmt(e.target.value)} />
                <Input placeholder="Notes (optional)" value={settleNotes} onChange={(e) => setSettleNotes(e.target.value)} />
                <Button size="sm" disabled={busy} onClick={() => act({ action: 'SETTLE', amount: settleAmt || c.finalSettlementAmount, notes: settleNotes })}>Mark Settled</Button>
              </div>
            )}
          </Section>

          <Section title="4. Employee Declaration">
            <p className="text-xs text-slate-600 leading-relaxed">
              I confirm that I have returned all company property, retain no copies of confidential data,
              and reaffirm my NDA obligations under PECA 2016 and Defamation Ordinance 2002.
            </p>
            {c.employeeAcknowledged ? (
              <p className="text-sm text-emerald-700 mt-2">Acknowledged on {formatDate(c.employeeSignedAt)}</p>
            ) : (
              <Button size="sm" disabled={busy} className="mt-2" onClick={() => act({ action: 'ACKNOWLEDGE' })}>Sign Acknowledgment</Button>
            )}
          </Section>

          <Section title="5. HR Certification">
            {c.hrCertifiedAt ? (
              <p className="text-sm text-emerald-700">Certified on {formatDate(c.hrCertifiedAt)}</p>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => act({ action: 'CERTIFY' })}>HR Certify</Button>
            )}
          </Section>

          <Section title="6. Exit Interview">
            {c.interviewCompletedAt ? (
              <p className="text-sm text-emerald-700">Completed on {formatDate(c.interviewCompletedAt)} — eNPS: {c.interviewRecommendScore ?? '—'}/10</p>
            ) : (
              <ExitInterviewForm busy={busy} onSubmit={(payload) => act({ action: 'INTERVIEW', ...payload })} />
            )}
          </Section>

          <Section title="7. Handover Document">
            {c.handoverSignedAt && c.handoverSignedByMgr ? (
              <p className="text-sm text-emerald-700">Handover signed by employee on {formatDate(c.handoverSignedAt)} — manager confirmed.</p>
            ) : (
              <HandoverForm
                busy={busy}
                initial={{
                  handoverCurrentProjects: c.handoverCurrentProjects ?? '',
                  handoverPendingTasks: c.handoverPendingTasks ?? '',
                  handoverKeyContacts: c.handoverKeyContacts ?? '',
                  handoverDocLocations: c.handoverDocLocations ?? '',
                  handoverPasswords: c.handoverPasswords ?? '',
                }}
                signedAt={c.handoverSignedAt}
                mgrConfirmed={c.handoverSignedByMgr}
                onSubmit={(payload) => act({ action: 'HANDOVER_SUBMIT', ...payload })}
                onConfirm={() => act({ action: 'HANDOVER_CONFIRM' })}
              />
            )}
          </Section>

          <div className="border-t border-slate-100 pt-4">
            {c.status === 'COMPLETED' ? (
              <p className="text-sm font-semibold text-emerald-700">
                Clearance complete — employee deactivated on {formatDate(c.completedAt)}.
              </p>
            ) : (
              <ClearanceCompleteButton clearance={c} busy={busy} onComplete={() => act({ action: 'COMPLETE' })} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3>
      {children}
    </div>
  )
}

function ExitInterviewForm({ busy, onSubmit }: { busy: boolean; onSubmit: (p: Record<string, unknown>) => void }) {
  const [reason, setReason] = useState('')
  const [nextRole, setNextRole] = useState('')
  const [mgrSupport, setMgrSupport] = useState(3)
  const [workEnv, setWorkEnv] = useState(3)
  const [comp, setComp] = useState(3)
  const [growth, setGrowth] = useState(3)
  const [workLife, setWorkLife] = useState(3)
  const [improvement, setImprovement] = useState('')
  const [enps, setEnps] = useState(7)

  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="text-xs font-medium text-slate-700">Why are you leaving?</span>
        <textarea className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-700">Next role / company (optional)</span>
        <Input value={nextRole} onChange={(e) => setNextRole(e.target.value)} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {([
          ['Manager Support', mgrSupport, setMgrSupport],
          ['Work Environment', workEnv, setWorkEnv],
          ['Compensation', comp, setComp],
          ['Growth Opportunities', growth, setGrowth],
          ['Work-Life Balance', workLife, setWorkLife],
        ] as [string, number, (n: number) => void][]).map(([label, val, set]) => (
          <label key={label} className="block">
            <span className="text-xs font-medium text-slate-700">{label}: {val}/5</span>
            <input type="range" min={1} max={5} value={val} onChange={(e) => set(Number(e.target.value))} className="w-full" />
          </label>
        ))}
      </div>
      <label className="block">
        <span className="text-xs font-medium text-slate-700">What could improve?</span>
        <textarea className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm" rows={2} value={improvement} onChange={(e) => setImprovement(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-700">Would you recommend Convertt? {enps}/10</span>
        <input type="range" min={0} max={10} value={enps} onChange={(e) => setEnps(Number(e.target.value))} className="w-full" />
      </label>
      <Button size="sm" disabled={busy} onClick={() => onSubmit({
        interviewReason: reason,
        interviewNextRole: nextRole,
        interviewMgrSupport: mgrSupport,
        interviewWorkEnv: workEnv,
        interviewCompensation: comp,
        interviewGrowth: growth,
        interviewWorkLife: workLife,
        interviewImprovement: improvement,
        interviewRecommendScore: enps,
      })}>Complete Interview</Button>
    </div>
  )
}

interface HandoverInitial {
  handoverCurrentProjects: string
  handoverPendingTasks: string
  handoverKeyContacts: string
  handoverDocLocations: string
  handoverPasswords: string
}

function HandoverForm({ busy, initial, signedAt, mgrConfirmed, onSubmit, onConfirm }: {
  busy: boolean
  initial: HandoverInitial
  signedAt: string | null
  mgrConfirmed: boolean
  onSubmit: (p: Record<string, unknown>) => void
  onConfirm: () => void
}) {
  const [projects, setProjects] = useState(initial.handoverCurrentProjects)
  const [pending, setPending] = useState(initial.handoverPendingTasks)
  const [contacts, setContacts] = useState(initial.handoverKeyContacts)
  const [docs, setDocs] = useState(initial.handoverDocLocations)
  const [passwords, setPasswords] = useState(initial.handoverPasswords)

  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="text-xs font-medium text-slate-700">Current projects</span>
        <textarea className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm" rows={2} value={projects} onChange={(e) => setProjects(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-700">Pending tasks</span>
        <textarea className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm" rows={2} value={pending} onChange={(e) => setPending(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-700">Key contacts</span>
        <textarea className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm" rows={2} value={contacts} onChange={(e) => setContacts(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-700">Document locations / drives</span>
        <textarea className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm" rows={2} value={docs} onChange={(e) => setDocs(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-700">Passwords transferred to</span>
        <textarea className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm" rows={2} value={passwords} onChange={(e) => setPasswords(e.target.value)} placeholder="e.g. passwords for X transferred to Aisha on Aug 10" />
      </label>
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" disabled={busy} onClick={() => onSubmit({
          handoverCurrentProjects: projects,
          handoverPendingTasks: pending,
          handoverKeyContacts: contacts,
          handoverDocLocations: docs,
          handoverPasswords: passwords,
        })}>{signedAt ? 'Update Handover' : 'Submit Handover'}</Button>
        {signedAt && !mgrConfirmed && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onConfirm}>Confirm Handover Complete (manager)</Button>
        )}
        {signedAt && (
          <span className="text-xs text-slate-500">Submitted {formatDate(signedAt)}{mgrConfirmed ? ' · manager confirmed' : ' · awaiting manager confirmation'}</span>
        )}
      </div>
    </div>
  )
}

interface ClearanceLite {
  itCleared: boolean; financeCleared: boolean; adminCleared: boolean; hrCleared: boolean
  duesCleared: boolean; employeeAcknowledged: boolean; hrCertifiedAt: string | null
  interviewCompletedAt: string | null; handoverSignedAt: string | null; handoverSignedByMgr: boolean
}

function ClearanceCompleteButton({ clearance, busy, onComplete }: { clearance: ClearanceLite; busy: boolean; onComplete: () => void }) {
  const checks = [
    { label: 'Departmental clearance', ok: clearance.itCleared && clearance.financeCleared && clearance.adminCleared && clearance.hrCleared },
    { label: 'Final settlement', ok: clearance.duesCleared },
    { label: 'Employee acknowledgment', ok: clearance.employeeAcknowledged },
    { label: 'HR certification', ok: !!clearance.hrCertifiedAt },
    { label: 'Exit interview', ok: !!clearance.interviewCompletedAt },
    { label: 'Handover signed + manager confirmed', ok: !!clearance.handoverSignedAt && clearance.handoverSignedByMgr },
  ]
  const allOk = checks.every((c) => c.ok)

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 text-xs">
        {checks.map((c) => (
          <div key={c.label} className={c.ok ? 'text-emerald-700' : 'text-slate-400'}>
            {c.ok ? '✓' : '○'} {c.label}
          </div>
        ))}
      </div>
      <Button disabled={busy || !allOk} onClick={onComplete}>
        Complete Clearance & Deactivate Login
      </Button>
      {!allOk && <p className="text-xs text-slate-500">All 7 sections must be complete before finalising.</p>}
    </div>
  )
}
