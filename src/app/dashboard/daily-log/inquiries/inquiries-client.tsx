'use client'

import { useEffect, useState } from 'react'

interface TaskInquiry {
  id: string
  date: string
  taskName: string
  managerInquiry: string
  managerInquiryAt: string
}
interface KpiInquiry {
  id: string
  date: string
  target: number
  actual: number
  managerInquiry: string
  managerInquiryAt: string
  metric: { id: string; name: string; unit: string }
}

export default function InquiriesClient() {
  const [tasks, setTasks] = useState<TaskInquiry[]>([])
  const [kpis, setKpis] = useState<KpiInquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/daily-log/inquiries', { cache: 'no-store' })
    const data = await res.json()
    setTasks(data.tasks ?? [])
    setKpis(data.kpis ?? [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  async function respond(kind: 'task' | 'kpi', id: string) {
    const response = responses[id]
    if (!response || !response.trim()) return
    setBusy(id)
    const url = kind === 'task' ? `/api/daily-log/${id}/respond` : `/api/daily-kpi/${id}/respond`
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    })
    setBusy(null)
    setResponses({ ...responses, [id]: '' })
    void load()
  }

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>
  if (tasks.length === 0 && kpis.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
        No pending inquiries. You're all caught up.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {tasks.map((t) => (
        <InquiryCard
          key={`t-${t.id}`}
          dateLabel={t.date}
          subjectLabel={`Task — ${t.taskName}`}
          question={t.managerInquiry}
          response={responses[t.id] ?? ''}
          onResponseChange={(v) => setResponses({ ...responses, [t.id]: v })}
          onSubmit={() => respond('task', t.id)}
          busy={busy === t.id}
        />
      ))}
      {kpis.map((k) => (
        <InquiryCard
          key={`k-${k.id}`}
          dateLabel={k.date}
          subjectLabel={`KPI — ${k.metric.name} (${k.actual} / ${k.target})`}
          question={k.managerInquiry}
          response={responses[k.id] ?? ''}
          onResponseChange={(v) => setResponses({ ...responses, [k.id]: v })}
          onSubmit={() => respond('kpi', k.id)}
          busy={busy === k.id}
        />
      ))}
    </div>
  )
}

function InquiryCard({
  dateLabel, subjectLabel, question, response, onResponseChange, onSubmit, busy,
}: {
  dateLabel: string
  subjectLabel: string
  question: string
  response: string
  onResponseChange: (v: string) => void
  onSubmit: () => void
  busy: boolean
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-900">{subjectLabel}</h3>
        <span className="text-xs text-gray-500">{dateLabel}</span>
      </div>
      <p className="text-sm text-gray-700 mt-2 mb-3 border-l-2 border-gray-300 pl-3 italic">{question}</p>
      <textarea
        rows={3}
        placeholder="Your response…"
        value={response}
        onChange={(e) => onResponseChange(e.target.value)}
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
      />
      <div className="flex justify-end mt-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || !response.trim()}
          className="bg-slate-900 text-white text-sm font-medium rounded px-4 py-1.5 disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send response'}
        </button>
      </div>
    </div>
  )
}
