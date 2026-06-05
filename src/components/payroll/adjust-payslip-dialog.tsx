'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { RotateCcw, ExternalLink, ChevronDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export interface AdjustablePayslip {
  id: string
  employeeId: string
  employeeName: string
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
  eobi: number
  incomeTax: number
  providentFund: number
  healthcare: number
  loanDeduction: number
  advanceDeduction: number
  otherDeductions: number
  grossSalary: number
  netSalary: number
  isAdjusted: boolean
  adjustmentNote: string | null
}

interface Props {
  payslip: AdjustablePayslip
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

/**
 * Adjust Payslip dialog — focused, calm layout.
 *
 * Hierarchy (top to bottom):
 *   1. Net Pay summary — big, live-updating, sole hero
 *   2. Earnings + Deductions side by side — all editable in one scan
 *   3. Note
 *   4. (Collapsed) AutoPilot calculation breakdown
 *
 * Read-only AutoPilot details are tucked into a disclosure so they don't
 * compete with the inputs HR is actually here to change.
 */
export function AdjustPayslipDialog({ payslip, open, onOpenChange, onSaved }: Props) {
  const [bonus, setBonus] = useState<number>(payslip.bonus)
  const [leaveEncashment, setLeaveEncashment] = useState<number>(payslip.leaveEncashment)
  const [arrears, setArrears] = useState<number>(payslip.arrears)
  const [otherAllowance, setOtherAllowance] = useState<number>(payslip.otherAllowance)
  const [providentFund, setProvidentFund] = useState<number>(payslip.providentFund)
  const [healthcare, setHealthcare] = useState<number>(payslip.healthcare)
  const [loanDeduction, setLoanDeduction] = useState<number>(payslip.loanDeduction)
  const [advanceDeduction, setAdvanceDeduction] = useState<number>(payslip.advanceDeduction)
  const [otherDeductions, setOtherDeductions] = useState<number>(payslip.otherDeductions)
  const [note, setNote] = useState<string>(payslip.adjustmentNote ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // AutoPilot-derived totals (stay constant during this dialog session).
  const autoEarnings =
    payslip.basic + payslip.houseRent + payslip.utilities + payslip.food +
    payslip.fuel + payslip.medicalAllowance + payslip.overtimePay
  const autoDeductions = payslip.eobi + payslip.incomeTax

  // Live recalculation of the only number HR cares about: Net Pay.
  const totalEarnings   = autoEarnings + bonus + leaveEncashment + arrears + otherAllowance
  const totalDeductions = autoDeductions + providentFund + healthcare + loanDeduction + advanceDeduction + otherDeductions
  const previewNet      = totalEarnings - totalDeductions
  const netDelta        = previewNet - payslip.netSalary

  async function save() {
    setError(''); setSaving(true)
    const res = await fetch(`/api/payroll/payslips/${payslip.id}/adjust`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bonus, leaveEncashment, arrears, otherAllowance, providentFund, healthcare, loanDeduction, advanceDeduction, otherDeductions, adjustmentNote: note }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Save failed'); return }
    onOpenChange(false)
    onSaved()
  }

  async function clearAdjustment() {
    if (!confirm(`Reset ${payslip.employeeName}'s payslip to the AutoPilot values? Your overrides will be removed.`)) return
    setSaving(true)
    const res = await fetch(`/api/payroll/payslips/${payslip.id}/adjust`, { method: 'DELETE' })
    setSaving(false)
    if (!res.ok) { setError('Failed to clear adjustment'); return }
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-slate-100 pb-3">
          <DialogTitle className="flex items-baseline gap-2">
            <span>Adjust Payslip</span>
            <span className="text-sm font-normal text-slate-500">— {payslip.employeeName}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Hero: live Net Pay */}
        <div className="bg-gradient-to-br from-slate-50 to-blue-50/60 rounded-xl p-5 border border-slate-200">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Net Pay</p>
              <p className="text-3xl font-bold text-slate-900 tabular-nums mt-1">{formatCurrency(previewNet)}</p>
              {Math.round(netDelta) !== 0 && (
                <p className={`text-xs mt-1 tabular-nums ${netDelta > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {netDelta > 0 ? '+' : '−'}{formatCurrency(Math.abs(netDelta))} vs AutoPilot
                </p>
              )}
            </div>
            <div className="text-right text-xs text-slate-500 space-y-0.5">
              <p>Earnings · <span className="font-semibold text-slate-900 tabular-nums">{formatCurrency(totalEarnings)}</span></p>
              <p>Deductions · <span className="font-semibold text-rose-600 tabular-nums">−{formatCurrency(totalDeductions)}</span></p>
            </div>
          </div>
        </div>

        {/* Earnings + Deductions side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Earnings (+)</p>
              <p className="text-[11px] text-slate-400">AutoPilot: {formatCurrency(autoEarnings)}</p>
            </div>
            <div className="space-y-2.5">
              <CurrencyInput label="Bonus"             value={bonus}            onChange={setBonus} />
              <CurrencyInput label="Arrears"           value={arrears}          onChange={setArrears} />
              <CurrencyInput label="Leave Encashment"  value={leaveEncashment}  onChange={setLeaveEncashment} />
              <CurrencyInput label="Other Allowance"   value={otherAllowance}   onChange={setOtherAllowance} />
            </div>
          </section>

          <section>
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">Deductions (−)</p>
              <p className="text-[11px] text-slate-400">AutoPilot: {formatCurrency(autoDeductions)}</p>
            </div>
            <div className="space-y-2.5">
              <CurrencyInput label="Provident Fund"      value={providentFund}    onChange={setProvidentFund} />
              <CurrencyInput label="Healthcare"          value={healthcare}       onChange={setHealthcare} />
              <CurrencyInput label="Loan / Vehicle"      value={loanDeduction}    onChange={setLoanDeduction} />
              <CurrencyInput label="Advance Recovery"   value={advanceDeduction} onChange={setAdvanceDeduction} />
              <CurrencyInput label="Other Deductions"   value={otherDeductions}  onChange={setOtherDeductions} />
            </div>
          </section>
        </div>

        {/* Note */}
        <div className="mt-4">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
            Reason / Note
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. Q1 performance bonus, 10 days leave encashed, loan instalment #4 of 12"
            className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        {/* Tucked-away AutoPilot breakdown */}
        <details className="mt-4 group">
          <summary className="flex items-center justify-between cursor-pointer text-xs text-slate-500 hover:text-slate-700 select-none py-1">
            <span className="inline-flex items-center gap-1">
              <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
              AutoPilot calculation
            </span>
            <a
              href={`/dashboard/employees/${payslip.employeeId}?tab=compensation`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
            >
              Edit base salary <ExternalLink className="w-3 h-3" />
            </a>
          </summary>
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs space-y-3">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Earnings (from salary record + attendance + OT)</p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
                <Row label="Basic" value={payslip.basic} />
                <Row label="House Rent" value={payslip.houseRent} />
                <Row label="Utilities" value={payslip.utilities} />
                <Row label="Food" value={payslip.food} />
                <Row label="Fuel" value={payslip.fuel} />
                <Row label="Medical" value={payslip.medicalAllowance} />
                <Row label="Overtime" value={payslip.overtimePay} />
              </dl>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Statutory Deductions</p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
                <Row label="EOBI" value={payslip.eobi} negative />
                <Row label="Income Tax" value={payslip.incomeTax} negative />
              </dl>
            </div>
            <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">
              Change basic / allowances in <span className="font-medium">People → Compensation</span>, OT in <span className="font-medium">Time → Approvals</span>,
              EOBI/Tax in <span className="font-medium">Settings → Payroll Config</span>. Then click <span className="font-medium">Recompute</span> on the run.
            </p>
          </div>
        </details>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2 mt-3">{error}</p>
        )}

        <DialogFooter className="gap-2 mt-2">
          {payslip.isAdjusted && (
            <Button variant="outline" onClick={clearAdjustment} disabled={saving} className="mr-auto text-rose-600 hover:text-rose-700">
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Reset to AutoPilot
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Adjustment'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Single currency input row — label left, money input right. */
function CurrencyInput({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-slate-700 flex-1 min-w-0 truncate">{label}</label>
      <div className="relative w-36 flex-shrink-0">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-medium">PKR</span>
        <Input
          type="number"
          min={0}
          step={1}
          value={value || ''}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="pl-10 text-right tabular-nums h-9"
          placeholder="0"
        />
      </div>
    </div>
  )
}

/** Compact label/value row used inside the AutoPilot breakdown disclosure. */
function Row({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium tabular-nums ${negative ? 'text-rose-600' : 'text-slate-900'}`}>
        {negative && value > 0 ? '−' : ''}{formatCurrency(value)}
      </span>
    </div>
  )
}
