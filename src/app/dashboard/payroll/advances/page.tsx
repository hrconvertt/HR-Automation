'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, X, Trash2, Loader2, Plus, MinusCircle } from 'lucide-react'

interface Advance {
  id: string
  principal: number
  installmentAmount: number
  remaining: number
  reason: string | null
  status: string
  employee: { id: string; fullName: string; employeeCode: string }
}
interface EmpOpt { id: string; fullName: string; employeeCode: string }

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  active: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-slate-100 text-slate-500 border-slate-200',
}

export default function AdvancesPage() {
  const [advances, setAdvances] = useState<Advance[]>([])
  const [employees, setEmployees] = useState<EmpOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [err, setErr] = useState('')

  // New-advance form
  const [employeeId, setEmployeeId] = useState('')
  const [principal, setPrincipal] = useState('')
  const [installmentAmount, setInstallmentAmount] = useState('')
  const [reason, setReason] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/payroll/advances').then((r) => r.json()).then((d) => {
      setAdvances(d.advances ?? [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    fetch('/api/employees?limit=500&status=ACTIVE').then((r) => r.json()).then((d) => {
      setEmployees(d.employees ?? [])
    }).catch(() => {})
  }, [load])

  async function create() {
    setErr('')
    const res = await fetch('/api/payroll/advances', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, principal: Number(principal), installmentAmount: Number(installmentAmount), reason }),
    })
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'Could not save'); return }
    setShowForm(false); setEmployeeId(''); setPrincipal(''); setInstallmentAmount(''); setReason('')
    load()
  }

  async function act(id: string, body: Record<string, unknown>, method: 'PATCH' | 'DELETE' = 'PATCH') {
    setBusyId(id)
    await fetch(`/api/payroll/advances/${id}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: method === 'DELETE' ? undefined : JSON.stringify(body),
    })
    setBusyId(null)
    load()
  }

  const outstanding = advances.filter((a) => a.status === 'active').reduce((s, a) => s + a.remaining, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Loans &amp; Advances</h1>
          <p className="text-sm text-slate-500">Salary advances recovered in monthly installments. Outstanding: <span className="font-semibold">{pkr(outstanding)}</span></p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> New advance
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="border-b border-slate-100"><CardTitle>New Advance</CardTitle></CardHeader>
          <CardContent className="p-5 space-y-4">
            {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</p>}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Employee</label>
                <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                  value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">— Select —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (PKR)</label>
                <Input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monthly installment (PKR)</label>
                <Input type="number" value={installmentAmount} onChange={(e) => setInstallmentAmount(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Reason (optional)</label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. medical, relocation" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={create}>Save advance</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm p-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : advances.length === 0 ? (
            <p className="text-sm text-slate-400 p-6 text-center">No advances yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-slate-400 text-left border-b border-slate-100">
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium text-right">Principal</th>
                    <th className="px-4 py-2 font-medium text-right">Installment</th>
                    <th className="px-4 py-2 font-medium text-right">Remaining</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {advances.map((a) => (
                    <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-900">{a.employee.fullName}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{a.employee.employeeCode}{a.reason ? ` · ${a.reason}` : ''}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{pkr(a.principal)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{pkr(a.installmentAmount)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{pkr(a.remaining)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_STYLE[a.status] ?? STATUS_STYLE.rejected}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {busyId === a.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-400 inline" />
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            {a.status === 'pending' && (
                              <>
                                <button title="Approve" onClick={() => act(a.id, { action: 'approve' })}
                                  className="text-emerald-600 hover:text-emerald-800"><Check className="w-4 h-4" /></button>
                                <button title="Reject" onClick={() => act(a.id, { action: 'reject' })}
                                  className="text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                              </>
                            )}
                            {a.status === 'active' && (
                              <button title="Record one installment paid" onClick={() => act(a.id, { action: 'record_payment' })}
                                className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-[11px]">
                                <MinusCircle className="w-3.5 h-3.5" /> Record installment
                              </button>
                            )}
                            <button title="Delete" onClick={() => act(a.id, {}, 'DELETE')}
                              className="text-slate-300 hover:text-red-600 ml-1"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
