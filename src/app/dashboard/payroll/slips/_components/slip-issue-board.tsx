'use client'

/**
 * Salary slip issue board — every employee in the run, their slip, and one
 * action to send it.
 *
 * Preview opens the existing slip page, which is already an exact reproduction
 * of the issued Word slip. Nothing about the document is re-implemented here;
 * this screen only decides who receives it and through which channel.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Eye, Mail, Bell, Send, Loader2, Check, AlertTriangle, CheckCircle2,
} from 'lucide-react'

export interface SlipRow {
  id: string
  netSalary: number
  sentAt: string | null
  employee: {
    fullName: string
    employeeCode: string
    designation: string | null
    email: string | null
  }
}

interface Outcome {
  sent: number
  resent: number
  failed: { name: string; reason: string }[]
  period: string
}

const money = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 0 })

export function SlipIssueBoard({ runId, period, rows }: {
  runId: string
  period: string
  rows: SlipRow[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const noEmail = rows.filter((r) => !r.employee.email).length
  const alreadySent = rows.filter((r) => r.sentAt).length

  async function send(payslipIds: string[] | null, channels: string[], key: string) {
    if (busy) return
    setBusy(key)
    setError(null)
    setOutcome(null)
    const res = await fetch(`/api/payroll/${runId}/send-slips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(payslipIds ? { payslipIds } : {}), channels }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setError(j.error ?? 'Could not send.'); return }
    setOutcome(j as Outcome)
    router.refresh()
  }

  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Salary slips — {period}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {rows.length} slip{rows.length === 1 ? '' : 's'} · {alreadySent} already issued
              {noEmail > 0 && <> · <span className="text-amber-700">{noEmail} without an email address</span></>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => send(selected.size ? [...selected] : null, ['app', 'email'], 'all')}
              disabled={!!busy || rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 text-white text-xs px-3 py-2 disabled:opacity-50"
            >
              {busy === 'all'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Send className="w-3.5 h-3.5" />}
              {selected.size ? `Send ${selected.size} selected` : 'Send all'}
            </button>
          </div>
        </div>

        {outcome && (
          <div className="mt-3 text-xs space-y-1">
            <p className="flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {outcome.sent} slip{outcome.sent === 1 ? '' : 's'} issued for {outcome.period}
              {outcome.resent > 0 && (
                <span className="text-slate-500">· {outcome.resent} had been sent before</span>
              )}
            </p>
            {outcome.failed.length > 0 && (
              <div className="text-amber-800">
                <p className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> {outcome.failed.length} could not be emailed:
                </p>
                <ul className="ml-5 mt-0.5">
                  {outcome.failed.map((f) => <li key={f.name}>{f.name} — {f.reason}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-700 mt-3">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-[13px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={selected.size === rows.length && rows.length > 0}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  className="w-3.5 h-3.5 accent-slate-900"
                />
              </th>
              <Th>Employee</Th>
              <Th right>Net pay</Th>
              <Th>Issued</Th>
              <Th right>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-slate-400">No payslips in this run.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.employee.fullName}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="w-3.5 h-3.5 accent-slate-900"
                  />
                </td>
                <td className="px-3 py-2.5">
                  <p className="font-medium text-slate-900">{r.employee.fullName}</p>
                  <p className="text-[11px] text-slate-500">
                    {r.employee.employeeCode}
                    {r.employee.designation ? ` · ${r.employee.designation}` : ''}
                  </p>
                  {!r.employee.email && (
                    <p className="text-[11px] text-amber-700 mt-0.5">No email address on file</p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                  {money(r.netSalary)}
                </td>
                <td className="px-3 py-2.5 text-slate-600 text-[11px] whitespace-nowrap">
                  {r.sentAt
                    ? <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="w-3 h-3" />{new Date(r.sentAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                    : <span className="text-slate-400">Not sent</span>}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/dashboard/payroll/payslip/${r.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-slate-700 hover:underline"
                      title="Preview the slip as the employee sees it"
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview
                    </Link>
                    <button
                      onClick={() => send([r.id], ['app'], r.id + 'app')}
                      disabled={!!busy}
                      title="Send to their inbox in the app"
                      className="text-slate-400 hover:text-slate-900 disabled:opacity-40"
                    >
                      {busy === r.id + 'app'
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Bell className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => send([r.id], ['email'], r.id + 'mail')}
                      disabled={!!busy || !r.employee.email}
                      title={r.employee.email ? `Email to ${r.employee.email}` : 'No email address on file'}
                      className="text-slate-400 hover:text-slate-900 disabled:opacity-30"
                    >
                      {busy === r.id + 'mail'
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Mail className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}
