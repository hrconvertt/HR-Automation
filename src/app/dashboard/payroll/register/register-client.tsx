'use client'

/**
 * Payroll Register + GL client. Renders the full-company register table
 * (one row per employee across all runs), a print stylesheet, and a
 * "GL Summary (CSV)" download that groups totals by component with
 * debit/credit columns.
 */

import { useMemo } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { Printer, Download, ArrowLeft } from 'lucide-react'

export interface RegisterRow {
  employeeId: string
  name: string
  employeeCode: string
  basic: number
  houseRent: number
  utilities: number
  food: number
  fuel: number
  medicalAllowance: number
  otherAllowance: number
  overtimePay: number
  bonus: number
  arrears: number
  leaveEncashment: number
  gross: number
  eobi: number
  incomeTax: number
  providentFund: number
  healthcare: number
  loanDeduction: number
  advanceDeduction: number
  otherDeductions: number
  lateDeduction: number
  net: number
}

export interface RegisterData {
  month: number
  year: number
  monthLabel: string
  rows: RegisterRow[]
  runSummary: { id: string; runType: string; status: string; count: number }[]
}

// Column definition drives both the table and the totals row.
const EARNINGS: { key: keyof RegisterRow; label: string }[] = [
  { key: 'basic', label: 'Basic' },
  { key: 'houseRent', label: 'HRA' },
  { key: 'utilities', label: 'Utilities' },
  { key: 'food', label: 'Food' },
  { key: 'fuel', label: 'Fuel' },
  { key: 'medicalAllowance', label: 'Medical' },
  { key: 'otherAllowance', label: 'Other' },
  { key: 'overtimePay', label: 'OT' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'arrears', label: 'Arrears' },
  { key: 'leaveEncashment', label: 'Leave Enc.' },
]

const DEDUCTIONS: { key: keyof RegisterRow; label: string }[] = [
  { key: 'eobi', label: 'EOBI' },
  { key: 'incomeTax', label: 'Tax' },
  { key: 'providentFund', label: 'PF' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'loanDeduction', label: 'Loan' },
  { key: 'advanceDeduction', label: 'Advance' },
  { key: 'lateDeduction', label: 'Late' },
  { key: 'otherDeductions', label: 'Other Ded.' },
]

const num = (n: number) => Math.round(n).toLocaleString('en-PK')

export function RegisterClient({ data }: { data: RegisterData }) {
  const totals = useMemo(() => {
    const t = {} as Record<keyof RegisterRow, number>
    for (const col of [...EARNINGS, ...DEDUCTIONS]) t[col.key] = 0
    t.gross = 0; t.net = 0
    for (const r of data.rows) {
      for (const col of [...EARNINGS, ...DEDUCTIONS]) t[col.key] += r[col.key] as number
      t.gross += r.gross
      t.net += r.net
    }
    return t
  }, [data.rows])

  function downloadGL() {
    // GL: debit = expense (earnings), credit = liabilities (deductions + net payable)
    const lines: string[] = []
    lines.push('Component,Type,Debit,Credit')
    for (const col of EARNINGS) {
      const v = Math.round(totals[col.key] as number)
      if (v !== 0) lines.push(`${col.label},Earning,${v},0`)
    }
    for (const col of DEDUCTIONS) {
      const v = Math.round(totals[col.key] as number)
      if (v !== 0) lines.push(`${col.label},Deduction,0,${v}`)
    }
    lines.push(`Net Payable,Net,0,${Math.round(totals.net)}`)
    lines.push(`Total Gross,Control,${Math.round(totals.gross)},0`)
    const csv = lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `GL_Summary_${data.monthLabel.replace(' ', '_')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Print stylesheet — hide chrome, force landscape, shrink font */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .register-table { font-size: 8px; }
          .register-table th, .register-table td { padding: 2px 3px !important; }
        }
      `}</style>

      <div className="flex items-center justify-between gap-3 flex-wrap no-print">
        <div>
          <a href="/dashboard/payroll" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-4 h-4" /> Back to Payroll
          </a>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Payroll Register &amp; GL</h1>
          <p className="text-sm text-slate-500">{data.monthLabel} · {data.rows.length} employees · {data.runSummary.length} run{data.runSummary.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1.5" /> Print
          </Button>
          <Button variant="outline" onClick={downloadGL} disabled={data.rows.length === 0}>
            <Download className="w-4 h-4 mr-1.5" /> GL Summary (CSV)
          </Button>
        </div>
      </div>

      {/* Print header (only visible when printing) */}
      <div className="hidden print:block">
        <h1 className="text-lg font-bold">Convertt — Payroll Register — {data.monthLabel}</h1>
      </div>

      {/* Run breakdown */}
      {data.runSummary.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap no-print">
          {data.runSummary.map((r) => (
            <Badge key={r.id} variant="secondary" className="text-xs">
              {r.runType === 'REGULAR' ? 'Regular' : r.runType.replace('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} · {r.status} · {r.count}
            </Badge>
          ))}
        </div>
      )}

      <Card className="rounded-2xl overflow-hidden">
        <CardHeader>
          <CardTitle>Register — {data.monthLabel}</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          {data.rows.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">
              No payroll runs for {data.monthLabel}.
            </div>
          ) : (
            <table className="register-table w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className="text-left px-3 py-2 sticky left-0 bg-slate-50 z-10">Employee</th>
                  {EARNINGS.map((c) => <th key={c.key} className="text-right px-3 py-2 whitespace-nowrap">{c.label}</th>)}
                  <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">Gross</th>
                  {DEDUCTIONS.map((c) => <th key={c.key} className="text-right px-3 py-2 whitespace-nowrap">{c.label}</th>)}
                  <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.employeeId} className="border-t border-slate-100">
                    <td className="text-left px-3 py-1.5 sticky left-0 bg-white z-10">
                      <span className="font-medium text-slate-900">{r.name}</span>
                      <span className="block text-[10px] text-slate-400 font-mono">{r.employeeCode}</span>
                    </td>
                    {EARNINGS.map((c) => <td key={c.key} className="text-right px-3 py-1.5 tabular-nums">{num(r[c.key] as number)}</td>)}
                    <td className="text-right px-3 py-1.5 tabular-nums font-semibold">{num(r.gross)}</td>
                    {DEDUCTIONS.map((c) => <td key={c.key} className="text-right px-3 py-1.5 tabular-nums">{num(r[c.key] as number)}</td>)}
                    <td className="text-right px-3 py-1.5 tabular-nums font-semibold">{num(r.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                  <td className="text-left px-3 py-2 sticky left-0 bg-slate-50 z-10">Totals ({data.rows.length})</td>
                  {EARNINGS.map((c) => <td key={c.key} className="text-right px-3 py-2 tabular-nums">{num(totals[c.key] as number)}</td>)}
                  <td className="text-right px-3 py-2 tabular-nums">{num(totals.gross)}</td>
                  {DEDUCTIONS.map((c) => <td key={c.key} className="text-right px-3 py-2 tabular-nums">{num(totals[c.key] as number)}</td>)}
                  <td className="text-right px-3 py-2 tabular-nums">{num(totals.net)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </Card>

      <p className="text-xs text-slate-400 no-print">
        Totals aggregate every run for the period (regular + off-cycle). GL Summary groups by component with debit (earnings/expense) and credit (deductions + net payable) columns. Amount shown in PKR. {formatCurrency(totals.net)} total net payable.
      </p>
    </div>
  )
}
