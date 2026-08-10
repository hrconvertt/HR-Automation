'use client'

/**
 * Bank transfer file — the first table on the payroll page.
 *
 * This is a live, editable view of exactly what GET /api/payroll/[id]/export
 * writes to xlsx, so what HR sees here is what the bank receives. Columns match
 * the bank templates verbatim:
 *
 *   IFT  (Faysal, same-bank):  Beneficiary First Name | Beneficiary Account No |
 *                              Transaction Amount | Reference # 1 | Reference # 9 | Note
 *   IBFT (all other banks):    Beneficiary First Name | Beneficiary Account No | Bank |
 *                              Transaction Amount | Reference # 1 | Reference # 9 | Notes
 *
 * The IFT/IBFT split is decided by the account IBAN (Faysal → IFT), so the
 * dropdown selects which file you are looking at rather than re-classifying
 * anyone. Editing an account number can move a row between the two.
 */

import { useState, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
const money = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 2 })
import { bankCodeFromIban, isFaysalIban } from '@/lib/bank-codes'
import { Save, Download, Landmark, AlertCircle, Eye, Printer, X, Pencil } from 'lucide-react'
import { safeFetch } from '@/lib/safe-fetch'
import type { GridPayslip, GridRole } from './payroll-grid-editor'

export type BankFormat = 'IFT' | 'IBFT'

interface Props {
  runId: string
  month: number
  year: number
  payslips: GridPayslip[]
  role: GridRole
  runStatus: string
  onSaved: () => void
}

const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

type BankCell = 'ibanAccount' | 'transactionAmount' | 'payoutNotes'

