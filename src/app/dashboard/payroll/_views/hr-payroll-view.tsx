'use client'

/**
 * HR Payroll view — AutoPilot style.
 *
 *   Status pill: Draft or Finalized.
 *   No multi-stage approval chain. HR sees only what's different from last month,
 *   reviews the anomalies, and clicks one button to approve.
 *
 *   The legacy `/transition` API + multi-stage workflow still exist but are
 *   unused here — they can be re-enabled if Convertt grows a Finance team.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'
import {
  Download, Wallet, Banknote, Receipt, Landmark, ShieldCheck,
  AlertTriangle, CheckCircle2, RefreshCw, Sparkles, Lock, Unlock, Pencil,
} from 'lucide-react'
import { safeFetch } from '@/lib/safe-fetch'
import { AdjustPayslipDialog, type AdjustablePayslip } from '@/components/payroll/adjust-payslip-dialog'

interface Payslip {
  id: string
  employeeId: string
  employee: { fullName: string; employeeCode: string; designation: string }
  basic: number
  houseRent: number
  utilities: number
  food: number
  fuel: number
  medicalAllowance: number
  otherAllowance: number
  overtimePay: number
  bonus: number
  leaveEncashment: number
  arrears: number
  allowances: number
  grossPay: number
  grossSalary: number
  eobi: number
  incomeTax: number
  providentFund: number
  healthcare: number
  loanDeduction: number
  advanceDeduction: number
  otherDeductions: number
  netPay: number
  netSalary: number
  status: string
  isAdjusted: boolean
  adjustmentNote: string | null
}

interface PayrollRun {
  id: string
  month: number
  year: number
  status: string
  totalGross: number
  totalNet: number
  totalEOBI: number
  totalTax: number
  payslips: Payslip[]
}

interface Anomaly {
  payslipId: string
  employeeId: string
  employeeName: string
  employeeCode: string
  kind: 'SALARY_CHANGED' | 'NET_DELTA' | 'HIGH_OT' | 'NEW_EMPLOYEE' | 'NO_PRIOR'
  summary: string
  delta: number | null
  severity: 'high' | 'medium' | 'low'
}

interface AnomaliesResponse {
  anomalies: Anomaly[]
  clean: number
  total: number
  priorMonth: { month: number; year: number } | null
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const KIND_META: Record<Anomaly['kind'], { label: string; icon: string }> = {
  SALARY_CHANGED: { label: 'Salary changed',  icon: '💰' },
  NET_DELTA:      { label: 'Net pay differs', icon: '📊' },
  HIGH_OT:        { label: 'High overtime',   icon: '⏱' },
  NEW_EMPLOYEE:   { label: 'New employee',    icon: '🆕' },
  NO_PRIOR:       { label: 'No comparison',   icon: 'ℹ️' },
}

export function HRPayrollView() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [payrollRun, setPayrollRun] = useState<PayrollRun | null>(null)
  const [anomalies, setAnomalies] = useState<AnomaliesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Adjustment dialog state
  const [adjustTarget, setAdjustTarget] = useState<AdjustablePayslip | null>(null)

  const fetchPayroll = useCallback(async () => {
    setLoading(true)
    const r = await safeFetch<{ payrollRun: PayrollRun | null }>(`/api/payroll?month=${month}&year=${year}`)
    const run = r.ok ? (r.data?.payrollRun ?? null) : null
    setPayrollRun(run)
    if (run) {
      const a = await safeFetch<AnomaliesResponse>(`/api/payroll/${run.id}/anomalies`)
      setAnomalies(a.ok ? a.data : null)
    } else {
      setAnomalies(null)
    }
    setLoading(false)
  }, [month, year])

  useEffect(() => { fetchPayroll() }, [fetchPayroll])

  async function handleGenerate() {
    setBusy(true)
    const r = await safeFetch('/api/payroll', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year }),
    })
    setBusy(false)
    if (!r.ok) alert(r.error ?? 'Failed to generate')
    fetchPayroll()
  }

  async function handleRecompute() {
    if (!payrollRun) return
    if (!confirm('Recompute all payslips with the latest attendance, OT and salary data? This overwrites the current draft.')) return
    setBusy(true)
    const r = await safeFetch(`/api/payroll/${payrollRun.id}/recompute`, { method: 'POST' })
    setBusy(false)
    if (!r.ok) alert(r.error ?? 'Failed to recompute')
    fetchPayroll()
  }

  async function handleApprove() {
    if (!payrollRun) return
    if (!confirm(`Finalize payroll for ${months[month - 1]} ${year}? Payslips become visible to all employees and the run is locked.`)) return
    setBusy(true)
    const r = await safeFetch(`/api/payroll/${payrollRun.id}/approve`, { method: 'POST' })
    setBusy(false)
    if (!r.ok) alert(r.error ?? 'Failed to approve')
    fetchPayroll()
  }

  const isDraft = payrollRun?.status === 'DRAFT'
  const isFinal = payrollRun && payrollRun.status !== 'DRAFT'

  return (
    <div className="space-y-6">

      {/* Banner */}
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" /> Payroll — AutoPilot
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              The system prepares each month&apos;s payroll automatically. You only review what changed.
            </p>
          </div>
          {payrollRun && (
            <Badge
              variant={isFinal ? 'success' : 'warning'}
              className="text-sm px-3 py-1 inline-flex items-center gap-1.5"
            >
              {isFinal ? <Lock className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {isFinal ? 'Finalized' : 'Draft'}
            </Badge>
          )}
        </div>
      </div>

      {/* Period selector */}
      <Card className="rounded-2xl">
        <div className="flex items-center justify-between gap-3 p-5 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="h-10 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-10 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {!payrollRun && (
              <Button onClick={handleGenerate} disabled={busy}>
                <Sparkles className="w-4 h-4 mr-1.5" />
                {busy ? 'Preparing…' : `Prepare ${months[month - 1]} ${year} Payroll`}
              </Button>
            )}
            {isDraft && (
              <>
                <Button onClick={handleRecompute} disabled={busy} variant="outline">
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  {busy ? 'Recomputing…' : 'Recompute'}
                </Button>
                <Button onClick={handleApprove} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  {busy ? 'Approving…' : 'Approve & Send'}
                </Button>
              </>
            )}
            {isFinal && (
              <Button disabled variant="outline">
                <Unlock className="w-4 h-4 mr-1.5 opacity-50" /> Finalized
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Anomalies — only when in draft AND there's data */}
      {payrollRun && isDraft && anomalies && (
        <Card className="rounded-2xl">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {anomalies.anomalies.length === 0 ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <p className="text-sm font-semibold text-emerald-700">All clear — no anomalies vs last month.</p>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <p className="text-sm font-semibold text-amber-800">
                    {anomalies.anomalies.length} item{anomalies.anomalies.length > 1 ? 's' : ''} need{anomalies.anomalies.length === 1 ? 's' : ''} a quick look
                  </p>
                </>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {anomalies.clean} of {anomalies.total} employees identical to {anomalies.priorMonth ? `${months[anomalies.priorMonth.month - 1]} ${anomalies.priorMonth.year}` : 'last month'}
            </p>
          </div>
          {anomalies.anomalies.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {anomalies.anomalies.map((a) => {
                const meta = KIND_META[a.kind]
                return (
                  <li key={a.payslipId} className="px-5 py-3 flex items-start gap-3">
                    <span className="text-lg shrink-0">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-900">{a.employeeName}</p>
                        <span className="text-[10px] text-slate-400 font-mono">{a.employeeCode}</span>
                        <Badge variant={a.severity === 'high' ? 'destructive' : a.severity === 'medium' ? 'warning' : 'secondary'}>
                          {meta.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{a.summary}</p>
                    </div>
                    <a
                      href={`/dashboard/payroll/payslip/${a.payslipId}`}
                      className="text-xs text-blue-600 hover:underline shrink-0"
                    >
                      View payslip →
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}

      {/* KPI row */}
      {payrollRun && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Gross" value={formatCurrency(payrollRun.totalGross)} Icon={Wallet} color="bg-blue-50 text-blue-600" />
          <KpiCard label="Total Net" value={formatCurrency(payrollRun.totalNet)} Icon={Banknote} color="bg-emerald-50 text-emerald-600" />
          <KpiCard label="Total EOBI" value={formatCurrency(payrollRun.totalEOBI ?? 0)} Icon={ShieldCheck} color="bg-purple-50 text-purple-600" />
          <KpiCard label="Total Income Tax" value={formatCurrency(payrollRun.totalTax ?? 0)} Icon={Landmark} color="bg-amber-50 text-amber-600" />
        </div>
      )}

      {/* Payslips Table */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Employee Payslips — {months[month - 1]} {year}</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Basic</TableHead>
              <TableHead>Allowances</TableHead>
              <TableHead>Gross</TableHead>
              <TableHead>EOBI</TableHead>
              <TableHead>Tax</TableHead>
              <TableHead>Net Pay</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-400">Loading…</TableCell></TableRow>
            ) : !payrollRun ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-400">
                No payroll for this period. Click &quot;Prepare {months[month - 1]} {year} Payroll&quot; to start.
              </TableCell></TableRow>
            ) : payrollRun.payslips.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-400">No payslips.</TableCell></TableRow>
            ) : (
              payrollRun.payslips.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-medium text-slate-900">{p.employee.fullName}</p>
                        <p className="text-xs text-slate-400">{p.employee.employeeCode}</p>
                      </div>
                      {p.isAdjusted && (
                        <span
                          title={p.adjustmentNote ?? 'Manually adjusted by HR'}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100"
                        >
                          <Pencil className="w-2.5 h-2.5" /> Adjusted
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatCurrency(p.basic)}</TableCell>
                  <TableCell>{formatCurrency(p.allowances)}</TableCell>
                  <TableCell>{formatCurrency(p.grossPay)}</TableCell>
                  <TableCell>{formatCurrency(p.eobi)}</TableCell>
                  <TableCell>{formatCurrency(p.incomeTax)}</TableCell>
                  <TableCell className="font-semibold">{formatCurrency(p.netPay)}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === 'PAID' ? 'success' : 'warning'}>{p.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {isDraft && (
                        <button
                          onClick={() => setAdjustTarget({
                            id: p.id,
                            employeeId: p.employeeId,
                            employeeName: p.employee.fullName,
                            basic: p.basic, houseRent: p.houseRent, utilities: p.utilities, food: p.food,
                            fuel: p.fuel, medicalAllowance: p.medicalAllowance, otherAllowance: p.otherAllowance,
                            overtimePay: p.overtimePay, bonus: p.bonus,
                            leaveEncashment: p.leaveEncashment, arrears: p.arrears,
                            eobi: p.eobi, incomeTax: p.incomeTax,
                            providentFund: p.providentFund, healthcare: p.healthcare,
                            loanDeduction: p.loanDeduction, advanceDeduction: p.advanceDeduction,
                            otherDeductions: p.otherDeductions,
                            grossSalary: p.grossSalary, netSalary: p.netSalary,
                            isAdjusted: p.isAdjusted, adjustmentNote: p.adjustmentNote,
                          })}
                          className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                          title="Adjust payslip (add bonus, encashment, PF, etc.)"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <a
                        href={`/dashboard/payroll/payslip/${p.id}`}
                        className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                        title="View payslip"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Adjust payslip dialog — mounted when HR clicks a row's pencil */}
      {adjustTarget && (
        <AdjustPayslipDialog
          payslip={adjustTarget}
          open={!!adjustTarget}
          onOpenChange={(o) => { if (!o) setAdjustTarget(null) }}
          onSaved={() => { setAdjustTarget(null); fetchPayroll() }}
        />
      )}
    </div>
  )
}

function KpiCard({ label, value, Icon, color }: {
  label: string; value: string; Icon: React.ComponentType<{ className?: string }>; color: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-900 mt-2">{value}</p>
        </div>
        <div className={`p-2.5 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}
