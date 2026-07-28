'use client'

import { useEffect, useState } from 'react'
import type { DailyLoggingConfig } from '@/lib/daily-logging-config'

interface Position { id: string; title: string }
interface EmployeeOpt { id: string; fullName: string; designation: string | null }
interface Metric {
  id: string
  name: string
  unit: string
  description: string | null
  isActive: boolean
  defaultPositionId: string | null
  defaultPosition: { id: string; title: string } | null
  defaultTarget: number | null
  assignmentCount: number
}
interface Assignment {
  id: string
  employeeId: string
  metricId: string
  target: number
  isActive: boolean
  metric: Metric
}

interface Props {
  positions: Position[]
  employees: EmployeeOpt[]
  initialConfig: DailyLoggingConfig
}

export default function DailyLoggingSettingsClient({ positions, employees, initialConfig }: Props) {
  const [section, setSection] = useState<'library' | 'assignments' | 'system'>('library')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {(['library', 'assignments', 'system'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSection(s)}
            className={`px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2 ${
              section === s
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {s === 'library' ? '1. KPI Metrics Library'
              : s === 'assignments' ? '2. Per-Employee Assignments'
              : '3. System Settings'}
          </button>
        ))}
      </div>

      {section === 'library' && <LibrarySection positions={positions} />}
      {section === 'assignments' && <AssignmentsSection employees={employees} />}
      {section === 'system' && <SystemSection initial={initialConfig} />}
    </div>
  )
}

// ── 1. KPI Library ──────────────────────────────────────────────────────────
function LibrarySection({ positions }: { positions: Position[] }) {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '',
    unit: 'count',
    description: '',
    defaultPositionId: '',
    defaultTarget: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/kpi/metrics?includeInactive=1')
    const data = await res.json()
    setMetrics(data.metrics ?? [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  async function create() {
    setError(null)
    setBusy(true)
    const res = await fetch('/api/kpi/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        unit: form.unit,
        description: form.description || null,
        defaultPositionId: form.defaultPositionId || null,
        defaultTarget: form.defaultTarget ? Number(form.defaultTarget) : null,
      }),
    })
    setBusy(false)
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Failed'); return }
    setForm({ name: '', unit: 'count', description: '', defaultPositionId: '', defaultTarget: '' })
    void load()
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/kpi/metrics/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    void load()
  }
  async function disable(id: string) {
    if (!confirm('Disable this metric? Historical data is preserved.')) return
    await fetch(`/api/kpi/metrics/${id}`, { method: 'DELETE' })
    void load()
  }
  async function bulkAssign(id: string) {
    if (!confirm('Assign this metric to every employee in its default position?')) return
    const res = await fetch(`/api/kpi/metrics/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assign-default-position' }),
    })
    const data = await res.json()
    alert(res.ok ? `Assigned to ${data.count} employees.` : (data.error ?? 'Failed'))
    void load()
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Add Metric</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input
            placeholder="Name (e.g. Code Commits)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
          <select
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="count">count</option>
            <option value="hours">hours</option>
            <option value="currency">currency</option>
            <option value="percent">percent</option>
          </select>
          <select
            value={form.defaultPositionId}
            onChange={(e) => setForm({ ...form, defaultPositionId: e.target.value })}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="">No default position</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Default target"
            value={form.defaultTarget}
            onChange={(e) => setForm({ ...form, defaultTarget: e.target.value })}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={busy || !form.name.trim()}
            onClick={create}
            className="bg-slate-900 text-white text-sm font-medium rounded px-3 py-1.5 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <input
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full mt-2"
        />
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Unit</th>
              <th className="text-left px-3 py-2 font-medium">Default position</th>
              <th className="text-left px-3 py-2 font-medium">Default target</th>
              <th className="text-left px-3 py-2 font-medium">Assigned</th>
              <th className="text-left px-3 py-2 font-medium">Active</th>
              <th className="text-right px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-3 py-4 text-gray-500">Loading…</td></tr>}
            {!loading && metrics.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-4 text-gray-500">No metrics yet.</td></tr>
            )}
            {metrics.map((m) => (
              <tr key={m.id} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-900">
                  <div className="font-medium">{m.name}</div>
                  {m.description && <div className="text-xs text-gray-500">{m.description}</div>}
                </td>
                <td className="px-3 py-2 text-gray-700">{m.unit}</td>
                <td className="px-3 py-2 text-gray-700">{m.defaultPosition?.title ?? '—'}</td>
                <td className="px-3 py-2 text-gray-700">
                  <input
                    type="number"
                    defaultValue={m.defaultTarget ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value === '' ? null : Number(e.target.value)
                      if (v !== m.defaultTarget) void patch(m.id, { defaultTarget: v })
                    }}
                    className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-3 py-2 text-gray-700">{m.assignmentCount}</td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={m.isActive}
                    onChange={(e) => void patch(m.id, { isActive: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-2 text-right space-x-2">
                  {m.defaultPositionId && (
                    <button
                      type="button"
                      onClick={() => void bulkAssign(m.id)}
                      className="text-xs text-slate-700 underline"
                    >
                      Bulk-assign
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void disable(m.id)}
                    className="text-xs text-slate-700 underline"
                  >
                    Disable
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 2. Per-employee assignments ─────────────────────────────────────────────
function AssignmentsSection({ employees }: { employees: EmployeeOpt[] }) {
  const [pickEmp, setPickEmp] = useState<string>('')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(false)
  const [add, setAdd] = useState({ metricId: '', target: '' })

  async function load(eid: string) {
    if (!eid) return
    setLoading(true)
    const [a, m] = await Promise.all([
      fetch(`/api/kpi/assignments/${eid}`).then((r) => r.json()),
      fetch('/api/kpi/metrics').then((r) => r.json()),
    ])
    setAssignments(a.assignments ?? [])
    setMetrics(m.metrics ?? [])
    setLoading(false)
  }
  useEffect(() => { if (pickEmp) void load(pickEmp) }, [pickEmp])

  async function addOne() {
    if (!pickEmp || !add.metricId) return
    await fetch(`/api/kpi/assignments/${pickEmp}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metricId: add.metricId, target: Number(add.target || 0) }),
    })
    setAdd({ metricId: '', target: '' })
    void load(pickEmp)
  }
  async function patchA(assignmentId: string, body: Record<string, unknown>) {
    if (!pickEmp) return
    await fetch(`/api/kpi/assignments/${pickEmp}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId, ...body }),
    })
    void load(pickEmp)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <label className="text-sm font-medium text-gray-700">Employee</label>
        <select
          value={pickEmp}
          onChange={(e) => setPickEmp(e.target.value)}
          className="mt-1 block w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">— Pick an employee —</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.fullName} {e.designation ? `· ${e.designation}` : ''}
            </option>
          ))}
        </select>
      </div>

      {pickEmp && (
        <>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">+ Add KPI</h3>
            <div className="flex gap-2">
              <select
                value={add.metricId}
                onChange={(e) => setAdd({ ...add, metricId: e.target.value })}
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
              >
                <option value="">— Pick a metric —</option>
                {metrics.filter((m) => m.isActive).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Target"
                value={add.target}
                onChange={(e) => setAdd({ ...add, target: e.target.value })}
                className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => void addOne()}
                disabled={!add.metricId}
                className="bg-slate-900 text-white text-sm font-medium rounded px-3 py-1.5 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Metric</th>
                  <th className="text-left px-3 py-2 font-medium">Unit</th>
                  <th className="text-left px-3 py-2 font-medium">Target</th>
                  <th className="text-left px-3 py-2 font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={4} className="px-3 py-4 text-gray-500">Loading…</td></tr>}
                {!loading && assignments.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-gray-500">No KPIs assigned.</td></tr>
                )}
                {assignments.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-900 font-medium">{a.metric.name}</td>
                    <td className="px-3 py-2 text-gray-700">{a.metric.unit}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        defaultValue={a.target}
                        onBlur={(e) => {
                          const v = Number(e.target.value)
                          if (v !== a.target) void patchA(a.id, { target: v })
                        }}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={a.isActive}
                        onChange={(e) => void patchA(a.id, { isActive: e.target.checked })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── 3. System settings ─────────────────────────────────────────────────────
function SystemSection({ initial }: { initial: DailyLoggingConfig }) {
  const [cfg, setCfg] = useState<DailyLoggingConfig>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setSaved(null)
    const res = await fetch('/api/settings/daily-logging', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    })
    setSaving(false)
    if (res.ok) {
      const data = await res.json()
      setCfg(data.config)
      setSaved('Saved.')
      setTimeout(() => setSaved(null), 2000)
    } else {
      setSaved('Failed to save.')
    }
  }

  function toggle(role: keyof DailyLoggingConfig['analyticsVisibility']) {
    setCfg({
      ...cfg,
      analyticsVisibility: {
        ...cfg.analyticsVisibility,
        [role]: !cfg.analyticsVisibility[role],
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700">Soft cutoff hour (0–23)</label>
          <p className="text-xs text-gray-500 mb-1">After this hour, today's log is marked "Missing" on the lead dashboard.</p>
          <input
            type="number"
            min={0}
            max={23}
            value={cfg.softCutoffHour}
            onChange={(e) => setCfg({ ...cfg, softCutoffHour: Math.max(0, Math.min(23, Number(e.target.value))) })}
            className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Task categories</label>
          <p className="text-xs text-gray-500 mb-1">One per line. Populates the EOD form's category dropdown.</p>
          <textarea
            rows={6}
            value={cfg.taskCategories.join('\n')}
            onChange={(e) => setCfg({ ...cfg, taskCategories: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Inquiry templates</label>
          <p className="text-xs text-gray-500 mb-1">"Quick reasons" chips on the Ask Why dialog. One per line.</p>
          <textarea
            rows={6}
            value={cfg.inquiryTemplates.join('\n')}
            onChange={(e) => setCfg({ ...cfg, inquiryTemplates: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Analytics visibility</label>
          <p className="text-xs text-gray-500 mb-2">Which roles can see daily-log analytics. HR/Exec defaults on.</p>
          <div className="space-y-1">
            {(['EMPLOYEE', 'LEAD', 'MANAGER', 'HR_ADMIN', 'EXECUTIVE'] as const).map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={!!cfg.analyticsVisibility[r]}
                  onChange={() => toggle(r)}
                />
                {r}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="bg-slate-900 text-white text-sm font-medium rounded px-4 py-2 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saved && <span className="text-sm text-gray-600">{saved}</span>}
        </div>
      </div>
    </div>
  )
}