export function BankTransferGrid({
  runId, month, year, payslips, role, runStatus, onSaved,
}: Props) {
  const [format, setFormat] = useState<BankFormat>('IBFT')
  const [edits, setEdits] = useState<Record<string, Partial<Record<BankCell, string | number>>>>({})
  const [busy, setBusy] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  // The whole table goes into edit mode at once, rather than every cell
  // sitting there as a live input. A bank file is read far more often than it
  // is changed, and a page full of boxes invites a stray keystroke into an
  // account number.
  const [editing, setEditing] = useState(false)

  // Drop pending edits when the underlying run/rows change. Done during render
  // (React's documented "adjusting state when props change" pattern) rather
  // than in an effect, which would cause a cascading re-render.
  const rowsKey = `${runId}:${payslips.length}`
  const [seenKey, setSeenKey] = useState(rowsKey)
  if (seenKey !== rowsKey) {
    setSeenKey(rowsKey)
    setEdits({})
  }

  const canEdit = role === 'HR'
  const dirty = Object.keys(edits).length > 0
  const reference = `Salary ${MONTHS_FULL[month - 1]} ${year}`

  const allRows = useMemo(() => payslips.map((p) => {
    const e = edits[p.id] ?? {}
    const iban = (e.ibanAccount as string | undefined)
      ?? p.employee.ibanAccount ?? p.employee.bankAccount ?? ''
    return {
      p,
      iban,
      bank: bankCodeFromIban(iban) || (p.employee.bankName ?? ''),
      amount: (e.transactionAmount as number | undefined)
        ?? (p.transactionAmount ?? p.netSalary),
      notes: (e.payoutNotes as string | undefined) ?? p.payoutNotes ?? '',
      isIft: isFaysalIban(iban),
      edited: new Set(Object.keys(e)),
    }
  }), [payslips, edits])

  const iftCount = allRows.filter((r) => r.isIft).length
  const ibftCount = allRows.length - iftCount
  const rows = allRows.filter((r) => (format === 'IFT' ? r.isIft : !r.isIft))
  const total = rows.reduce((s, r) => s + r.amount, 0)

  const setCell = useCallback((id: string, field: BankCell, value: string | number, original: string | number) => {
    setEdits((prev) => {
      const next = { ...prev }
      const row = { ...(next[id] ?? {}) }
      const same = typeof original === 'number' && typeof value === 'number'
        ? Math.abs(original - value) < 0.001
        : (original ?? '') === (value ?? '')
      if (same) delete row[field]
      else row[field] = value
      if (Object.keys(row).length === 0) delete next[id]
      else next[id] = row
      return next
    })
  }, [])

  async function save() {
    if (!dirty) return
    setBusy(true)
    const updates = Object.entries(edits).map(([payslipId, fields]) => ({ payslipId, ...fields }))
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

  const isDraft = runStatus === 'DRAFT'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-900">Bank Transfer File</h3>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as BankFormat)}
            aria-label="Transfer type"
            className="text-xs font-semibold px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700"
          >
            <option value="IBFT">IBFT — other banks ({ibftCount})</option>
            <option value="IFT">IFT — Faysal ({iftCount})</option>
          </select>
          {dirty && (
            <Badge variant="warning" className="text-[10px]">
              <AlertCircle className="w-3 h-3 mr-1" /> {Object.keys(edits).length} unsaved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <Button onClick={() => setEditing(true)} variant="outline" size="sm">
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit table
            </Button>
          )}
          {canEdit && editing && (
            <>
              <Button
                onClick={() => {
                  // Leaving edit mode throws away anything unsaved, so say so
                  // rather than discarding a row somebody just retyped.
                  if (dirty && !confirm(
                    `Discard ${Object.keys(edits).length} unsaved row`
                    + `${Object.keys(edits).length === 1 ? '' : 's'}?`,
                  )) return
                  setEdits({})
                  setEditing(false)
                }}
                variant="outline"
                size="sm"
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => { await save(); setEditing(false) }}
                disabled={!dirty || busy}
                size="sm"
                className="bg-slate-700 hover:bg-slate-700 text-white"
              >
                <Save className="w-3.5 h-3.5 mr-1.5" /> {busy ? 'Saving…' : 'Save Changes'}
              </Button>
            </>
          )}
          <Button
            onClick={() => setPreviewOpen(true)}
            variant="outline"
            size="sm"
            title={`See the ${format} file before sending it to the bank`}
          >
            <Eye className="w-3.5 h-3.5 mr-1.5" /> Preview {format}
          </Button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {format === 'IFT'
          ? 'Faysal-to-Faysal transfers. No bank column — the bank is implicit.'
          : 'Transfers to banks other than Faysal. The bank code comes from the account number.'}
        {canEdit && (editing
          ? ' Account number, amount and note are editable; everything else is derived.'
          : ' Use Edit table to change an account number, an amount or a note.')} All amounts PKR.
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-[12px] leading-5" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <BankTh>Beneficiary First Name</BankTh>
              <BankTh>Beneficiary Account No</BankTh>
              {format === 'IBFT' && <BankTh>Bank</BankTh>}
              <BankTh right>Transaction Amount</BankTh>
              <BankTh>Reference # 1</BankTh>
              <BankTh>Reference # 9</BankTh>
              <BankTh>{format === 'IFT' ? 'Note' : 'Notes'}</BankTh>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={format === 'IBFT' ? 7 : 6} className="py-8 text-center text-slate-400">
                  No {format} rows this month.
                </td>
              </tr>
            ) : rows.map((r) => (
              <tr key={r.p.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">{r.p.employee.fullName}</td>
                <BankCellInput
                  value={r.iban}
                  editable={canEdit && editing}
                  edited={r.edited.has('ibanAccount')}
                  mono
                  onChange={(v) => setCell(r.p.id, 'ibanAccount', String(v),
                    r.p.employee.ibanAccount ?? r.p.employee.bankAccount ?? '')}
                />
                {format === 'IBFT' && <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.bank || '—'}</td>}
                <BankCellInput
                  value={r.amount}
                  editable={canEdit && editing}
                  edited={r.edited.has('transactionAmount')}
                  numeric right bold
                  onChange={(v) => setCell(r.p.id, 'transactionAmount', Number(v) || 0,
                    r.p.transactionAmount ?? r.p.netSalary)}
                />
                <td className="px-3 py-2 text-slate-500 text-[11px] whitespace-nowrap">{reference}</td>
                <td className="px-3 py-2 text-slate-500 text-[11px] whitespace-nowrap">{reference}</td>
                <BankCellInput
                  value={r.notes}
                  editable={canEdit && editing}
                  edited={r.edited.has('payoutNotes')}
                  onChange={(v) => setCell(r.p.id, 'payoutNotes', String(v), r.p.payoutNotes ?? '')}
                />
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-slate-50 font-semibold text-slate-700">
              <tr className="border-t-2 border-slate-200">
                <td colSpan={format === 'IBFT' ? 3 : 2} className="px-3 py-2 text-right whitespace-nowrap">
                  {rows.length} {format} transfer{rows.length === 1 ? '' : 's'}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{money(total)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto print:static print:bg-white print:p-0 print:block"
          role="dialog"
          aria-modal="true"
          aria-label={`${format} transfer file preview`}
          onClick={() => setPreviewOpen(false)}
        >
          {/* Print rules live with the dialog so printing shows only the file,
              without the app chrome behind it. Scoped to an id so nothing else
              on the page is affected. */}
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #bank-file-print, #bank-file-print * { visibility: visible !important; }
              #bank-file-print { position: absolute; left: 0; top: 0; width: 100%; }
              .print-hide { display: none !important; }
            }
          `}</style>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-5xl my-4 print:shadow-none print:rounded-none print:my-0 print:max-w-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 print-hide">
              <h2 className="text-sm font-semibold text-slate-900">
                {format} Transfer File — {reference}
              </h2>
              <button
                onClick={() => setPreviewOpen(false)}
                aria-label="Close preview"
                className="text-slate-400 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div id="bank-file-print" className="p-5">
              <div className="mb-4">
                <h1 className="text-base font-bold text-slate-900">Convertt — {format} Transfer File</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {reference} · {rows.length} transfer{rows.length === 1 ? '' : 's'} · Total PKR {money(total)}
                </p>
              </div>
              <table className="min-w-full text-[11px] leading-5 border border-slate-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead className="bg-slate-100">
                  <tr>
                    <PrintTh>Beneficiary First Name</PrintTh>
                    <PrintTh>Beneficiary Account No</PrintTh>
                    {format === 'IBFT' && <PrintTh>Bank</PrintTh>}
                    <PrintTh right>Transaction Amount</PrintTh>
                    <PrintTh>Reference # 1</PrintTh>
                    <PrintTh>Reference # 9</PrintTh>
                    <PrintTh>{format === 'IFT' ? 'Note' : 'Notes'}</PrintTh>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={format === 'IBFT' ? 7 : 6} className="border border-slate-300 py-6 text-center text-slate-400">
                        No {format} rows this month.
                      </td>
                    </tr>
                  ) : rows.map((r) => (
                    <tr key={r.p.id}>
                      <PrintTd>{r.p.employee.fullName}</PrintTd>
                      <PrintTd mono>{r.iban || '—'}</PrintTd>
                      {format === 'IBFT' && <PrintTd>{r.bank || '—'}</PrintTd>}
                      <PrintTd right>{money(r.amount)}</PrintTd>
                      <PrintTd>{reference}</PrintTd>
                      <PrintTd>{reference}</PrintTd>
                      <PrintTd>{r.notes || ''}</PrintTd>
                    </tr>
                  ))}
                </tbody>
                {rows.length > 0 && (
                  <tfoot className="bg-slate-100 font-semibold">
                    <tr>
                      <PrintTd colSpan={format === 'IBFT' ? 3 : 2} right>
                        {rows.length} {format} transfer{rows.length === 1 ? '' : 's'}
                      </PrintTd>
                      <PrintTd right>{money(total)}</PrintTd>
                      <PrintTd colSpan={3}>{''}</PrintTd>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 print-hide">
              {dirty && (
                <span className="mr-auto text-[11px] text-amber-700">
                  Showing unsaved edits — save before downloading so the bank file matches.
                </span>
              )}
              <Button onClick={() => window.print()} variant="outline" size="sm">
                <Printer className="w-3.5 h-3.5 mr-1.5" /> Print / Save as PDF
              </Button>
              <Button
                onClick={() => window.open(`/api/payroll/${runId}/export?format=${format}`, '_blank')}
                size="sm"
                disabled={isDraft}
                className="bg-slate-700 hover:bg-slate-700 text-white"
                title={isDraft ? 'The bank file downloads once the run leaves DRAFT' : `Download Paid_${format}_… .xlsx`}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" /> Download Excel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PrintTh({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`border border-slate-300 px-2 py-1.5 font-semibold uppercase tracking-wide text-[9px] ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function PrintTd({ children, right, mono, colSpan }: {
  children: React.ReactNode; right?: boolean; mono?: boolean; colSpan?: number
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border border-slate-300 px-2 py-1.5 ${right ? 'text-right' : 'text-left'} ${mono ? 'font-mono' : ''}`}
    >
      {children}
    </td>
  )
}


function BankTh({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function BankCellInput({
  value, editable, edited, onChange, numeric, right, bold, mono,
}: {
  value: string | number
  editable: boolean
  edited: boolean
  onChange: (v: string | number) => void
  numeric?: boolean
  right?: boolean
  bold?: boolean
  mono?: boolean
}) {
  const display = numeric ? money(Number(value)) : String(value)
  const tdClass = `px-3 py-2 whitespace-nowrap ${right ? 'text-right' : ''} ${bold ? 'font-semibold' : ''} ${edited ? 'bg-amber-50' : ''}`

  if (!editable) {
    return <td className={`${tdClass} text-slate-700 ${mono ? 'font-mono text-[11px]' : ''}`}>{display || '—'}</td>
  }
  return (
    <td className={tdClass}>
      <input
        type={numeric ? 'number' : 'text'}
        defaultValue={String(value ?? '')}
        key={`${value}`}
        onBlur={(e) => onChange(numeric ? Number(e.target.value) : e.target.value)}
        className={`w-full bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-slate-300 rounded px-1 py-0.5 ${
          right ? 'text-right' : ''} ${bold ? 'font-semibold' : ''} ${mono ? 'font-mono text-[11px]' : ''}`}
      />
    </td>
  )
}
