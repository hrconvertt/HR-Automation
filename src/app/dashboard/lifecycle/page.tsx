'use client'

/**
 * Employee Lifecycle — unified module for joining, active, and exiting employees.
 *
 *   Onboarding      → checklists + probation tracker (links to existing pages)
 *   Active          → directory link (covered by People module)
 *   Exit Clearance  → resigned/terminated employees + 5-section clearance
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Sprout, Users, DoorOpen, Plus, X, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Employee { id: string; fullName: string; employeeCode: string; status: string; designation: string }
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

      <Tabs defaultValue="onboarding">
        <TabsList className="bg-white border border-slate-200 rounded-lg p-1 inline-flex">
          <TabsTrigger value="onboarding"><Sprout className="w-3.5 h-3.5 mr-1.5" /> Onboarding</TabsTrigger>
          <TabsTrigger value="active"><Users className="w-3.5 h-3.5 mr-1.5" /> Active</TabsTrigger>
          <TabsTrigger value="exit"><DoorOpen className="w-3.5 h-3.5 mr-1.5" /> Exit Clearance</TabsTrigger>
        </TabsList>

        <TabsContent value="onboarding" className="mt-4">
          <Card>
            <CardHeader className="border-b border-slate-100"><CardTitle>Onboarding & Probation</CardTitle></CardHeader>
            <CardContent className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Onboarding checklists and probation reviews live in dedicated modules.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link href="/dashboard/onboarding"
                  className="rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-md transition-all group">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Onboarding Checklists</p>
                      <p className="text-xs text-slate-500 mt-1">Track new-hire setup tasks</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600" />
                  </div>
                </Link>
                <Link href="/dashboard/probation"
                  className="rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-md transition-all group">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Probation Tracker</p>
                      <p className="text-xs text-slate-500 mt-1">Settling check-ins, decisions, confirmations</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600" />
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active" className="mt-4">
          <Card>
            <CardHeader className="border-b border-slate-100"><CardTitle>Active Employees</CardTitle></CardHeader>
            <CardContent className="p-6">
              <p className="text-sm text-slate-600 mb-4">Active employees are managed in the People module.</p>
              <Link href="/dashboard/employees"
                className="rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-md transition-all group flex items-center justify-between max-w-md">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Open People Directory</p>
                  <p className="text-xs text-slate-500 mt-1">Search, filter, edit employee records</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600" />
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exit" className="mt-4">
          <ExitClearanceTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ExitClearanceTab() {
  const [clearances, setClearances] = useState<Clearance[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [initOpen, setInitOpen] = useState(false)
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
    fetch('/api/employees?limit=200&status=ACTIVE').then((r) => r.json()).then((d) => setEmployees(d.employees ?? []))
  }, [])

  return (
    <Card>
      <CardHeader className="border-b border-slate-100 flex items-center justify-between flex-row">
        <CardTitle>Exit Clearance</CardTitle>
        <Button size="sm" onClick={() => setInitOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Initiate Exit
        </Button>
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

      {initOpen && (
        <InitiateExitDialog
          employees={employees}
          onClose={() => setInitOpen(false)}
          onDone={() => { setInitOpen(false); refresh() }}
        />
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

function InitiateExitDialog({ employees, onClose, onDone }: { employees: Employee[]; onClose: () => void; onDone: () => void }) {
  const [employeeId, setEmployeeId] = useState('')
  const [lastWorkingDay, setLastWorkingDay] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!employeeId) { setError('Pick an employee.'); return }
    setBusy(true)
    const res = await fetch('/api/exit-clearance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, lastWorkingDay: lastWorkingDay || null }),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d?.error ?? 'Could not initiate.')
      return
    }
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h2 className="text-base font-semibold">Initiate Exit Clearance</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Employee</label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Pick employee" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Last Working Day</label>
            <Input type="date" value={lastWorkingDay} onChange={(e) => setLastWorkingDay(e.target.value)} />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Initiating…' : 'Initiate'}</Button>
          </div>
        </form>
      </div>
    </div>
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
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
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
            {c.duesCleared ? (
              <p className="text-sm text-emerald-700">Cleared. Amount: PKR {c.finalSettlementAmount?.toLocaleString() ?? '0'}</p>
            ) : (
              <div className="space-y-2">
                <Input type="number" placeholder="Final settlement amount (PKR)" value={settleAmt} onChange={(e) => setSettleAmt(e.target.value)} />
                <Input placeholder="Notes (optional)" value={settleNotes} onChange={(e) => setSettleNotes(e.target.value)} />
                <Button size="sm" disabled={busy} onClick={() => act({ action: 'SETTLE', amount: settleAmt, notes: settleNotes })}>Mark Settled</Button>
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

          <div className="border-t border-slate-100 pt-4">
            {c.status === 'COMPLETED' ? (
              <p className="text-sm font-semibold text-emerald-700">
                Clearance complete — employee deactivated on {formatDate(c.completedAt)}.
              </p>
            ) : (
              <Button disabled={busy} onClick={() => act({ action: 'COMPLETE' })}>
                Complete Clearance & Deactivate Login
              </Button>
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
