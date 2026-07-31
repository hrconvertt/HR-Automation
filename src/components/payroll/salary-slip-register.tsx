'use client'

/**
 * Salary Slip Register — the second table on the payroll page.
 *
 * Columns are the Convertt salary slip's own columns, in the slip's order, so a
 * row read left-to-right is the printed slip read top-to-bottom:
 *
 *   Pay & Allowances : Basic Salary · House Rent · Utilities · Gross Salary ·
 *                      Food Allowance · Fuel Allowance · Over Time/Bonus ·
 *                      Arrears · Other Allowances · Monthly Allowance ·
 *                      Total Payments
 *   Deductions       : Income tax · EOBI · Health care · Deduction (Loan /
 *                      Monthly Vehicle) · Advance Deduction · Other Deductions ·
 *                      Total Deduction
 *   Net Pay
 *
 * Every figure is attributable: the Source column says where the row's numbers
 * came from (the Salary Master sheet, the bank file, an HR edit, or the
 * generator), so a number can always be traced back to a document.
 *
 * Editing opens the existing Adjust Payslip dialog, which already writes every
 * one of these fields — the inline bulk-update endpoint only accepts a subset.
 */

import { useMemo } from 'react'
import { FileText, Pencil } from 'lucide-react'
import type { GridRole } from './payroll-grid-editor'

export interface SlipRow {
  id: string
  employeeId: string
  employee: { fullName: string; employeeCode: string; designation?: string }
  basic: number
  houseRent: number
  utilities: number
  grossSalary: number
  food: number
  fuel: number
  overtimePay: number
  bonus: number
  arrears: number
  otherAllowance: number
  medicalAllowance: number
  incomeTax: number
  eobi: number
  healthcare: number
  loanDeduction: number
  vehicleDeduction: number
  advanceDeduction: number
  otherDeductions: number
  lateDeduction: number
  leaveEncashment: number
  netSalary: number
  isAdjusted: boolean
  adjustmentNote: string | null
}

interface Props {
  rows: SlipRow[]
  role: GridRole
  month: number
  year: number
  onEdit?: (payslipId: string) => void
}

/**
 * Plain grouped number — no "PKR" on every cell. Repeating the currency in
 * twenty columns is what forced values to wrap onto two lines; the unit is
 * stated once, in the table caption.
 */
const money = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 0 })

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Where this row's figures came from. The importer stamps rows loaded from the
 * Salary Master with that note, so anything carrying it is traceable to the
 * sheet; HR edits and generated rows are distinguishable from both.
 */
