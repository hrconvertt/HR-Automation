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

import { useState, useEffect, useCallback, useRef } from 'react'
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
  PlusCircle, BookOpen, CalendarClock, TrendingUp, X,
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
  runType?: string
  totalGross: number
  totalNet: number
  totalEOBI: number
  totalTax: number
  payslips: Payslip[]
  approvals?: ApprovalRow[]
  sendBackReason?: string | null
}

/** Lightweight run summary from listPayrollRuns (run switcher). */
interface RunSummary {
  id: string
  month: number
  year: number
  status: string
  runType: string
  totalGross: number
  totalNet: number
  createdAt: string
  _count?: { payslips: number }
}

interface RetroSuggestion {
  employeeId: string
  name: string
  employeeCode: string
  months: string[]
  totalArrears: number
  currentGross: number
}

interface PayrollCalendar {
  payrollCutoffDay: number
  payrollReviewDays: number
  payrollDisburseDay: number
}

const OFF_CYCLE_LABEL: Record<string, string> = {
  BONUS: 'Bonus',
  ARREARS: 'Arrears',
  FINAL_SETTLEMENT: 'Final Settlement',
  REGULAR: 'Regular',
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

export interface HRPayrollInitialData {
  month: number
  year: number
  run: PayrollRun | null
  runs?: RunSummary[]
  anomalies: AnomaliesResponse | null
  me: MeResponse
  calendar?: PayrollCalendar
  todayISO?: string
}

export function HRPayrollView({ initialData }: { initialData?: HRPayrollInitialData }) {
  const now = new Date()
  const [month, setMonth] = useState(initialData?.month ?? now.getMonth() + 1)
  const [year, setYear] = useState(initialData?.year ?? now.getFullYear())
  const [payrollRun, setPayrollRun] = useState<PayrollRun | null>(initialData?.run ?? null)
  const [runs, setRuns] = useState<RunSummary[]>(initialData?.runs ?? [])
  // When set, we view a specific (usually off-cycle) run instead of the REGULAR one.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialData?.run?.id ?? null)
  const [anomalies, setAnomalies] = useState<AnomaliesResponse | null>(initialData?.anomalies ?? null)
  const [me, setMe] = useState<MeResponse | null>(initialData?.me ?? null)
  const [loading, setLoading] = useState(!initialData)
  // Server already rendered the initial month — skip the duplicate first fetch.
  // Roles are static per session, so fetchMe is skipped entirely when provided.
  const skipFirstFetch = useRef(!!initialData)
  const [busy, setBusy] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<AdjustablePayslip | null>(null)
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [sendBackReason, setSendBackReason] = useState('')
  const [genDocsOpen, setGenDocsOpen] = useState(false)
  const [genVisible, setGenVisible] = useState(true)
  const [genNotify, setGenNotify] = useState(true)
  const [genBusy, setGenBusy] = useState(false)
  // Off-cycle run dialog + retro suggestions
  const [offCycleOpen, setOffCycleOpen] = useState(false)
  const [retro, setRetro] = useState<RetroSuggestion[] | null>(null)
  const [retroBusy, setRetroBusy] = useState(false)
  const calendar = initialData?.calendar
  const todayISO = initialData?.todayISO

  const fetchMe = useCallback(async () => {
    const r = await safeFetch<MeResponse>('/api/auth/me')
    if (r.ok) setMe(r.data)
  }, [])

  // selectedRunId lives in a ref for fetchPayroll so the callback identity only
  // depends on month/year — the auto-effect must NOT re-fire on run switches
  // (those call fetchPayroll directly), otherwise setSelectedRunId would loop.
  const selectedRunIdRef = useRef<string | null>(initialData?.run?.id ?? null)
  const fetchPayroll = useCallback(async (runIdOverride?: string | null) => {
    setLoading(true)
    const rid = runIdOverride !== undefined ? runIdOverride : selectedRunIdRef.current
    const qs = `month=${month}&year=${year}${rid ? `&runId=${rid}` : ''}`
    const r = await safeFetch<{ payrollRun: PayrollRun | null; runs?: RunSummary[] }>(`/api/payroll?${qs}`)
    const run = r.ok ? (r.data?.payrollRun ?? null) : null
    const runList = r.ok ? (r.data?.runs ?? []) : []
    setPayrollRun(run)
    setRuns(runList)
    setSelectedRunId(run?.id ?? null)
    selectedRunIdRef.current = run?.id ?? null
    if (run) {
      const a = await safeFetch<AnomaliesResponse>(`/api/payroll/${run.id}/anomalies`)
      setAnomalies(a.ok ? a.data : null)
      // Retro suggestions only make sense on the REGULAR run.
      if ((run.runType ?? 'REGULAR') === 'REGULAR') {
        const s = await safeFetch<{ suggestions: RetroSuggestion[] }>(`/api/payroll/retro-suggestions?month=${month}&year=${year}`)
        setRetro(s.ok ? (s.data?.suggestions ?? []) : null)
      } else {
        setRetro(null)
      }
    } else {
      setAnomalies(null)
      setRetro(null)
    }
    setLoading(false)
  }, [month, year])

  // Explicit run switch — reset the ref then refetch that run.
  const switchRun = useCallback((runId: string) => {
    selectedRunIdRef.current = runId
    setSelectedRunId(runId)
    fetchPayroll(runId)
  }, [fetchPayroll])

  useEffect(() => {
    if (initialData?.me) return
    fetchMe()
  }, [fetchMe, initialData])
  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false
      // Server rendered the REGULAR run but not retro suggestions — fetch once.
      if ((initialData?.run?.runType ?? 'REGULAR') === 'REGULAR' && initialData?.run) {
        safeFetch<{ suggestions: RetroSuggestion[] }>(
          `/api/payroll/retro-suggestions?month=${initialData.month}&year=${initialData.year}`,
        ).then((s) => setRetro(s.ok ? (s.data?.suggestions ?? []) : null))
      }
      return
    }
    // Month/year changed → default back to the REGULAR run for the new period.
    selectedRunIdRef.current = null
    fetchPayroll(null)
  }, [fetchPayroll, initialData])

  const roles = me?.roles ?? []
  const isHR = roles.includes('HR_ADMIN')
  const isFinance = roles.includes('FINANCE')
  const status = payrollRun?.status ?? 'DRAFT'
  const canEdit = canEditPayslipsAtStage(status, roles)

  async function handleGenerate(replace = false) {
    setBusy(true)
    // New auto-generate endpoint: pulls latest comp + applies resignation
    // filter + pro-rates partial-month exits. POST /api/payroll/generate.
    const r = await safeFetch<{ payrollRun: { id: string }; count: number }>('/api/payroll/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year, replace }),
    })
    setBusy(false)
    if (!r.ok) {
      // 409 means a run already exists — offer to replace if it's still DRAFT.
      const msg = r.error ?? 'Failed to generate'
      if (msg.toLowerCase().includes('already exists')) {
        if (confirm(`A payroll run already exists for ${months[month - 1]} ${year}. Replace it? (Only DRAFT runs can be replaced.)`)) {
          handleGenerate(true)
          return
        }
      } else {
        alert(msg)
      }
      return
    }
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
    // New multi-format endpoint — IBFT format covers all non-Faysal banks
    window.open(`/api/payroll/${payrollRun.id}/export?format=IBFT`, '_blank')
  }

  function downloadIFT() {
    if (!payrollRun) return
    // IFT format = Faysal Bank accounts only (PK<dd>FAYS*)
    window.open(`/api/payroll/${payrollRun.id}/export?format=IFT`, '_blank')
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

  // F2 — apply retro-pay suggestions to the current REGULAR run's arrears field
  // by PATCHing each affected employee's payslip via the bulk-update route.
  async function handleApplyRetro() {
    if (!payrollRun || !retro || retro.length === 0) return
    if (!confirm(`Add arrears to ${retro.length} payslip${retro.length === 1 ? '' : 's'} on this run?`)) return
    setRetroBusy(true)
    // Map employeeId → payslipId for rows present on this run.
    const slipByEmp = new Map(payrollRun.payslips.map((p) => [p.employeeId, p]))
    const updates = retro
      .map((s) => {
        const slip = slipByEmp.get(s.employeeId)
        if (!slip) return null
        // Add suggested arrears on top of existing arrears; bump gross + net.
        const arrears = slip.arrears + s.totalArrears
        return {
          payslipId: slip.id,
          arrears,
          grossSalary: slip.grossSalary + s.totalArrears,
          netSalary: slip.netSalary + s.totalArrears,
        }
      })
      .filter((u): u is NonNullable<typeof u> => u !== null)
    if (updates.length === 0) {
      setRetroBusy(false)
      alert('None of the affected employees have a payslip on this run.')
      return
    }
    const r = await safeFetch(`/api/payroll/${payrollRun.id}/bulk-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    setRetroBusy(false)
    if (!r.ok) { alert(r.error ?? 'Failed to apply arrears'); return }
    fetchPayroll()
  }

  const canSendBack = payrollRun
    ? sendBackAllowedRoles(status).some((r) => roles.includes(r))
    : false
  const runType = payrollRun?.runType ?? 'REGULAR'
  const isRegular = runType === 'REGULAR'

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
            <div className="flex items-center gap-2 flex-wrap">
              {!isRegular && (
                <Badge variant="warning" className="text-sm px-3 py-1 inline-flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Off-cycle: {OFF_CYCLE_LABEL[runType] ?? runType}
                </Badge>
              )}
              <Badge className="text-sm px-3 py-1 inline-flex items-center gap-1.5">
                {stageLabel(status)}
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* Pipeline indicator */}
      {payrollRun && <StagePipeline status={status} run={payrollRun} />}

      {/* Send-back banner */}
      {payrollRun?.sendBackReason && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 flex items-start gap-3">
          <Undo2 className="w-4 h-4 text-slate-700 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-slate-900">Last sent back:</p>
            <p className="text-slate-900">{payrollRun.sendBackReason}</p>
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
              className="h-10 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700"
            >
              {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-10 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700"
            >
              {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>

            {/* Run switcher — appears when the period has >1 run (REGULAR + off-cycle) */}
            {runs.length > 1 && (
              <select
                value={selectedRunId ?? ''}
                onChange={(e) => switchRun(e.target.value)}
                title="Switch between the regular run and off-cycle runs for this period"
                className="h-10 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700"
              >
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {OFF_CYCLE_LABEL[r.runType] ?? r.runType} — {stageLabel(r.status)}
                    {r._count ? ` (${r._count.payslips})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Generate / Regenerate — ALWAYS visible to HR_ADMIN, even after
                DRAFT. Regenerating an advanced run wipes the existing payslips
                (confirmation required) so HR can recover from a botched run.
                Prominent slate-900 styling so it's hard to miss. */}
            {isHR && (
              <Button
                onClick={() => {
                  const isRegen = !!payrollRun
                  const advanced = payrollRun && payrollRun.status !== 'DRAFT' && (payrollRun.payslips?.length ?? 0) > 0
                  if (isRegen && advanced) {
                    if (!confirm(
                      `Regenerate ${months[month - 1]} ${year} payroll?\n\n` +
                      `This will WIPE the current run (currently in ${stageLabel(payrollRun.status)}) ` +
                      `and start fresh with the latest compensation data. This cannot be undone.`,
                    )) return
                  }
                  handleGenerate(true)
                }}
                disabled={busy}
                title="Generate fresh payslips from the latest compensation data. Pro-rates partial-month exits; skips resigned employees."
                className="bg-slate-900 hover:bg-slate-800 text-white shadow-sm"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                {busy ? 'Generating…' : payrollRun ? `Regenerate ${months[month - 1]}` : `Generate ${months[month - 1]} ${year}`}
              </Button>
            )}

            {/* F1 — Off-cycle run (bonus / arrears / final settlement) */}
            {isHR && (
              <Button
                onClick={() => setOffCycleOpen(true)}
                variant="outline"
                title="Create a bonus, arrears, or final-settlement run for this period"
              >
                <PlusCircle className="w-4 h-4 mr-1.5" /> New Off-Cycle Run
              </Button>
            )}

            {/* F3 — Register / GL page */}
            <a
              href={`/dashboard/payroll/register?month=${month}&year=${year}`}
              className="inline-flex items-center h-10 px-4 rounded-xl border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
              title="Full-company payroll register + GL summary"
            >
              <BookOpen className="w-4 h-4 mr-1.5" /> Register / GL
            </a>

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
                  className="bg-slate-700 hover:bg-slate-700 text-white"
                >
                  <Send className="w-4 h-4 mr-1.5" /> Save &amp; Submit to CEO
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
                className="bg-slate-700 hover:bg-slate-700 text-white"
              >
                <FileCheck className="w-4 h-4 mr-1.5" /> Approve &amp; Release to Finance
              </Button>
            )}

            {payrollRun && status === 'PENDING_FINANCE' && (
              <>
                <Button onClick={downloadIBFT} variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Download IBFT
                </Button>
                <Button onClick={downloadIFT} variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Download IFT
                </Button>
                {(isFinance || isHR) && (
                  <Button
                    onClick={() => handleTransition(
                      'MARK_PAID', undefined,
                      `Mark ${months[month - 1]} ${year} payroll as PAID? Employees will see their payslips.`,
                    )}
                    disabled={busy}
                    className="bg-slate-700 hover:bg-slate-700 text-white"
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
                <Button onClick={downloadIFT} variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Download IFT
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
              <>
                <Button onClick={downloadIBFT} variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Download IBFT
                </Button>
                <Button onClick={downloadIFT} variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Download IFT
                </Button>
              </>
            )}

            {payrollRun && canSendBack && status !== 'DRAFT' && status !== 'PAID' && (
              <Button
                onClick={() => setSendBackOpen(true)}
                disabled={busy}
                variant="outline"
                className="text-slate-700 border-slate-200 hover:bg-slate-50"
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
              className="w-full min-h-[100px] px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setSendBackOpen(false); setSendBackReason('') }}>Cancel</Button>
              <Button onClick={handleSendBack} className="bg-slate-700 hover:bg-slate-700 text-white">
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
              <FileText className="w-5 h-5 text-slate-700" /> Generate Payslip PDFs
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
                className="bg-slate-700 hover:bg-slate-700 text-white"
              >
                {genBusy ? 'Generating…' : 'Generate'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* F1 — Off-cycle run dialog */}
      {offCycleOpen && (
        <OffCycleDialog
          month={month}
          year={year}
          onClose={() => setOffCycleOpen(false)}
          onCreated={(runId) => {
            setOffCycleOpen(false)
            switchRun(runId)
          }}
        />
      )}

      {/* Anomalies — only when in DRAFT on the REGULAR run */}
      {payrollRun && isRegular && status === 'DRAFT' && anomalies && (
        <Card className="rounded-2xl">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {anomalies.anomalies.length === 0 ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-slate-700" />
                  <p className="text-sm font-semibold text-slate-700">All clear — no anomalies vs last month.</p>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-slate-700" />
                  <p className="text-sm font-semibold text-slate-900">
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
                    <a href={`/dashboard/payroll/payslip/${a.payslipId}`} className="text-xs text-slate-700 hover:underline shrink-0">View payslip →</a>
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
          <KpiCard label="Total Gross" value={formatCurrency(payrollRun.totalGross)} Icon={Wallet} color="bg-slate-50 text-slate-700" />
          <KpiCard label="Total Net" value={formatCurrency(payrollRun.totalNet)} Icon={Banknote} color="bg-slate-50 text-slate-700" />
          <KpiCard label="Total EOBI" value={formatCurrency(payrollRun.totalEOBI ?? 0)} Icon={ShieldCheck} color="bg-slate-50 text-slate-700" />
          <KpiCard label="Total Income Tax" value={formatCurrency(payrollRun.totalTax ?? 0)} Icon={Landmark} color="bg-slate-50 text-slate-700" />
        </div>
      )}

      {/* F4 — Payroll calendar card (always visible to HR) */}
      {isHR && calendar && (
        <PayrollCalendarCard initial={calendar} todayISO={todayISO} />
      )}

      {/* F2 — Retro-pay / arrears suggestion card (REGULAR run only, DRAFT/editable) */}
      {payrollRun && isRegular && retro && retro.length > 0 && (
        <Card className="rounded-2xl border-amber-200">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-slate-900">
                {retro.length} employee{retro.length === 1 ? '' : 's'} {retro.length === 1 ? 'has' : 'have'} retroactive salary changes — {formatCurrency(retro.reduce((s, r) => s + r.totalArrears, 0))} total arrears
              </p>
            </div>
            {canEdit && (
              <Button
                onClick={handleApplyRetro}
                disabled={retroBusy}
                variant="outline"
                className="text-amber-700 border-amber-200 hover:bg-amber-50"
              >
                {retroBusy ? 'Applying…' : 'Add to this run’s arrears'}
              </Button>
            )}
          </div>
          <ul className="divide-y divide-slate-100">
            {retro.map((s) => (
              <li key={s.employeeId} className="px-5 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{s.name} <span className="text-[10px] text-slate-400 font-mono">{s.employeeCode}</span></p>
                  <p className="text-xs text-slate-500">Underpaid: {s.months.join(', ')}</p>
                </div>
                <span className="text-sm font-semibold text-slate-900 tabular-nums shrink-0">{formatCurrency(s.totalArrears)}</span>
              </li>
            ))}
          </ul>
          {!canEdit && (
            <p className="px-5 py-2 text-xs text-slate-400">Arrears can be added while the run is editable (DRAFT / HR final).</p>
          )}
        </Card>
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
              <TableRow><TableCell colSpan={9} className="py-8">
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                  <Wallet className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-slate-900">
                    No payroll for {months[month - 1]} {year} yet
                  </h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                    Pulls every active employee&apos;s latest compensation
                    (Regular Pay or the most recent change) and creates a draft run
                    ready for adjustments.
                  </p>
                  {isHR && (
                    <button
                      onClick={() => handleGenerate(false)}
                      disabled={busy}
                      className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      {busy ? 'Generating…' : `Generate Payroll for ${months[month - 1]} ${year}`}
                    </button>
                  )}
                  <p className="text-xs text-slate-400 mt-3">
                    You&apos;ll be able to edit values before submitting to the CEO.
                  </p>
                </div>
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
                          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-100"
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
                          className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                          title="Adjust payslip"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <a
                        href={`/dashboard/payroll/payslip/${p.id}`}
                        className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
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
            {payrollRun.approvals.filter((a) => {
              // Hide legacy approval rows
              if (a.action === 'APPROVE') return false
              const label = ACTION_LABEL[a.action] ?? ''
              if (label.toLowerCase().includes('legacy')) return false
              if (a.comment?.toLowerCase().includes('legacy endpoint')) return false
              return true
            }).map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 w-2 h-2 rounded-full bg-slate-500 shrink-0" />
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
              ? 'bg-slate-500 text-white'
              : isCurrent
                ? 'bg-slate-500 text-white ring-4 ring-slate-100 animate-pulse'
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
                  <div className={`flex-1 h-0.5 ${i < currentIdx ? 'bg-slate-300' : 'bg-slate-200'}`} />
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

// ─── F1: Off-cycle run dialog ────────────────────────────────────────────────

interface EmpOption { id: string; fullName: string; employeeCode: string; designation?: string }

function OffCycleDialog({
  month, year, onClose, onCreated,
}: {
  month: number; year: number
  onClose: () => void
  onCreated: (runId: string) => void
}) {
  const [runType, setRunType] = useState<'BONUS' | 'ARREARS' | 'FINAL_SETTLEMENT'>('BONUS')
  const [employees, setEmployees] = useState<EmpOption[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Record<string, { amount: string; note: string }>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    safeFetch<{ employees: EmpOption[] }>('/api/employees?status=ACTIVE&limit=500').then((r) => {
      if (r.ok) setEmployees(r.data?.employees ?? [])
    })
  }, [])

  const filtered = employees.filter((e) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return e.fullName.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q)
  })

  function toggle(id: string) {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else next[id] = { amount: '', note: '' }
      return next
    })
  }

  async function submit() {
    const entries = Object.entries(selected)
      .map(([employeeId, v]) => ({ employeeId, amount: Number(v.amount), note: v.note.trim() || undefined }))
      .filter((e) => Number.isFinite(e.amount) && e.amount > 0)
    if (entries.length === 0) { alert('Select at least one employee and enter a positive amount.'); return }
    setBusy(true)
    const r = await safeFetch<{ payrollRun: { id: string } }>('/api/payroll/off-cycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year, runType, entries }),
    })
    setBusy(false)
    if (!r.ok || !r.data?.payrollRun?.id) { alert(r.error ?? 'Failed to create off-cycle run'); return }
    onCreated(r.data.payrollRun.id)
  }

  const selectedCount = Object.keys(selected).length
  const total = Object.values(selected).reduce((s, v) => s + (Number(v.amount) || 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-slate-700" /> New Off-Cycle Run — {months[month - 1]} {year}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Run type radios */}
          <div className="flex items-center gap-4 flex-wrap">
            {(['BONUS', 'ARREARS', 'FINAL_SETTLEMENT'] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="runType" checked={runType === t} onChange={() => setRunType(t)} className="w-4 h-4" />
                {OFF_CYCLE_LABEL[t]}
              </label>
            ))}
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
          />

          <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-4 text-sm text-slate-400 text-center">No employees.</p>
            ) : filtered.map((e) => {
              const sel = selected[e.id]
              return (
                <div key={e.id} className="px-3 py-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!sel} onChange={() => toggle(e.id)} className="w-4 h-4" />
                    <span className="text-sm text-slate-900 flex-1">{e.fullName}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{e.employeeCode}</span>
                  </label>
                  {sel && (
                    <div className="flex items-center gap-2 mt-2 pl-6">
                      <input
                        type="number" min="0" value={sel.amount}
                        onChange={(ev) => setSelected((p) => ({ ...p, [e.id]: { ...p[e.id], amount: ev.target.value } }))}
                        placeholder="Amount (PKR)"
                        className="w-36 h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
                      />
                      <input
                        value={sel.note}
                        onChange={(ev) => setSelected((p) => ({ ...p, [e.id]: { ...p[e.id], note: ev.target.value } }))}
                        placeholder="Note (optional)"
                        className="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 p-5 border-t border-slate-100">
          <p className="text-sm text-slate-500">
            {selectedCount} selected · {formatCurrency(total)}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || selectedCount === 0} className="bg-slate-900 hover:bg-slate-800 text-white">
              {busy ? 'Creating…' : `Create ${OFF_CYCLE_LABEL[runType]} Run`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── F4: Payroll calendar card ───────────────────────────────────────────────

function PayrollCalendarCard({ initial, todayISO }: { initial: PayrollCalendar; todayISO?: string }) {
  const [cfg, setCfg] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)

  // Countdown to cutoff — computed from server-provided todayISO (no Date.now
  // in render, so SSR and client agree).
  const daysToCutoff = (() => {
    if (!todayISO) return null
    const [y, m, d] = todayISO.split('-').map(Number)
    if (!y || !m || !d) return null
    const today = d
    // Days until this month's cutoff; if already past, roll to next month.
    const daysInMonth = new Date(y, m, 0).getDate()
    let diff = cfg.payrollCutoffDay - today
    if (diff < 0) diff += daysInMonth
    return diff
  })()

  async function save() {
    setBusy(true)
    const r = await safeFetch<PayrollCalendar>('/api/payroll/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    setBusy(false)
    if (!r.ok || !r.data) { alert(r.error ?? 'Failed to save'); return }
    setCfg(r.data)
    setEditing(false)
  }

  return (
    <Card className="rounded-2xl">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-slate-700" /> Payroll Calendar
          </h3>
          {!editing ? (
            <button onClick={() => { setDraft(cfg); setEditing(true) }} className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
              <button onClick={save} disabled={busy} className="text-xs font-medium text-slate-900 hover:underline">{busy ? 'Saving…' : 'Save'}</button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <CalItem label="Cutoff day" editing={editing}
            value={cfg.payrollCutoffDay} draft={draft.payrollCutoffDay}
            onChange={(v) => setDraft((d) => ({ ...d, payrollCutoffDay: v }))}
            suffix={ordinal(cfg.payrollCutoffDay)} />
          <CalItem label="CEO review window" editing={editing}
            value={cfg.payrollReviewDays} draft={draft.payrollReviewDays}
            onChange={(v) => setDraft((d) => ({ ...d, payrollReviewDays: v }))}
            suffix={`${cfg.payrollReviewDays} day${cfg.payrollReviewDays === 1 ? '' : 's'}`} />
          <CalItem label="Disbursement day" editing={editing}
            value={cfg.payrollDisburseDay} draft={draft.payrollDisburseDay}
            onChange={(v) => setDraft((d) => ({ ...d, payrollDisburseDay: v }))}
            suffix={ordinal(cfg.payrollDisburseDay)} />
        </div>

        {daysToCutoff !== null && !editing && (
          <p className="text-xs text-slate-500 mt-3">
            {daysToCutoff === 0
              ? 'Cutoff is today.'
              : `${daysToCutoff} day${daysToCutoff === 1 ? '' : 's'} until cutoff.`}
          </p>
        )}
      </div>
    </Card>
  )
}

function CalItem({ label, value, draft, editing, onChange, suffix }: {
  label: string; value: number; draft: number; editing: boolean
  onChange: (v: number) => void; suffix: string
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      {editing ? (
        <input
          type="number" min="0" max="31" value={draft}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mt-1 w-20 h-9 px-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
        />
      ) : (
        <p className="text-lg font-semibold text-slate-900 mt-0.5">{suffix}</p>
      )}
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
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
