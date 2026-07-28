'use client'

/**
 * Department Breakdown panel — collapsible companion to the Org Chart tree.
 *
 *   Tree     → reporting structure (manager → report)
 *   Breakdown → headcount + ownership per Department, with edit / delete.
 *
 * HR_ADMIN can add / edit / delete (with active-employee guard).
 * Other roles see read-only summaries.
 */

import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { ChevronDown, ChevronRight, Pencil, Trash2, Plus, Search, Users } from 'lucide-react'

interface Member {
  id: string
  fullName: string
  designation: string
  gender: string | null
  photoUrl: string | null
}
interface DeptRow {
  id: string
  code: string
  name: string
  headEmployeeId: string | null
  head: { id: string; fullName: string; designation: string; photoUrl: string | null } | null
  memberCount: number
  gender: { male: number; female: number; other: number }
  members: Member[]
}
interface PickerEmployee { id: string; fullName: string; designation: string | null }

export function DepartmentBreakdown({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<DeptRow[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [employees, setEmployees] = useState<PickerEmployee[]>([])
  const [editing, setEditing] = useState<DeptRow | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/settings/departments', { cache: 'no-store' })
    if (r.ok) {
      const d = await r.json()
      setRows(d.departments ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!canEdit) return
    fetch('/api/employees?limit=500&status=ACTIVE')
      .then((r) => r.json())
      .then((d) => setEmployees(d.employees ?? d.items ?? []))
      .catch(() => {})
  }, [canEdit])

  const filtered = search.trim()
    ? rows.filter((r) =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.code.toLowerCase().includes(search.toLowerCase()),
      )
    : rows

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleDelete(d: DeptRow) {
    if (!confirm(`Delete "${d.name}"? ${d.memberCount > 0 ? `${d.memberCount} employees currently assigned will need to be reassigned manually.` : ''}`)) return
    const r = await fetch(`/api/settings/departments/${d.id}`, { method: 'DELETE' })
    if (!r.ok) {
      const e = await r.json().catch(() => ({}))
      alert(e.error ?? 'Failed to delete')
      return
    }
    void load()
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 border-b border-slate-100 hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          {collapsed ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          <h2 className="text-sm font-semibold text-slate-900">Department Breakdown</h2>
          <span className="text-xs text-slate-500">· {rows.length} dept{rows.length === 1 ? '' : 's'}</span>
        </div>
      </button>

      {!collapsed && (
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search department…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
              />
            </div>
            {canEdit && (
              <Button onClick={() => setAdding(true)} size="sm" className="ml-auto">
                <Plus className="w-4 h-4 mr-1.5" /> Add Department
              </Button>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-slate-400 py-4 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No departments found.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((d) => {
                const isExpanded = expanded.has(d.id)
                return (
                  <div key={d.id} className="rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-start gap-3 p-4">
                      <button
                        onClick={() => toggle(d.id)}
                        className="mt-0.5 text-slate-500 hover:text-slate-900"
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-900">{d.name}</p>
                          <span className="text-xs text-slate-500 font-mono">{d.code}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Lead: <span className="text-slate-700 font-medium">{d.head?.fullName ?? '— not set —'}</span>
                          {' · '}<Users className="w-3 h-3 inline" /> {d.memberCount} member{d.memberCount === 1 ? '' : 's'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Gender: {d.gender.male}M · {d.gender.female}F{d.gender.other ? ` · ${d.gender.other} other` : ''}
                        </p>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setEditing(d)}
                            className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                            title="Edit department"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(d)}
                            className="p-1.5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                            title="Delete department"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/40">
                        {d.members.length === 0 ? (
                          <p className="text-xs text-slate-400">No active employees.</p>
                        ) : (
                          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {d.members.map((m) => (
                              <li key={m.id} className="flex items-center gap-2 text-xs">
                                <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700 shrink-0 overflow-hidden">
                                  {m.photoUrl ? <img src={m.photoUrl} alt="" className="w-full h-full object-cover" /> : (m.fullName || '?').slice(0, 1)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-slate-800 truncate">{m.fullName}</p>
                                  <p className="text-slate-500 truncate">{m.designation}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {editing && (
        <DeptDialog
          mode="edit"
          dept={editing}
          employees={employees}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load() }}
        />
      )}
      {adding && (
        <DeptDialog
          mode="add"
          employees={employees}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); void load() }}
        />
      )}
    </Card>
  )
}

function DeptDialog({ mode, dept, employees, onClose, onSaved }: {
  mode: 'add' | 'edit'
  dept?: DeptRow
  employees: PickerEmployee[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(dept?.name ?? '')
  const [code, setCode] = useState(dept?.code ?? '')
  const [headEmployeeId, setHeadEmployeeId] = useState(dept?.headEmployeeId ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setErr('')
    if (!name.trim() || !code.trim()) { setErr('Name and code are required'); return }
    setBusy(true)
    const url = mode === 'edit' && dept ? `/api/settings/departments/${dept.id}` : '/api/settings/departments'
    const method = mode === 'edit' ? 'PATCH' : 'POST'
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, headEmployeeId: headEmployeeId || null }),
    })
    setBusy(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setErr(d.error ?? 'Failed')
      return
    }
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit Department' : 'Add Department'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Web - Shopify" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Code</label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. WBS" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Lead (designated head)</label>
            <Select value={headEmployeeId} onValueChange={setHeadEmployeeId}>
              <SelectTrigger><SelectValue placeholder="— not set —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— not set —</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.fullName}{e.designation ? ` · ${e.designation}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {err && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
