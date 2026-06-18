'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { BarChart3 } from 'lucide-react'

interface Log {
  id: string
  taskName: string
  category: string | null
  hoursInvested: string | number
  status: string
  notes: string | null
  inquiryStatus: string
  managerInquiry: string | null
  employeeResponse: string | null
}
interface Kpi {
  id: string
  metricId: string
  target: number
  actual: number
  inquiryStatus: string
  managerInquiry: string | null
  employeeResponse: string | null
  metric: { id: string; name: string; unit: string }
}
interface EmployeeRow {
  id: string
  fullName: string
  designation: string | null
  department: { name: string } | null
  logs: Log[]
  kpis: Kpi[]
  missing: boolean
}

function defaultDate(): string {
  const d = new Date(Date.now() - 86400_000)
  return d.toISOString().slice(0, 10)
}

export default function DailyReviewClient({ readOnly }: { readOnly: boolean }) {
  const [date, setDate] = useState(defaultDate())
  const [data, setData] = useState<{ employees: EmployeeRow[]; softCutoffHour: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<string[]>([])
  const [modal, setModal] = useState<
    | { kind: 'task' | 'kpi'; id: string; label: string }
    | null
  >(null)
  const [question, setQuestion] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setLoading(true)
    const [team, cfg] = await Promise.all([
      fetch(`/api/daily-log/team?date=${date}`, { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/settings/daily-logging').then((r) => r.json()),
    ])
    setData(team)
    setTemplates(cfg.config?.inquiryTemplates ?? [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [date])

  function openAsk(kind: 'task' | 'kpi', id: string, label: string) {
    setModal({ kind, id, label })
    setQuestion('')
  }
  async function send() {
    if (!modal || !question.trim()) return
    setSubmitting(true)
    const url = modal.kind === 'task'
      ? `/api/daily-log/${modal.id}/inquiry`
      : `/api/daily-kpi/${modal.id}/inquiry`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    })
    setSubmitting(false)
    if (res.ok) {
      setModal(null)
      void load()
    }
  }

  const employees = data?.employees ?? []
  const dateLabel = useMemo(() => {
    const d = new Date(date)
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  }, [date])

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
        <span className="text-gray-700 font-medium">Date:</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm"
        />
        <span className="text-gray-500">{dateLabel}</span>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {!loading && employees.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
          No team members visible to you.
        </div>
      )}

      {employees.map((e) => {
        const totalHours = e.logs.reduce((s, l) => s + Number(l.hoursInvested), 0)
        const blocked = e.logs.filter((l) => l.status === 'BLOCKED').length
        const kpiMet = e.kpis.filter((k) => k.actual >= k.target).length

        return (
          <div key={e.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {e.fullName}
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    — {e.designation ?? 'Employee'}
                  </span>
                </h3>
                {e.missing ? (
                  <p className="text-xs text-slate-700 mt-1">
                    Missing log{e.kpis.length === 0 ? '' : ' (KPIs not submitted either)'}.
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">
                    Tasks: {e.logs.length} logged · {totalHours.toFixed(2)} hr total
                    {blocked > 0 && ` · ${blocked} blocked`}
                    {e.kpis.length > 0 && ` · KPIs: ${kpiMet} of ${e.kpis.length} met`}
                  </p>
                )}
              </div>
              <Link
                href={`/dashboard/daily-review/analytics/${e.id}`}
                className="text-xs text-slate-700 inline-flex items-center gap-1 hover:underline"
              >
                <BarChart3 className="w-3.5 h-3.5" /> Analytics
              </Link>
            </div>

            {e.logs.length > 0 && (
              <table className="w-full text-sm">
                <tbody>
                  {e.logs.map((l) => (
                    <tr key={l.id} className="border-t border-gray-100">
                      <td className="py-1.5 pr-2 text-gray-900">{l.taskName}</td>
                      <td className="py-1.5 pr-2 text-gray-500 w-20">{Number(l.hoursInvested).toFixed(2)} hr</td>
                      <td className="py-1.5 pr-2 text-gray-500 w-28">{l.status.replace('_', ' ')}</td>
                      <td className="py-1.5 pr-2 text-gray-500 w-28">{l.category ?? '—'}</td>
                      <td className="py-1.5 text-right w-28">
                        {!readOnly && l.inquiryStatus === 'NONE' && (
                          <button
                            type="button"
                            onClick={() => openAsk('task', l.id, l.taskName)}
                            className="text-xs text-slate-700 underline"
                          >
                            Ask Why
                          </button>
                        )}
                        {l.inquiryStatus === 'PENDING' && (
                          <span className="text-xs text-slate-700">Pending response</span>
                        )}
                        {l.inquiryStatus === 'RESOLVED' && (
                          <span className="text-xs text-slate-700" title={l.employeeResponse ?? ''}>Resolved</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {e.kpis.length > 0 && (
              <table className="w-full text-sm mt-2">
                <tbody>
                  {e.kpis.map((k) => {
                    const met = k.actual >= k.target
                    return (
                      <tr key={k.id} className="border-t border-gray-100">
                        <td className="py-1.5 pr-2 text-gray-900">KPI — {k.metric.name}</td>
                        <td className="py-1.5 pr-2 text-gray-500 w-40">
                          {k.actual} / {k.target} {met ? '✓' : '✗'}
                        </td>
                        <td className="py-1.5 text-right w-28">
                          {!readOnly && k.inquiryStatus === 'NONE' && (
                            <button
                              type="button"
                              onClick={() => openAsk('kpi', k.id, k.metric.name)}
                              className="text-xs text-slate-700 underline"
                            >
                              Ask Why
                            </button>
                          )}
                          {k.inquiryStatus === 'PENDING' && (
                            <span className="text-xs text-slate-700">Pending response</span>
                          )}
                          {k.inquiryStatus === 'RESOLVED' && (
                            <span className="text-xs text-slate-700" title={k.employeeResponse ?? ''}>Resolved</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )
      })}

      {modal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-900 mb-1">Ask Why</h3>
            <p className="text-xs text-gray-500 mb-3">{modal.label}</p>

            {templates.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-700 mb-1.5">Quick reasons</p>
                <div className="flex flex-wrap gap-1.5">
                  {templates.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setQuestion(t)}
                      className="text-xs border border-gray-300 rounded-full px-2 py-1 hover:bg-gray-100"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <textarea
              rows={4}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Type your question…"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="text-sm text-gray-700 px-3 py-1.5 hover:underline"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={send}
                disabled={submitting || !question.trim()}
                className="bg-slate-900 text-white text-sm font-medium rounded px-4 py-1.5 disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send inquiry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