function attribution(r: SlipRow): { label: string; tone: string; title: string } {
  const note = r.adjustmentNote ?? ''
  if (/Salary Master/i.test(note)) {
    return { label: 'Salary Master', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', title: note }
  }
  if (/scaled to match|compensation change/i.test(note)) {
    return { label: 'Comp history', tone: 'bg-amber-50 text-amber-700 border-amber-200', title: note }
  }
  if (r.isAdjusted) {
    return { label: 'HR edit', tone: 'bg-sky-50 text-sky-700 border-sky-200', title: note || 'Manually adjusted by HR' }
  }
  return { label: 'Generated', tone: 'bg-slate-50 text-slate-600 border-slate-200', title: 'Calculated from pay components + attendance' }
}

export function SalarySlipRegister({ rows, role, month, year, onEdit }: Props) {
  const canEdit = role === 'HR'

  const computed = useMemo(() => rows.map((r) => {
    // Over Time/Bonus and Other Deductions are single lines on the slip, so the
    // model's separate fields are summed into them rather than dropped.
    const overtimeBonus = r.overtimePay + r.bonus
    const otherAllowances = r.otherAllowance + r.leaveEncashment
    const loanVehicle = r.loanDeduction + r.vehicleDeduction
    const otherDed = r.otherDeductions + r.lateDeduction
    const totalPayments =
      r.basic + r.houseRent + r.utilities + r.food + r.fuel +
      overtimeBonus + r.arrears + otherAllowances + r.medicalAllowance
    const totalDeduction = r.incomeTax + r.eobi + r.healthcare + loanVehicle + r.advanceDeduction + otherDed
    return { r, overtimeBonus, otherAllowances, loanVehicle, otherDed, totalPayments, totalDeduction }
  }), [rows])

  const t = computed.reduce((a, c) => ({
    basic: a.basic + c.r.basic,
    houseRent: a.houseRent + c.r.houseRent,
    utilities: a.utilities + c.r.utilities,
    gross: a.gross + c.r.grossSalary,
    food: a.food + c.r.food,
    fuel: a.fuel + c.r.fuel,
    ot: a.ot + c.overtimeBonus,
    arrears: a.arrears + c.r.arrears,
    other: a.other + c.otherAllowances,
    monthly: a.monthly + c.r.medicalAllowance,
    payments: a.payments + c.totalPayments,
    tax: a.tax + c.r.incomeTax,
    eobi: a.eobi + c.r.eobi,
    health: a.health + c.r.healthcare,
    loan: a.loan + c.loanVehicle,
    adv: a.adv + c.r.advanceDeduction,
    otherDed: a.otherDed + c.otherDed,
    ded: a.ded + c.totalDeduction,
    net: a.net + c.r.netSalary,
  }), {
    basic: 0, houseRent: 0, utilities: 0, gross: 0, food: 0, fuel: 0, ot: 0, arrears: 0,
    other: 0, monthly: 0, payments: 0, tax: 0, eobi: 0, health: 0, loan: 0, adv: 0,
    otherDed: 0, ded: 0, net: 0,
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <FileText className="w-4 h-4 text-slate-700" />
        <h3 className="text-sm font-semibold text-slate-900">
          Salary Slip Register — {MONTHS[month - 1]} {year}
        </h3>
        <span className="text-[11px] text-slate-500">
          {rows.length} slip{rows.length === 1 ? '' : 's'} · same columns as the issued salary slip · all figures PKR
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-[12px] leading-5" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              <th className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wide sticky left-0 bg-slate-100 z-10 border-r border-slate-300">Employee</th>
              <th colSpan={11} className="px-2 py-1.5 text-center font-semibold text-[10px] uppercase tracking-wide border-l border-slate-300">Pay &amp; Allowances</th>
              <th colSpan={7} className="px-2 py-1.5 text-center font-semibold text-[10px] uppercase tracking-wide border-l border-slate-300">Deductions</th>
              <th className="px-2 py-1.5 text-right font-semibold text-[10px] uppercase tracking-wide border-l border-slate-300">Net Pay</th>
              <th className="px-2 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wide border-l border-slate-300">Source</th>
              <th></th>
            </tr>
            <tr className="bg-slate-50 text-slate-600">
              <th className="px-3 py-2 text-left font-medium text-[10px] sticky left-0 bg-slate-50 z-10 border-r border-slate-300"></th>
              <SlipTh>Basic Salary</SlipTh>
              <SlipTh>House Rent</SlipTh>
              <SlipTh>Utilities</SlipTh>
              <SlipTh strong>Gross Salary</SlipTh>
              <SlipTh>Food Allow.</SlipTh>
              <SlipTh>Fuel Allow.</SlipTh>
              <SlipTh>Over Time/Bonus</SlipTh>
              <SlipTh>Arrears</SlipTh>
              <SlipTh>Other Allow.</SlipTh>
              <SlipTh>Monthly Allow.</SlipTh>
              <SlipTh strong>Total Payments</SlipTh>
              <SlipTh borderLeft>Income tax</SlipTh>
              <SlipTh>EOBI</SlipTh>
              <SlipTh>Health care</SlipTh>
              <SlipTh>Loan / Vehicle</SlipTh>
              <SlipTh>Advance Ded.</SlipTh>
              <SlipTh>Other Ded.</SlipTh>
              <SlipTh strong>Total Deduction</SlipTh>
              <SlipTh strong borderLeft></SlipTh>
              <th className="px-2 py-1.5 border-l border-slate-200"></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {computed.length === 0 ? (
              <tr><td colSpan={22} className="py-8 text-center text-slate-400">No payslips.</td></tr>
            ) : computed.map(({ r, overtimeBonus, otherAllowances, loanVehicle, otherDed, totalPayments, totalDeduction }) => {
              const src = attribution(r)
              return (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-3 py-2 sticky left-0 bg-white z-10 min-w-[180px] border-r border-slate-200">
                    <p className="font-medium text-slate-900 truncate">{r.employee.fullName}</p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">{r.employee.employeeCode}</p>
                  </td>
                  <Cell v={r.basic} />
                  <Cell v={r.houseRent} />
                  <Cell v={r.utilities} />
                  <Cell v={r.grossSalary} strong />
                  <Cell v={r.food} />
                  <Cell v={r.fuel} />
                  <Cell v={overtimeBonus} />
                  <Cell v={r.arrears} />
                  <Cell v={otherAllowances} />
                  <Cell v={r.medicalAllowance} />
                  <Cell v={totalPayments} strong />
                  <Cell v={r.incomeTax} borderLeft />
                  <Cell v={r.eobi} />
                  <Cell v={r.healthcare} />
                  <Cell v={loanVehicle} />
                  <Cell v={r.advanceDeduction} />
                  <Cell v={otherDed} />
                  <Cell v={totalDeduction} strong />
                  <Cell v={r.netSalary} strong borderLeft />
                  <td className="px-2 py-1.5 border-l border-slate-100">
                    <span title={src.title} className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded border ${src.tone}`}>
                      {src.label}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    {canEdit && onEdit && (
                      <button
                        onClick={() => onEdit(r.id)}
                        title="Edit every line on this slip"
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {computed.length > 0 && (
            <tfoot className="bg-slate-50 font-semibold text-slate-700">
              <tr className="border-t-2 border-slate-200">
                <td className="px-3 py-2 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">Totals</td>
                <Cell v={t.basic} /><Cell v={t.houseRent} /><Cell v={t.utilities} /><Cell v={t.gross} strong />
                <Cell v={t.food} /><Cell v={t.fuel} /><Cell v={t.ot} /><Cell v={t.arrears} />
                <Cell v={t.other} /><Cell v={t.monthly} /><Cell v={t.payments} strong />
                <Cell v={t.tax} borderLeft /><Cell v={t.eobi} /><Cell v={t.health} /><Cell v={t.loan} />
                <Cell v={t.adv} /><Cell v={t.otherDed} /><Cell v={t.ded} strong />
                <Cell v={t.net} strong borderLeft />
                <td colSpan={2} className="border-l border-slate-200"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-[11px] text-slate-500">
        Over Time/Bonus, Other Allowances, Loan / Vehicle and Other Deductions each combine
        the two stored fields the slip prints on one line. Source shows where a row&apos;s
        figures came from{canEdit ? '; the pencil opens every line for editing.' : '.'}
      </p>
    </div>
  )
}

function SlipTh({ children, strong, borderLeft }: { children?: React.ReactNode; strong?: boolean; borderLeft?: boolean }) {
  return (
    <th className={`px-3 py-2 text-right font-medium text-[10px] whitespace-nowrap ${strong ? 'font-bold text-slate-800' : ''} ${borderLeft ? 'border-l border-slate-200' : ''}`}>
      {children}
    </th>
  )
}

function Cell({ v, strong, borderLeft }: { v: number; strong?: boolean; borderLeft?: boolean }) {
  return (
    <td className={`px-3 py-2 text-right whitespace-nowrap ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'} ${borderLeft ? 'border-l border-slate-200' : ''}`}>
      {v ? money(v) : <span className="text-slate-300">–</span>}
    </td>
  )
}
