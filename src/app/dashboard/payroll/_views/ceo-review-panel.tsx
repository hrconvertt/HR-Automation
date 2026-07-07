'use client'

/**
 * CEO Review Panel — surfaced on the Executive payroll page when a run is
 * awaiting CEO sign-off. Shows the spreadsheet grid (read-only amounts; CEO
 * can add review notes via payoutNotes) plus Approve / Send Back actions.
 */

import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { FileText } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { safeFetch } from '@/lib/safe-fetch'
import { PayrollGridEditor, type GridPayslip } from '@/components/payroll/payroll-grid-editor'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface Props {
  runId: string
  month: number
  year: number
  totalNet: number
  totalGross: number
  /** PayrollRun.runType — REGULAR | BONUS | ARREARS | FINAL_SETTLEMENT */
  runType?: string
}

const OFF_CYCLE_LABEL: Record<string, string> = {
  BONUS: 'Off-cycle: Bonus',
  ARREARS: 'Off-cycle: Arrears',
  FINAL_SETTLEMENT: 'Off-cycle: Final Settlement',
}

interface RawPayslip {
  id: string
  employeeId: string
  employee: {
    fullName: string
    employeeCode: string
    ibanAccount?: string | null
    bankAccount?: string | null
    bankName?: string | null
  }
  grossSalary: number
  otherDeductions: number
  overtimePay: number
  lateDeduction?: number | null
  netSalary: number
  transactionAmount?: number | null
  payoutNotes?: string | null
  status: string
  adjustmentNote: string | null
  isAdjusted: boolean
}

interface RunPayload {
  payrollRun: {
    id: string
    status: string
    payslips: RawPayslip[]
  } | null
}

export function CeoReviewPanel({ runId, month, year, totalNet, totalGross, runType }: Props) {
  const [payslips, setPayslips] = useState<RawPayslip[]>([])
  const [status, setStatus] = useState<string>('PENDING_CEO')
  const [loading, setLoading] = useState(true)

  const fetchRun = useCallback(async () => {
    setLoading(true)
    // Pass runId explicitly — without it the API prefers the REGULAR run for
    // the period, so a CEO reviewing an off-cycle run would see (and think
    // they're approving) the wrong run's payslips.
    const r = await safeFetch<RunPayload>(`/api/payroll?month=${month}&year=${year}&runId=${runId}`)
    if (r.ok && r.data?.payrollRun) {
      setPayslips(r.data.payrollRun.payslips)
      setStatus(r.data.payrollRun.status)
    }
    setLoading(false)
  }, [month, year, runId])

  useEffect(() => { fetchRun() }, [fetchRun])

  const gridRows: GridPayslip[] = payslips.map((p) => ({
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
  }))

  return (
    <Card className="rounded-2xl border-slate-100 bg-slate-50">
      <div className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-700" />
              <h3 className="text-base font-bold text-slate-900">
                Payroll awaiting your review — {MONTHS[month - 1]} {year}
                {runType && runType !== 'REGULAR' && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-slate-900 text-white text-[11px] font-semibold px-2.5 py-0.5 align-middle">
                    {OFF_CYCLE_LABEL[runType] ?? runType}
                  </span>
                )}
              </h3>
            </div>
            <p className="text-sm text-slate-900 mt-1">
              Total Net: <span className="font-semibold">{formatCurrency(totalNet)}</span>
              {' · '}Gross: <span className="font-semibold">{formatCurrency(totalGross)}</span>
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-900">Loading payroll grid…</p>
        ) : (
          <div className="bg-white rounded-xl p-3">
            <PayrollGridEditor
              runId={runId}
              month={month}
              year={year}
              runStatus={status}
              role="CEO"
              payslips={gridRows}
              onSaved={fetchRun}
              onAdvanced={() => window.location.reload()}
            />
          </div>
        )}
      </div>
    </Card>
  )
}
