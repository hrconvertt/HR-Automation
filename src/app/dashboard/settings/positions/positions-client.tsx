'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Power, Search, X } from 'lucide-react'
import {
  POSITION_LEVELS,
  positionLevelLabel,
} from '@/lib/position-levels'

interface Department {
  id: string
  name: string
  code: string
}

interface Position {
  id: string
  title: string
  level: string
  description: string | null
  active: boolean
  department: { id: string; name: string; code: string } | null
  employeeCount: number
}

interface Props {
  departments: Department[]
}

export default function PositionsClient({ departments }: Props) {
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [filterDept, setFilterDept] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Position | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/positions?includeInactive=1`, { cache: 'no-store' })
    const j = await r.json()
    setPositions(j.positions ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleActive(p: Position) {
    await fetch(`/api/positions/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !p.active }),
    })
    await load()
  }

  const filtered = positions.filter((p) => {
    if (!showInactive && !p.active) return false
    if (filterDept && p.department?.id !== filterDept) return false
    if (filterLevel && p.level !== filterLevel) return false
    if (query && !p.title.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-slate-300"
          />
        </div>
        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
        >
          <option value="">All levels</option>
          {POSITION_LEVELS.map((l) => (
            <option key={l} value={l}>{positionLevelLabel(l)}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 px-2">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
        <button
          onClick={() => { setCreating(true); setError('') }}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-700"
        >
          <Plus className="w-4 h-4" /> Add Position
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Title</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Level</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Department</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700"># Employees</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Loading...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No positions match.</td></tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium text-gray-900">{p.title}</td>
                <td className="px-4 py-2.5">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-100">
                    {positionLevelLabel(p.level)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{p.department?.name ?? '-'}</td>
                <td className="px-4 py-2.5 text-center text-gray-600">{p.employeeCount}</td>
                <td className="px-4 py-2.5 text-center">
                  {p.active
                    ? <span className="text-xs text-slate-700">Active</span>
                    : <span className="text-xs text-gray-400">Inactive</span>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      onClick={() => { setEditing(p); setError('') }}
                      title="Edit"
                      className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toggleActive(p)}
                      title={p.active ? 'Deactivate' : 'Activate'}
                      className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <PositionDialog
          position={editing}
          departments={departments}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={async () => { setCreating(false); setEditing(null); await load() }}
          error={error}
          setError={setError}
        />
      )}
    </div>
  )
}

function PositionDialog({
  position, departments, onClose, onSaved, error, setError,
}: {
  position: Position | null
  departments: Department[]
  onClose: () => void
  onSaved: () => Promise<void>
  error: string
  setError: (s: string) => void
}) {
  const [title, setTitle] = useState(position?.title ?? '')
  const [level, setLevel] = useState(position?.level ?? 'EXECUTIVE')
  const [departmentId, setDepartmentId] = useState(position?.department?.id ?? '')
  const [description, setDescription] = useState(position?.description ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setError('')
    setSaving(true)
    const body = { title, level, departmentId: departmentId || null, description: description || null }
    const url = position ? `/api/positions/${position.id}` : `/api/positions`
    const method = position ? 'PATCH' : 'POST'
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setError(j.error ?? 'Save failed')
      return
    }
    await onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">
            {position ? 'Edit Position' : 'Add Position'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior UI/UX Designer"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-slate-300"
            />
          </Field>
          <Field label="Level">
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
            >
              {POSITION_LEVELS.map((l) => (
                <option key={l} value={l}>{positionLevelLabel(l)}</option>
              ))}
            </select>
          </Field>
          <Field label="Department">
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
            >
              <option value="">(No department)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
            />
          </Field>
          {error && (
            <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !title.trim()}
            className="px-3 py-2 text-sm font-medium bg-slate-700 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : position ? 'Save changes' : 'Create position'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
