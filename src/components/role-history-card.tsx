'use client'

/**
 * Role History card (editable) — shown on the Lifecycle tab of an
 * employee profile. HR can:
 *   - Add a manual role history entry (title, manager, effective date, notes)
 *   - Edit any existing entry (auto or manual)
 *   - Delete an erroneous entry
 *   - Toggle "Notify employee?" on each save
 *
 * Backed by ManagerHistory rows (manual entries flagged isManual=true).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'
import { Pencil, Trash2, Plus, X } from 'lucide-react'

export interface RoleEntry {
  id: string
  title: string | null
  changedAt: string
  effectiveDate: string | null
  reason: string | null
  notes: string | null
  isManual: boolean
  managerName: string | null
  newManagerId: string | null
}

export interface ManagerOption {
  id: string
  fullName: string
}

interface Props {
  employeeId: string
  designation: string
  managerName: string | null
  joiningDate: string
  exitDate: string | null
  entries: RoleEntry[]
  managers: ManagerOption[]
  canEdit: boolean
}

const EMPTY_FORM = {
  title: '',
  managerId: '' as string,
  effectiveDate: new Date().toISOString().split('T')[0],
  notes: '',
  notifyEmployee: false,
}

export default function RoleHistoryCard({
  employeeId, designation, managerName, joiningDate, exitDate, entries, managers, canEdit,
}: Props) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function startAdd() {
    setForm({ ...EMPTY_FORM })
    setEditingId(null)
    setError('')
    setAddOpen(true)
  }

  function startEdit(entry: RoleEntry) {
    setForm({
      title: entry.title ?? '',
      managerId: entry.newManagerId ?? '',
      effectiveDate: (entry.effectiveDate ?? entry.changedAt).split('T')[0],
      notes: entry.notes ?? entry.reason ?? '',
      notifyEmployee: false,
    })
    setEditingId(entry.id)
    setError('')
    setAddOpen(true)
  }

  function cancel() {
    setAddOpen(false)
    setEditingId(null)
    setError('')
  }

  async function save() {
    setError('')
    if (!form.title.trim() && !form.managerId && !form.notes.trim()) {
      setError('Provide a title, manager, or notes.')
      return
    }
    setBusy(true)
    const url = editingId
      ? `/api/employees/${employeeId}/role-history/${editingId}`
      : `/api/employees/${employeeId}/role-history`
    const res = await fetch(url, {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.trim() || null,
        managerId: form.managerId || null,
        effectiveDate: form.effectiveDate || null,
        notes: form.notes.trim() || null,
        notify: form.notifyEmployee,
      }),
    })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data?.error ?? 'Failed to save.')
      return
    }
    cancel()
    router.refresh()
  }

  async function remove(entry: RoleEntry) {
    if (!confirm(`Delete this role history entry${entry.title ? ` (${entry.title})` : ''}? This cannot be undone.`)) return
    setBusy(true)
    const res = await fetch(`/api/employees/${employeeId}/role-history/${entry.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data?.error ?? 'Failed to delete.')
      return
    }
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Role History</CardTitle>
        {canEdit && !addOpen && (
          <Button size="sm" variant="outline" onClick={startAdd}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Entry
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {addOpen && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">
                {editingId ? 'Edit Role History Entry' : 'New Role History Entry'}
              </p>
              <button type="button" onClick={cancel} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Title</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Senior Designer"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Effective Date</label>
                <Input
                  type="date"
                  value={form.effectiveDate}
                  onChange={(e) => setForm((p) => ({ ...p, effectiveDate: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Manager</label>
                <select
                  value={form.managerId}
                  onChange={(e) => setForm((p) => ({ ...p, managerId: e.target.value }))}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">— No change —</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>{m.fullName}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
                  placeholder="e.g. Promoted following Q2 review"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.notifyEmployee}
                onChange={(e) => setForm((p) => ({ ...p, notifyEmployee: e.target.checked }))}
              />
              Notify employee
            </label>
            {error && <p className="text-sm text-slate-700 bg-white border border-slate-200 rounded p-2">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={cancel} disabled={busy}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={busy}>
                {busy ? 'Saving…' : editingId ? 'Save Changes' : 'Add Entry'}
              </Button>
            </div>
          </div>
        )}

        <ul className="space-y-2 text-sm">
          {/* Joining row — synthetic, not in the entries list */}
          <li className="flex justify-between gap-3 border-l-2 border-slate-200 pl-3">
            <div>
              <p className="font-medium text-gray-900">{designation}</p>
              <p className="text-xs text-gray-500">{managerName ? `Manager: ${managerName}` : 'No manager'}</p>
            </div>
            <span className="text-xs text-gray-400">{formatDate(joiningDate)} → {exitDate ? formatDate(exitDate) : 'present'}</span>
          </li>
          {entries.map((entry) => {
            const display = entry.title?.trim() ||
              (entry.newManagerId ? `Manager: ${entry.managerName ?? '—'}` : 'Role change')
            const subtitle = entry.notes?.trim() || entry.reason?.trim() || ''
            const date = entry.effectiveDate ?? entry.changedAt
            return (
              <li key={entry.id} className="group flex justify-between gap-3 border-l-2 border-slate-200 pl-3">
                <div className="min-w-0">
                  <p className="text-gray-900 font-medium">{display}</p>
                  {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">
                    {entry.isManual ? 'Manually added' : 'Auto-recorded'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-400">{formatDate(date)}</span>
                  {canEdit && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(entry)}
                        title="Edit entry"
                        className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(entry)}
                        title="Delete entry"
                        className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
          {entries.length === 0 && (
            <li className="text-xs text-slate-400 italic pt-2">
              No role changes yet{canEdit ? ' — add one with the button above.' : '.'}
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  )
}
