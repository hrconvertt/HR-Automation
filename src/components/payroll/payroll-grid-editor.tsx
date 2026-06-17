'use client'

/**
 * Spreadsheet-style payroll editor.
 *
 *   Each row = one Payslip. Columns mirror the bank IBFT/IFT export format
 *   plus payroll detail (Gross, Deductions, OT, Late, Status). Click a cell
 *   to edit; blur saves to local state. Edited cells get a yellow tint until
 *   "Save Changes" runs.
 *
 *   Two top-level actions (rendered in the parent view):
 *     - Save Changes  → POST /api/payroll/[id]/bulk-update
 *     - Close & Send  → POST /api/payroll/[id]/transition (advances stage)
 *
 *   Role-based column locks come from the `canEdit` predicate map passed in.
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { bankCodeFromIban } from '@/lib/bank-codes'
import {
  Save, Send, Undo2, FileSpreadsheet, FileText, Pencil, AlertCircle, CheckCircle2,
} from 'lucide-react'
import { safeFetch } from '@/lib/safe-fetch'

export interface GridPayslip {
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
  lateDeduction: number
  netSalary: number
  transactionAmount: number | null
  payoutNotes: string | null
  status: string
  adjustmentNote: string | null
  isAdjusted: boolean
}

export type GridRole = 'HR' | 'CEO' | 'FINANCE' | 'READONLY'

interface Props {
  runId: string
  month: number
  year: number
  payslips: GridPayslip[]
  role: GridRole
  runStatus: string
  onSaved: () => void
  onAdvanced: () => void
  onEditDetails?: (payslipId: string) => void
}

type CellKey =
  | 'ibanAccount'
  | 'grossSalary'
  | 'otherDeductions'
  | 'overtimePay'
  | 'lateDeduction'
  | 'transactionAmount'
  | 'payoutNotes'
  | 'status'

const ROLE_EDIT_MAP: Record<GridRole, Set<CellKey>> = {
  HR: new Set([
    'ibanAccount', 'grossSalary', 'otherDeductions', 'overtimePay',
    'lateDeduction', 'transactionAmount', 'payoutNotes', 'status',
  ]),
  CEO: new Set(['payoutNotes']),
  FINANCE: new Set(['status', 'payoutNotes']),
  READONLY: new Set(),
}

const STATUS_OPTIONS = ['PENDING', 'ON_HOLD', 'PAID', 'DRAFT']

export function PayrollGridEditor({
  runId, month, year, payslips, role, runStatus, onSaved, onAdvanced, onEditDetails,
}: Props) {
  // edits[payslipId][field] = value
  const [edits, setEdits] = useState<Record<string, Record<string, string | number | null>>>({})
  const [busy, setBusy] = useState(false)
  const [showSendDialog, setShowSendDialog] = useState(false)
  const [sendBackReason, setSendBackReason] = useState('')
  const [showSendBack, setShowSendBack] = useState(false)

  // Reset edits when the underlying payslips change
  useEffect(() => { setEdits({}) }, [runId, payslips.length])

  const dirty = Object.keys(edits).length > 0
  const editable = ROLE_EDIT_MAP[role]

  const rows = useMemo(() => {
    return payslips.map((p) => {
      const e = edits[p.id] ?? {}
      const iban = (e.ibanAccount as string | undefined) ?? p.employee.ibanAccount ?? p.employee.bankAccount ?? ''
      return {
        p,
        iban,
        bank: bankCodeFromIban(iban) || (p.employee.bankName ?? ''),
        grossSalary: (e.grossSalary as number | undefined) ?? p.grossSalary,
        otherDeductions: (e.otherDeductions as number | undefined) ?? p.otherDeductions,
        overtimePay: (e.overtimePay as number | undefined) ?? p.overtimePay,
        lateDeduction: (e.lateDeduction as number | undefined) ?? p.lateDeduction,
        transactionAmount:
          (e.transactionAmount as number | undefined) ??
          (p.transactionAmount ?? p.netSalary),
        payoutNotes: (e.payoutNotes as string | undefined) ?? p.payoutNotes ?? '',
        status: (e.status as string | undefined) ?? p.status,
        editedFields: new Set(Object.keys(e)),
      }
    })
  }, [payslips, edits])

  const setCell = useCallback((payslipId: string, field: CellKey, value: string | number | null, original: string | number | null) => {
    setEdits((prev) => {
      const next = { ...prev }
      const row = { ...(next[payslipId] ?? {}) }
      // If the new value equals the original, drop this field (and the row if empty)
      const same =
        typeof original === 'number' && typeof value === 'number'
          ? Math.abs(original - value) < 0.001
          : (original ?? '') === (value ?? '')
      if (same) {
        delete row[field]
      } else {
        row[field] = value
      }
      if (Object.keys(row).length === 0) delete next[payslipId]
      else next[payslipId] = row
      return next
    })
  }, [])

  async function save() {
    if (!dirty) return
    setBusy(true)
    const updates = Object.entries(edits).map(([payslipId, fields]) => ({
      payslipId, ...fields,
    }))
    const r = await safeFetch(`/api/payroll/${runId}/bulk-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    setBusy(false)
    if (!r.ok) { alert(r.error ?? 'Save failed'); return }
    setEdits({})
    onSaved()
  }

  const ROLE_ACTION_LABEL: Record<GridRole, string | null> = {
    HR: runStatus === 'DRAFT' ? 'Close & Send to CEO'
      : runStatus === 'PENDING_HR_FINAL' ? 'Approve & Release to Finance' : null,
    CEO: runStatus === 'PENDING_CEO' ? 'Close & Send to Finance' : null,
    FINANCE: runStatus === 'PENDING_FINANCE' ? 'Mark as Paid' : null,
    READONLY: null,
  }
  const ROLE_ACTION_MAP: Record<GridRole, string | null> = {
    HR: runStatus === 'DRAFT' ? 'SUBMIT_TO_CEO'
      : runStatus === 'PENDING_HR_FINAL' ? 'HR_FINAL_APPROVE' : null,
    CEO: runStatus === 'PENDING_CEO' ? 'CEO_APPROVE' : null,
    FINANCE: runStatus === 'PENDING_FINANCE' ? 'MARK_PAID' : null,
    READONLY: null,
  }
  const actionLabel = ROLE_ACTION_LABEL[role]
  const action = ROLE_ACTION_MAP[role]
  const canSendBack = role === 'CEO' || role === 'FINANCE'

  async function advance(act: string, reason?: string) {
    setBusy(true)
    const r = await safeFetch(`/api/payroll/${runId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: act, reason }),
    })
    setBusy(false)
    if (!r.ok) { alert(r.error ?? 'Action failed'); return }
    onAdvanced()
  }

  function download(format: 'IFT' | 'IBFT' | 'BOTH') {
    window.open(`/api/payroll/${runId}/export?format=${format}`, '_blank')
  }

  const monthsShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-900">
            Spreadsheet Editor — {monthsShort[month - 1]} {year}
          </h3>
          {dirty && (
            <Badge variant="warning" className="text-[10px]">
              <AlertCircle className="w-3 h-3 mr-1" /> {Object.keys(edits).length} unsaved
            </Badge>
          )}
          {!dirty && Object.keys(edits).length === 0 && payslips.some((p) => p.isAdjusted) && (
            <Badge variant="secondary" className="text-[10px]">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Saved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => download('IFT')} variant="outline" size="sm">
            <FileText className="w-3.5 h-3.5 mr-1.5" /> IFT (Faysal)
          </Button>
          <Button onClick={() => download('IBFT')} variant="outline" size="sm">
            <FileText className="w-3.5 h-3.5 mr-1.5" /> IBFT (Others)
          </Button>
          <Button onClick={() => download('BOTH')} variant="outline" size="sm">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> Combined
          </Button>
          {editable.size > 0 && (
            <Button
              onClick={save}
              disabled={!dirty || busy}
              className="bg-slate-700 hover:bg-slate-700 text-white"
              size="sm"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" /> {busy ? 'Saving…' : 'Save Changes'}
            </Button>
          )}
          {canSendBack && (
            <Button
              onClick={() => setShowSendBack(true)}
              disabled={busy}
              variant="outline"
              size="sm"
              className="text-slate-700 border-slate-200 hover:bg-slate-50"
            >
              <Undo2 className="w-3.5 h-3.5 mr-1.5" /> Send Back
            </Button>
          )}
          {actionLabel && action && (
            <Button
              onClick={() => setShowSendDialog(true)}
              disabled={busy || dirty}
              className="bg-slate-700 hover:bg-slate-700 text-white"
              size="sm"
              title={dirty ? 'Save changes first' : ''}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" /> {actionLabel}
            </Button>
          )}
        </div>
      </div>

      {/* Hint */}
      {editable.size > 0 && (
        <p className="text-xs text-slate-500">
          Click any editable cell to type. Yellow cells = unsaved changes.
          {role === 'HR' && ' Save Changes commits to DB. Close & Send advances the stage.'}
          {role === 'CEO' && ' You can add review notes. Send Back returns to HR with a reason.'}
          {role === 'FINANCE' && ' Mark each row PAID/ON_HOLD, then Mark as Paid to finalize.'}
        </p>
      )}

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <Th>Employee</Th>
              <Th>IBAN</Th>
              <Th>Bank</Th>
              <Th right>Gross</Th>
              <Th right>Deductions</Th>
              <Th right>Overtime / Bonus</Th>
              <Th right>Late / Leave Ded.</Th>
              <Th right>Net (Txn Amt)</Th>
              <Th>Reference</Th>
              <Th>Notes</Th>
              <Th>Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-8 text-center text-slate-400">No payslips.</td>
              </tr>
            ) : rows.map((r) => {
              const reference = `Salary ${['January','February','March','April','May','June','July','August','September','October','November','December'][month - 1]} ${year}`
              return (
                <tr key={r.p.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-2 py-1.5 align-top">
                    <div className="flex items-center gap-1.5">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{r.p.employee.fullName}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{r.p.employee.employeeCode}</p>
                      </div>
                      {r.p.isAdjusted && (
                        <span title={r.p.adjustmentNote ?? 'Adjusted'} className="text-[9px] text-slate-700 bg-slate-50 px-1 rounded">ADJ</span>
                      )}
                    </div>
                  </td>
                  <EditableCell
                    value={r.iban}
                    editable={editable.has('ibanAccount')}
                    edited={r.editedFields.has('ibanAccount')}
                    onChange={(v) => setCell(r.p.id, 'ibanAccount', String(v), r.p.employee.ibanAccount ?? r.p.employee.bankAccount ?? '')}
                    mono
                  />
                  <td className="px-2 py-1.5 text-slate-700">{r.bank || '—'}</td>
                  <EditableCell
                    value={r.grossSalary}
                    editable={editable.has('grossSalary')}
                    edited={r.editedFields.has('grossSalary')}
                    onChange={(v) => setCell(r.p.id, 'grossSalary', Number(v) || 0, r.p.grossSalary)}
                    numeric
                    right
                  />
                  <EditableCell
                    value={r.otherDeductions}
                    editable={editable.has('otherDeductions')}
                    edited={r.editedFields.has('otherDeductions')}
                    onChange={(v) => setCell(r.p.id, 'otherDeductions', Number(v) || 0, r.p.otherDeductions)}
                    numeric
                    right
                  />
                  <EditableCell
                    value={r.overtimePay}
                    editable={editable.has('overtimePay')}
                    edited={r.editedFields.has('overtimePay')}
                    onChange={(v) => setCell(r.p.id, 'overtimePay', Number(v) || 0, r.p.overtimePay)}
                    numeric
                    right
                  />
                  <EditableCell
                    value={r.lateDeduction}
                    editable={editable.has('lateDeduction')}
                    edited={r.editedFields.has('lateDeduction')}
                    onChange={(v) => setCell(r.p.id, 'lateDeduction', Number(v) || 0, r.p.lateDeduction)}
                    numeric
                    right
                  />
                  <EditableCell
                    value={r.transactionAmount}
                    editable={editable.has('transactionAmount')}
                    edited={r.editedFields.has('transactionAmount')}
                    onChange={(v) => setCell(r.p.id, 'transactionAmount', Number(v) || 0, r.p.transactionAmount ?? r.p.netSalary)}
                    numeric
                    right
                    bold
                  />
                  <td className="px-2 py-1.5 text-slate-500 text-[11px]">{reference}</td>
                  <EditableCell
                    value={r.payoutNotes}
                    editable={editable.has('payoutNotes')}
                    edited={r.editedFields.has('payoutNotes')}
                    onChange={(v) => setCell(r.p.id, 'payoutNotes', String(v), r.p.payoutNotes ?? '')}
                  />
                  <td className="px-2 py-1.5">
                    {editable.has('status') ? (
                      <select
                        value={r.status}
                        onChange={(e) => setCell(r.p.id, 'status', e.target.value, r.p.status)}
                        className={`text-[11px] px-1.5 py-0.5 rounded border ${
                          r.editedFields.has('status') ? 'bg-slate-50 border-slate-200' : 'border-slate-200'
                        }`}
                      >
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <Badge variant={r.status === 'PAID' ? 'success' : r.status === 'ON_HOLD' ? 'warning' : 'secondary'}>
                        {r.status}
                      </Badge>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {onEditDetails && role === 'HR' && (
                      <button
                        onClick={() => onEditDetails(r.p.id)}
                        title="Open full salary breakdown"
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
          {rows.length > 0 && (
            <tfoot className="bg-slate-50 font-semibold text-slate-700">
              <tr className="border-t-2 border-slate-200">
                <td colSpan={3} className="px-2 py-2 text-right">Totals</td>
                <td className="px-2 py-2 text-right">{formatCurrency(rows.reduce((s, r) => s + r.grossSalary, 0))}</td>
                <td className="px-2 py-2 text-right">{formatCurrency(rows.reduce((s, r) => s + r.otherDeductions, 0))}</td>
                <td className="px-2 py-2 text-right">{formatCurrency(rows.reduce((s, r) => s + r.overtimePay, 0))}</td>
                <td className="px-2 py-2 text-right">{formatCurrency(rows.reduce((s, r) => s + r.lateDeduction, 0))}</td>
                <td className="px-2 py-2 text-right">{formatCurrency(rows.reduce((s, r) => s + r.transactionAmount, 0))}</td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Close & Send confirmation */}
      {showSendDialog && actionLabel && action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSendDialog(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">{actionLabel}</h3>
            <p className="text-sm text-slate-600">
              {role === 'HR' && 'This will lock the run for HR edits and send it to the CEO for review.'}
              {role === 'CEO' && 'This will send the payroll back to HR for final review before Finance pays out.'}
              {role === 'FINANCE' && 'This marks payroll as PAID. Employees will see their payslips.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSendDialog(false)} disabled={busy}>Cancel</Button>
              <Button
                onClick={() => { setShowSendDialog(false); advance(action) }}
                disabled={busy}
                className="bg-slate-700 hover:bg-slate-700 text-white"
              >
                <Send className="w-4 h-4 mr-1.5" /> Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Send Back dialog */}
      {showSendBack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSendBack(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">Send Back</h3>
            <p className="text-sm text-slate-600">The run returns to the prior stage. The reason is shared with the reviewer.</p>
            <textarea
              value={sendBackReason}
              onChange={(e) => setSendBackReason(e.target.value)}
              placeholder="Why are you sending this back?"
              className="w-full min-h-[100px] px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowSendBack(false); setSendBackReason('') }}>Cancel</Button>
              <Button
                onClick={() => {
                  const t = sendBackReason.trim()
                  if (t.length < 3) { alert('A reason is required.'); return }
                  setShowSendBack(false); setSendBackReason('')
                  advance('SEND_BACK', t)
                }}
                className="bg-slate-700 hover:bg-slate-700 text-white"
              >
                <Undo2 className="w-4 h-4 mr-1.5" /> Send Back
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-2 py-2 font-semibold uppercase tracking-wide text-[10px] ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function EditableCell({
  value, editable, edited, onChange, numeric, right, bold, mono,
}: {
  value: string | number | null
  editable: boolean
  edited: boolean
  onChange: (v: string | number) => void
  numeric?: boolean
  right?: boolean
  bold?: boolean
  mono?: boolean
}) {
  const display = value === null || value === undefined ? ''
    : numeric ? formatCurrency(Number(value)) : String(value)

  const tdClass = `px-2 py-1.5 ${right ? 'text-right' : ''} ${bold ? 'font-semibold' : ''} ${edited ? 'bg-slate-50' : ''}`

  if (!editable) {
    return <td className={`${tdClass} text-slate-700 ${mono ? 'font-mono text-[11px]' : ''}`}>{display || '—'}</td>
  }

  return (
    <td className={tdClass}>
      <input
        type={numeric ? 'number' : 'text'}
        defaultValue={value === null || value === undefined ? '' : String(value)}
        key={`${value}`}
        onBlur={(e) => onChange(numeric ? Number(e.target.value) : e.target.value)}
        className={`w-full bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-slate-300 rounded px-1 py-0.5 ${
          right ? 'text-right' : ''
        } ${bold ? 'font-semibold' : ''} ${mono ? 'font-mono text-[11px]' : ''}`}
      />
    </td>
  )
}
