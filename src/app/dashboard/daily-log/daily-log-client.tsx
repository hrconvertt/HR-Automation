'use client'

import { useEffect, useState } from 'react'
import { Plus, X, ClipboardList } from 'lucide-react'

interface KpiAssignment {
  id: string
  metricId: string
  target: number
  metric: { id: string; name: string; unit: string }
}
interface DailyKpiRow {
  id: string
  metricId: string
  actual: number
  target: number
  inquiryStatus: string
  managerInquiry: string | null
  metric: { id: string; name: string; unit: string }
}
interface DailyLogRow {
  id: string
  taskName: string
  category: string | null
  hoursInvested: string | number
  status: string
  notes: string | null
  inquiryStatus: string
  managerInquiry: string | null
}
interface ConfigShape {
  taskCategories: string[]
  statusOptions: string[]
}

interface TaskRow {
  taskName: string
  hoursInvested: string
  status: string
  category: string
  notes: string
}

export default function DailyLogClient() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [config, setConfig] = useState<ConfigShape | null>(null)
  const [assignments, setAssignments] = useState<KpiAssignment[]>([])
  const [existingLogs, setExistingLogs] = useState<DailyLogRow[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([
    { taskName: '', hoursInvested: '', status: 'COMPLETED', category: '', notes: '' },
  ])
  const [kpiInputs, setKpiInputs] = useState<Record<string, string>>({})

  async function load() {
    setLoading(true)
    const res = await fetch('/api/daily-log/today', { cache: 'no-store' })
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    setConfig(data.config)
    setAssignments(data.assignments ?? [])
    setExistingLogs(data.logs ?? [])
    // Hydrate tasks
    if ((data.logs ?? []).length > 0) {
      setTasks((data.logs as DailyLogRow[]).map((l) => ({
        taskName: l.taskName,
        hoursInvested: String(l.hoursInvested),
        status: l.status,
        category: l.category ?? '',
        notes: l.notes ?? '',
      })))
    }
    // Hydrate KPI inputs
    const kmap: Record<string, string> = {}
    for (const k of (data.kpis as DailyKpiRow[]) ?? []) {
      kmap[k.metricId] = String(k.actual)
    }
    setKpiInputs(kmap)
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  function addRow() {
    setTasks([...tasks, { taskName: '', hoursInvested: '', status: 'COMPLETED', category: '', notes: '' }])
  }
  function removeRow(i: number) {
    setTasks(tasks.filter((_, idx) => idx !== i))
  }
  function setRow(i: number, patch: Partial<TaskRow>) {
    setTasks(tasks.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function submit() {
    setSaving(true)
    setMsg(null)
    const cleanTasks = tasks.filter((t) => t.taskName.trim() && t.hoursInvested !== '')
    const cleanKpis = assignments.map((a) => ({
      metricId: a.metricId,
      actual: Number(kpiInputs[a.metricId] ?? 0),
    }))
    const res = await fetch('/api/daily-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: cleanTasks, kpis: cleanKpis }),
    })
    setSaving(false)
    if (res.ok) {
      setMsg('Saved.')
      setTimeout(() => setMsg(null), 2000)
      void load()
    } else {
      const data = await res.json().catch(() => ({}))
      setMsg(data.error ?? 'Save failed.')
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>

  const pendingInquiries = existingLogs.filter((l) => l.inquiryStatus === 'PENDING').length
  const totalHours = tasks.reduce((sum, t) => sum + (Number(t.hoursInvested) || 0), 0)

  return (
    <div className="space-y-4">
      {pendingInquiries > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-900 flex items-center justify-between">
          <span>You have {pendingInquiries} pending inquiry{pendingInquiries === 1 ? '' : 's'} from your lead.</span>
          <a href="/dashboard/daily-log/inquiries" className="underline font-medium">Respond now →</a>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Today's Tasks
          </h2>
          <button
            type="button"
            onClick={addRow}
            className="text-sm font-medium text-slate-900 hover:underline inline-flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Add row
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-gray-700">
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 font-medium">Task name</th>
              <th className="text-left py-2 font-medium w-20">Hours</th>
              <th className="text-left py-2 font-medium w-32">Status</th>
              <th className="text-left py-2 font-medium w-32">Category</th>
              <th className="text-left py-2 font-medium">Notes</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {tasks.map((row, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-1 pr-2">
                  <input
                    value={row.taskName}
                    onChange={(e) => setRow(i, { taskName: e.target.value })}
                    placeholder="What did you do?"
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    max="24"
                    value={row.hoursInvested}
                    onChange={(e) => setRow(i, { hoursInvested: e.target.value })}
                    className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm"
                  />
                </td>
                <td className="py-1 pr-2">
                  <select
                    value={row.status}
                    onChange={(e) => setRow(i, { status: e.target.value })}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  >
                    {(config?.statusOptions ?? ['NOT_STARTED','IN_PROGRESS','COMPLETED','BLOCKED']).map((s) => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <select
                    value={row.category}
                    onChange={(e) => setRow(i, { category: e.target.value })}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {(config?.taskCategories ?? []).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input
                    value={row.notes}
                    onChange={(e) => setRow(i, { notes: e.target.value })}
                    placeholder="optional"
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  />
                </td>
                <td className="py-1">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="text-gray-400 hover:text-slate-900 p-1"
                    aria-label="Remove row"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 text-xs text-gray-500">Total hours: {totalHours.toFixed(2)}</div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Today's KPIs</h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-gray-500">No KPIs assigned. HR can configure them in Daily Logging Settings.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b border-gray-100">
                  <td className="py-2 text-gray-900 font-medium">{a.metric.name}</td>
                  <td className="py-2 text-gray-500 w-32">Target: {a.target} <span className="text-xs">({a.metric.unit})</span></td>
                  <td className="py-2 w-40">
                    <input
                      type="number"
                      min="0"
                      placeholder="Actual"
                      value={kpiInputs[a.metricId] ?? ''}
                      onChange={(e) => setKpiInputs({ ...kpiInputs, [a.metricId]: e.target.value })}
                      className="w-28 border border-gray-300 rounded px-2 py-1.5 text-sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        {msg && <span className="text-sm text-gray-600">{msg}</span>}
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="bg-slate-900 text-white text-sm font-medium rounded px-5 py-2 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save & Submit'}
        </button>
      </div>
    </div>
  )
}
