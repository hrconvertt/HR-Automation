'use client'

/**
 * Bank codes — the list the salary sheet is coded against.
 *
 * Every row edits in place and new banks are added at the bottom, because this
 * is a list that grows: a new employee turns up banking somewhere nobody has
 * used before, and that should not need a developer.
 *
 * Two codes per bank, deliberately. `bankCode` is what the bank's own salary
 * template wants; `ibanPrefix` is the four letters that actually appear inside
 * an IBAN, which is not always the same — UBL's IBANs read UNIL. Keeping both
 * is what lets an account number be recognised and a payment file be written
 * without one standing in for the other.
 */

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, Trash2, Check, Landmark } from 'lucide-react'

interface Bank {
  id: string
  bankName: string
  bankCode: string
  ibanPrefix: string | null
  swift: string | null
  isOwnBank: boolean
  notes: string | null
  isActive: boolean
}

const BLANK = {
  bankName: '', bankCode: '', ibanPrefix: '', swift: '', notes: '',
  isOwnBank: false, isActive: true,
}

export function BankCodeTable() {
  const [banks, setBanks] = useState<Bank[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ ...BLANK })

  const load = useCallback(() => {
    setLoading(true)
    return fetch('/api/bank-codes')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load the bank list'))))
      .then((d) => setBanks(d.banks ?? []))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  /** Save a single field the moment it loses focus. */
  async function patch(bank: Bank, field: keyof Bank, value: string | boolean) {
    if (bank[field] === value) return
    setBusy(bank.id); setErr(null)
    const res = await fetch('/api/bank-codes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bank.id, [field]: value }),
    })
    setBusy(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error ?? 'Could not save that.')
      return
    }
    load()
  }

  async function add() {
    setBusy('new'); setErr(null)
    const res = await fetch('/api/bank-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    setBusy(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error ?? 'Could not add it.')
      return
    }
    setDraft({ ...BLANK }); setAdding(false); load()
  }

  async function remove(bank: Bank) {
    if (!confirm(`Remove ${bank.bankName} from the list?`)) return
    setBusy(bank.id)
    await fetch(`/api/bank-codes?id=${bank.id}`, { method: 'DELETE' })
    setBusy(null)
    load()
  }

  if (loading) return <p className="text-sm text-slate-400 py-10 text-center">Loading…</p>

  const active = banks.filter((b) => b.isActive).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Banks" value={String(banks.length)} sub={`${active} in use`} />
        <Stat label="With an IBAN prefix" value={String(banks.filter((b) => b.ibanPrefix).length)} sub="recognised from an account number" />
        <Stat label="Our bank" value={banks.find((b) => b.isOwnBank)?.bankCode ?? '—'} sub="paid as IFT, no code needed" />
        <Stat label="Everyone else" value={String(banks.filter((b) => !b.isOwnBank).length)} sub="paid as IBFT, code required" />
      </div>

      {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Bank list</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Click any cell to change it — it saves when you click away.
            </p>
          </div>
          {!adding && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add a bank
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <Th>Bank</Th><Th>Salary code</Th><Th>IBAN prefix</Th>
                <Th>SWIFT</Th><Th>Transfer</Th><Th>Note</Th><Th>In use</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {banks.map((b) => (
                <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <Td><Cell value={b.bankName} onSave={(v) => patch(b, 'bankName', v)} wide /></Td>
                  <Td><Cell value={b.bankCode} onSave={(v) => patch(b, 'bankCode', v)} mono /></Td>
                  <Td><Cell value={b.ibanPrefix ?? ''} onSave={(v) => patch(b, 'ibanPrefix', v)} mono placeholder="—" /></Td>
                  <Td><Cell value={b.swift ?? ''} onSave={(v) => patch(b, 'swift', v)} mono placeholder="—" /></Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => patch(b, 'isOwnBank', !b.isOwnBank)}
                      className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        b.isOwnBank
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                      title={b.isOwnBank
                        ? 'Our own bank — paid as IFT, which carries no bank code'
                        : 'Another bank — paid as IBFT, which needs the code'}
                    >
                      {b.isOwnBank ? 'IFT' : 'IBFT'}
                    </button>
                  </Td>
                  <Td><Cell value={b.notes ?? ''} onSave={(v) => patch(b, 'notes', v)} wide placeholder="—" /></Td>
                  <Td>
                    <input
                      type="checkbox"
                      checked={b.isActive}
                      onChange={(e) => patch(b, 'isActive', e.target.checked)}
                    />
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => remove(b)}
                      disabled={busy === b.id}
                      className="p-1 text-slate-400 hover:text-slate-700"
                    >
                      {busy === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </Td>
                </tr>
              ))}

              {adding && (
                <tr className="bg-slate-50/60">
                  <Td><NewCell value={draft.bankName} onChange={(v) => setDraft({ ...draft, bankName: v })} placeholder="Bank name" /></Td>
                  <Td><NewCell value={draft.bankCode} onChange={(v) => setDraft({ ...draft, bankCode: v })} placeholder="Code" mono /></Td>
                  <Td><NewCell value={draft.ibanPrefix} onChange={(v) => setDraft({ ...draft, ibanPrefix: v })} placeholder="IBAN" mono /></Td>
                  <Td><NewCell value={draft.swift} onChange={(v) => setDraft({ ...draft, swift: v })} placeholder="SWIFT" mono /></Td>
                  <Td>
                    <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={draft.isOwnBank}
                        onChange={(e) => setDraft({ ...draft, isOwnBank: e.target.checked })}
                      />
                      Ours
                    </label>
                  </Td>
                  <Td><NewCell value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })} placeholder="Note" /></Td>
                  <Td />
                  <Td>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={add}
                        disabled={busy === 'new' || !draft.bankName.trim() || !draft.bankCode.trim()}
                        className="p-1 text-slate-700 hover:text-slate-900 disabled:text-slate-300"
                      >
                        {busy === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAdding(false); setDraft({ ...BLANK }) }}
                        className="text-[11px] text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        <Landmark className="w-3 h-3 inline mr-1 -mt-0.5" />
        Salary code is what the bank&apos;s template expects. IBAN prefix is the four letters
        inside an account number, which is not always the same — UBL&apos;s IBANs read UNIL.
        A bank marked IFT is our own: those transfers carry no bank code at all, and only the
        IBFT rows need one.
      </p>
    </div>
  )
}

/** Edits in place, saves on blur or Enter, gives up on Escape. */
function Cell({ value, onSave, mono, wide, placeholder }: {
  value: string
  onSave: (v: string) => void
  mono?: boolean; wide?: boolean; placeholder?: string
}) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <input
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { setV(value); (e.target as HTMLInputElement).blur() }
      }}
      className={`w-full bg-transparent border border-transparent rounded px-1.5 py-1 text-sm
        hover:border-slate-200 focus:border-slate-300 focus:bg-white focus:outline-none
        ${mono ? 'font-mono text-[12px]' : ''} ${wide ? 'min-w-[12rem]' : 'min-w-[5rem]'}`}
    />
  )
}

function NewCell({ value, onChange, placeholder, mono }: {
  value: string; onChange: (v: string) => void; placeholder: string; mono?: boolean
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded border border-slate-300 px-1.5 py-1 text-sm bg-white
        focus:outline-none focus:ring-2 focus:ring-slate-200 ${mono ? 'font-mono text-[12px]' : ''}`}
    />
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap text-left">
      {children}
    </th>
  )
}

function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-3 py-1.5 align-middle">{children}</td>
}
