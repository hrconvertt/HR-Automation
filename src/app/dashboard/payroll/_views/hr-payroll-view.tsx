'use client'

/**
 * HR Payroll view — multi-stage approval workflow.
 *
 *   Pipeline:
 *     DRAFT → Pending CEO → Pending HR Final → Pending Finance → Paid
 *
 *   Action buttons gate dynamically by current user roles + stage. Activity
 *   timeline reads from PayrollRunApproval rows.
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
  Download, Wallet, Banknote, Landmark, ShieldCheck,
  AlertTriangle, CheckCircle2, RefreshCw, Sparkles, Pencil,
  Send, FileCheck, Undo2, FileSpreadsheet, BadgeCheck, FileText,
} from 'lucide-react'
import { safeFetch } from '@/lib/safe-fetch'
import { AdjustPayslipDialog, type AdjustablePayslip } from '@/components/payroll/adjust-payslip-dialog'
import { PayrollGridEditor, type GridPayslip, type GridRole } from '@/components/payroll/payroll-grid-editor'
import {
  PAYROLL_STAGES,
  stageIndex,
  stageLabel,
  canEditPayslipsAtStage,
  sendBackAllowedRoles,
} from '@/lib/payroll-workflow'

interface Payslip {
  id: string
  employeeId: string
  basic: number
  houseRent: number; utilities: number; food: number; fuel: number
  medicalAllowance: number; otherAllowance: number
  overtimePay: number; bonus: number
  leaveEncashment: number; arrears: number
  allowances: number; grossPay: number; grossSalary: number
  eobi: number; incomeTax: number
  providentFund: number; healthcare: number
  loanDeduction: number; advanceDeduction: number; otherDeductions: number
  netPay: number; netSalary: number
  status: string
  isAdjusted: boolean
  adjustmentNote: string | null
  lateDeduction: number
  transactionAmount: number | null
  payoutNotes: string | null
  employee: { fullName: string; employeeCode: string; designation: string; ibanAccount?: string | null; bankAccount?: string | null; bankName?: string | null }
}

interface ApprovalRow {
  id: string
  fromStatus: string
  toStatus: string
  action: string
  actorName: string | null
  actorRole: string | null
  comment: string | null
  createdAt: string
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
  approvals?: ApprovalRow[]
  sendBackReason?: string | null
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

interface MeResponse {
  userId: string
  roles: string[]
  primaryRole: string
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const KIND_META: Record<Anomaly['kind'], { label: string; icon: string }> = {
  SALARY_CHANGED: { label: 'Salary changed',  icon: '💰' },
  NET_DELTA:      { label: 'Net pay differs', icon: '📊' },
  HIGH_OT:        { label: 'High overtime',   icon: '⏱' },
  NEW_EMPLOYEE:   { label: 'New employee',    icon: '🆕' },
  NO_PRIOR:       { label: 'No comparison',   icon: 'ℹ️' },
}

const ACTION_LABEL: Record<string, string> = {
  SUBMIT_TO_CEO: 'Submitted to CEO',
  CEO_APPROVE: 'CEO approved',
  HR_FINAL_APPROVE: 'HR final approval',
  RELEASE_TO_FINANCE: 'Released to Finance',
  MARK_PAID: 'Marked as Paid',
  SEND_BACK: 'Sent back',
  // legacy
  CALCULATE: 'Calculated',
  CONFIRM: 'Manager confirmed',
  REVIEW: 'Finance reviewed',
  APPROVE: 'Approved (legacy)',
  LOCK: 'Locked',
  DISBURSE: 'Disbursed',
  CLOSE: 'Closed',
  REJECT: 'Rejected',
}

export function HRPayrollView() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [payrollRun, setPayrollRun] = useState<PayrollRun | null>(null)
  const [anomalies, setAnomalies] = useState<AnomaliesResponse | null>(null)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<AdjustablePayslip | null>(null)
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [sendBackReason, setSendBackReason] = useState('')
  const [genDocsOpen, setGenDocsOpen] = useState(false)
  const [genVisible, setGenVisible] = useState(true)
  const [genNotify, setGenNotify] = useState(true)
  const [genBusy, setGenBusy] = useState(false)

  const fetchMe = useCallback(async () => {
    const r = await safeFetch<MeResponse>('/api/auth/me')
    if (r.ok) setMe(r.data)
  }, [])

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

  useEffect(() => { fetchMe() }, [fetchMe])
  useEffect(() => { fetchPayroll() }, [fetchPayroll])

  const roles = me?.roles ?? []
  const isHR = roles.includes('HR_ADMIN')
  const isFinance = roles.includes('FINANCE')
  const status = payrollRun?.status ?? 'DRAFT'
  const canEdit = canEditPayslipsAtStage(status, roles)

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

  async function handleTransition(action: string, reason?: string, confirmMsg?: string) {
    if (!payrollRun) return
    if (confirmMsg && !confirm(confirmMsg)) return
    setBusy(true)
    const r = await safeFetch(`/api/payroll/${payrollRun.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    })
    setBusy(false)
    if (!r.ok) {
      alert(r.error ?? 'Action failed')
      return
    }
    fetchPayroll()
  }

  function handleSendBack() {
    if (!payrollRun) return
    const trimmed = sendBackReason.trim()
    if (trimmed.length < 3) {
      alert('Please provide a reason for sending back.')
      return
    }
    setSendBackOpen(false)
    setSendBackReason('')
    handleTransition('SEND_BACK', trimmed)
  }

  function downloadIBFT() {
    if (!payrollRun) return
    window.open(`/api/payroll/${payrollRun.id}/export-ibft`, '_blank')
  }

  async function handleGeneratePayslipDocs() {
    if (!payrollRun) return
    setGenBusy(true)
    const r = await safeFetch<{ created: number; skipped: number; notified: number }>(
      `/api/payroll/${payrollRun.id}/generate-payslip-docs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibleToEmployee: genVisible, notify: genNotify }),
      },
    )
    setGenBusy(false)
    setGenDocsOpen(false)
    if (!r.ok) {
      alert(r.error ?? 'Failed to generate payslip documents.')
      return
    }
    const { created = 0, skipped = 0, notified = 0 } = r.data ?? {}
    alert(`Generated ${created} payslip PDF${created === 1 ? '' : 's'}.${skipped ? ` Skipped ${skipped} existing.` : ''}${notified ? ` Notified ${notified} employee${notified === 1 ? '' : 's'}.` : ''}`)
  }

  const canSendBack = payrollRun
    ? sendBackAllowedRoles(status).some((r) => roles.includes(r))
    : false

  return (
    <div className="space-y-6">

      {/* Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-white/90" /> Payroll — Multi-Stage Approval
            </h2>
            <p className="text-sm text-white/85 mt-1">
              HR prepares, CEO reviews, HR finalises, Finance pays out.
            </p>
          </div>
          {payrollRun && (
            <Badge className="text-sm px-3 py-1 inline-flex items-center gap-1.5">
              {stageLabel(status)}
            </Badge>
          )}
        </div>
      </div>

      {/* Pipeline indicator */}
      {payrollRun && <StagePipeline status={status} run={payrollRun} />}

      {/* Send-back banner */}
      {payrollRun?.sendBackReason && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <Undo2 className="w-4 h-4 text-amber-600 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-900">Last sent back:</p>
            <p className="text-amber-800">{payrollRun.sendBackReason}</p>
          </div>
        </div>
      )}

      {/* Period selector + action buttons */}
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
          <div className="flex items-center gap-2 flex-wrap">
            {!payrollRun && isHR && (
              <Button onClick={handleGenerate} disabled={busy}>
                <Sparkles className="w-4 h-4 mr-1.5" />
                {busy ? 'Preparing…' : `Prepare ${months[month - 1]} ${year} Payroll`}
              </Button>
            )}

            {/* Stage-specific actions */}
            {payrollRun && status === 'DRAFT' && isHR && (
              <>
                <Button onClick={handleRecompute} disabled={busy} variant="outline">
                  <RefreshCw className="w-4 h-4 mr-1.5" /> Recompute
                </Button>
                <Button
                  onClick={() => handleTransition(
                    'SUBMIT_TO_CEO', undefined,
                    `Submit ${months[month - 1]} ${year} payroll for CEO review?`,
                  )}
                  disabled={busy}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Send className="w-4 h-4 mr-1.5" /> Submit to CEO
                </Button>
              </>
            )}

            {payrollRun && status === 'PENDING_CEO' && isHR && (
              <Badge variant="warning" className="px-3 py-1">Awaiting CEO review</Badge>
            )}

            {payrollRun && status === 'PENDING_HR_FINAL' && isHR && (
              <Button
                onClick={() => handleTransition(
                  'HR_FINAL_APPROVE', undefined,
                  `Final approval and release to Finance for ${months[month - 1]} ${year}?`,
                )}
                disabled={busy}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <FileCheck className="w-4 h-4 mr-1.5" /> Approve &amp; Release to Finance
              </Button>
            )}

            {payrollRun && status === 'PENDING_FINANCE' && (
              <>
                <Button onClick={downloadIBFT} variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Download IBFT
                </Button>
                {(isFinance || isHR) && (
                  <Button
                    onClick={() => handleTransition(
                      'MARK_PAID', undefined,
                      `Mark ${months[month - 1]} ${year} payroll as PAID? Employees will see their payslips.`,
                    )}
                    disabled={busy}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <BadgeCheck className="w-4 h-4 mr-1.5" /> Mark as Paid
                  </Button>
                )}
              </>
            )}

            {payrollRun && status === 'PAID' && (
              <>
                <Button onClick={downloadIBFT} variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Download IBFT
                </Button>
                {isHR && (
                  <Button onClick={() => setGenDocsOpen(true)} variant="outline">
                    <FileText className="w-4 h-4 mr-1.5" /> Generate Payslip PDFs
                  </Button>
                )}
              </>
            )}

            {/* Legacy / historical paid runs — show download */}
            {payrollRun && ['APPROVED','LOCKED','DISBURSED','CLOSED'].includes(status) && (
              <Button onClick={downloadIBFT} variant="outline">
                <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Download IBFT
              </Button>
            )}

            {payrollRun && canSendBack && status !== 'DRAFT' && status !== 'PAID' && (
              <Button
                onClick={() => setSendBackOpen(true)}
                disabled={busy}
                variant="outline"
                className="text-amber-700 border-amber-300 hover:bg-amber-50"
              >
                <Undo2 className="w-4 h-4 mr-1.5" /> Send Back
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Send-back dialog */}
      {sendBackOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSendBackOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">Send Back</h3>
            <p className="text-sm text-slate-600">
              The payroll will return to the previous stage. The reason is shared with the prior reviewer.
            </p>
            <textarea
              value={sendBackReason}
              onChange={(e) => setSendBackReason(e.target.value)}
              placeholder="Why are you sending this back?"
              className="w-full min-h-[100px] px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setSendBackOpen(false); setSendBackReason('') }}>Cancel</Button>
              <Button onClick={handleSendBack} className="bg-amber-600 hover:bg-amber-700 text-white">
                <Undo2 className="w-4 h-4 mr-1.5" /> Send Back
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Payslip PDFs dialog */}
      {genDocsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !genBusy && setGenDocsOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" /> Generate Payslip PDFs
            </h3>
            <p className="text-sm text-slate-600">
              Creates one document per employee on this run, attached to their profile. Idempotent — runs again won&apos;t duplicate.
            </p>
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={genVisible}
                onChange={(e) => setGenVisible(e.target.checked)}
                className="mt-0.5 w-4 h-4"
              />
              <span>
                <span className="font-medium text-slate-900">Make payslips visible to employees</span>
                <span className="block text-xs text-slate-500">Uncheck to keep them HR-only for now.</span>
              </span>
            </label>
            <label className={`flex items-start gap-3 text-sm cursor-pointer ${!genVisible ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={genNotify && genVisible}
                disabled={!genVisible}
                onChange={(e) => setGenNotify(e.target.checked)}
                className="mt-0.5 w-4 h-4"
              />
              <span>
                <span className="font-medium text-slate-900">Notify employees by email</span>
                <span className="block text-xs text-slate-500">In-app notification: &quot;Your payslip is ready.&quot;</span>
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setGenDocsOpen(false)} disabled={genBusy}>Cancel</Button>
              <Button
                onClick={handleGeneratePayslipDocs}
                disabled={genBusy}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {genBusy ? 'Generating…' : 'Generate'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Anomalies — only when in DRAFT */}
      {payrollRun && status === 'DRAFT' && anomalies && (
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
                    <a href={`/dashboard/payroll/payslip/${a.payslipId}`} className="text-xs text-blue-600 hover:underline shrink-0">View payslip →</a>
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

      {/* Spreadsheet Grid Editor — Excel-like inline editing */}
      {payrollRun && payrollRun.payslips.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Spreadsheet Editor — {months[month - 1]} {year}</CardTitle>
          </CardHeader>
          <div className="px-5 pb-5">
            <PayrollGridEditor
              runId={payrollRun.id}
              month={month}
              year={year}
              runStatus={status}
              role={gridRoleFor(status, roles)}
              payslips={payrollRun.payslips.map((p): GridPayslip => ({
                id: p.id,
                employeeId: p.employeeId,
                employee: {
                  fullName: p.employee.fullName,
                  employeeCode: p.employee.employeeCode,
                  ibanAccount: p.employee.ibanAccount ?? null,
                  bankAccount: p.employee.bankAccount ?? null,
                  bankName: p.employee.bankName ?? null,
                },
                grossSalary: p.grossSalary,
                otherDeductions: p.otherDeductions,
                overtimePay: p.overtimePay,
                lateDeduction: p.lateDeduction ?? 0,
                netSalary: p.netSalary,
                transactionAmount: p.transactionAmount ?? null,
                payoutNotes: p.payoutNotes ?? null,
                status: p.status,
                adjustmentNote: p.adjustmentNote,
                isAdjusted: p.isAdjusted,
              }))}
              onSaved={fetchPayroll}
              onAdvanced={fetchPayroll}
              onEditDetails={(payslipId) => {
                const p = payrollRun.payslips.find((x) => x.id === payslipId)
                if (!p) return
                setAdjustTarget({
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
                })
              }}
            />
          </div>
        </Card>
      )}

      {/* Legacy detail table (collapsed; still useful for read-only inspection) */}
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
                          title={p.adjustmentNote ?? 'Manually adjusted'}
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
                      {canEdit && (
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
                          title="Adjust payslip"
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

      {/* Activity timeline */}
      {payrollRun && payrollRun.approvals && payrollRun.approvals.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <ol className="px-5 pb-5 space-y-3">
            {payrollRun.approvals.map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-slate-900">
                    <span className="font-semibold">{ACTION_LABEL[a.action] ?? a.action}</span>
                    {a.actorName && <> · <span>{a.actorName}</span></>}
                    {a.actorRole && <span className="text-slate-400"> ({a.actorRole})</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(a.createdAt).toLocaleString('en-GB', {
                      dateStyle: 'medium', timeStyle: 'short',
                    })}
                    {' · '}{a.fromStatus} → {a.toStatus}
                  </p>
                  {a.comment && (
                    <p className="text-xs text-slate-700 mt-1 px-3 py-1.5 rounded bg-slate-50 border border-slate-100">
                      “{a.comment}”
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Adjust payslip dialog */}
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

/** 5-stage pipeline indicator. */
function StagePipeline({ status, run }: { status: string; run: PayrollRun }) {
  const currentIdx = stageIndex(status)
  return (
    <Card className="rounded-2xl">
      <div className="p-5">
        <div className="flex items-center justify-between gap-2">
          {PAYROLL_STAGES.map((s, i) => {
            const isDone = i < currentIdx || status === 'PAID'
            const isCurrent = i === currentIdx && status !== 'PAID'
            const dotClass = isDone
              ? 'bg-emerald-500 text-white'
              : isCurrent
                ? 'bg-blue-500 text-white ring-4 ring-blue-100 animate-pulse'
                : 'bg-slate-200 text-slate-500'
            const labelClass = isDone || isCurrent ? 'text-slate-900 font-semibold' : 'text-slate-400'
            return (
              <div key={s} className="flex-1 flex items-center min-w-0">
                <div className="flex flex-col items-center text-center min-w-0 px-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${dotClass}`}>
                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </div>
                  <p className={`text-[11px] mt-1.5 leading-tight ${labelClass}`}>
                    {stageLabel(s)}
                  </p>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    {stageTimestamp(s, run)}
                  </p>
                </div>
                {i < PAYROLL_STAGES.length - 1 && (
                  <div className={`flex-1 h-0.5 ${i < currentIdx ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

function stageTimestamp(stage: string, run: PayrollRun): string {
  // Map stage to the relevant timestamp field. We only have createdAt + the
  // dated fields on the run; everything else is in approvals. To keep this
  // component dumb, we just show a tiny label.
  const r = run as unknown as Record<string, string | null | undefined>
  const key =
    stage === 'DRAFT' ? null :
    stage === 'PENDING_CEO' ? 'submittedToCeoAt' :
    stage === 'PENDING_HR_FINAL' ? 'ceoReviewedAt' :
    stage === 'PENDING_FINANCE' ? 'releasedToFinanceAt' :
    stage === 'PAID' ? 'financePaidAt' : null
  if (!key) return ''
  const v = r[key]
  if (!v) return ''
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function gridRoleFor(status: string, roles: string[]): GridRole {
  if (roles.includes('HR_ADMIN') && (status === 'DRAFT' || status === 'PENDING_HR_FINAL')) return 'HR'
  if (roles.includes('EXECUTIVE') && status === 'PENDING_CEO') return 'CEO'
  if ((roles.includes('FINANCE') || roles.includes('HR_ADMIN')) && status === 'PENDING_FINANCE') return 'FINANCE'
  return 'READONLY'
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
