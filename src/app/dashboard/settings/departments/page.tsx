'use client'

/**
 * Departments — editable table.
 *   Columns: Code / Name / Head / # Employees / Actions
 *   - Inline edit for name + code (PATCH /api/settings/departments/[id])
 *   - Head picker via Employee dropdown (writes headEmployeeId)
 *   - Add Department dialog (POST /api/settings/departments)
 *   - Delete guarded — endpoint refuses if active employees still assigned.
 */
import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Pencil, Check, X, Trash2, Plus } from 'lucide-react'

interface DeptHead { id: string; fullName: string; designation: string }
interface Dept {
  id: string
  code: string
  name: string
  headEmployeeId: string | null
  head: DeptHead | null
  memberCount: number
}
interface EmpOption { id: string; fullName: string; designation: string; employeeCode: string }

export default function DepartmentsSettingsPage() {
  const [rows, setRows] = useState<Dept[]>([])
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<EmpOption[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addCode, setAddCode] = useState('')
  const [addHead, setAddHead] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const r = await fetch('/api/settings/departments')
    const d = await r.json()
    setRows(d.departments ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    fetch('/api/employees?limit=500&status=ACTIVE')
      .then((r) => r.json())
      .then((d) => setEmployees((d.employees ?? d.items ?? []) as EmpOption[]))
      .catch(() => {})
  }, [])

  function startEdit(row: Dept) {
    setEditingId(row.id); setEditName(row.name); setEditCode(row.code); setError('')
  }
  function cancelEdit() { setEditingId(null); setError('') }

  async function saveEdit(id: string) {
    setError(''); setSaving(true)
    const res = await fetch(`/api/settings/departments/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, code: editCode }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Failed to save'); return }
    setEditingId(null)
    await load()
  }

  async function setHead(id: string, headEmployeeId: string) {
    await fetch(`/api/settings/departments/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headEmployeeId: headEmployeeId === '__none' ? null : headEmployeeId }),
    })
    await load()
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    const res = await fetch(`/api/settings/departments/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Failed to delete')
      return
    }
    await load()
  }

  async function submitAdd() {
    setError(''); setSaving(true)
    const res = await fetch('/api/settings/departments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: addName, code: addCode, headEmployeeId: addHead || null }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Failed to create'); return }
    setAddOpen(false); setAddName(''); setAddCode(''); setAddHead('')
    await load()
  }

  return (
    <Card>
      <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between">
        <CardTitle>Departments ({rows.length})</CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4" /> Add Department
        </Button>
      </CardHeader>
      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Head</TableHead>
              <TableHead className="text-center"># Employees</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400">No departments.</TableCell></TableRow>
            ) : rows.map((d) => {
              const editing = editingId === d.id
              return (
                <TableRow key={d.id}>
                  <TableCell>
                    {editing ? (
                      <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} className="h-8 w-24" />
                    ) : (
                      <Badge variant="secondary">{d.code}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {editing ? (
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" />
                    ) : d.name}
                  </TableCell>
                  <TableCell>
                    <Select value={d.headEmployeeId ?? '__none'} onValueChange={(v) => setHead(d.id, v)}>
                      <SelectTrigger className="h-8 w-56"><SelectValue placeholder="No head" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— No head —</SelectItem>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.fullName} — {e.designation}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-center">{d.memberCount}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {editing ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => saveEdit(d.id)} disabled={saving}>
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => startEdit(d)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => del(d.id, d.name)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
      {error && (
        <div className="p-4 text-sm text-slate-700 bg-slate-50 border-t border-slate-100">{error}</div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Department</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Code *</label>
              <Input value={addCode} onChange={(e) => setAddCode(e.target.value)} placeholder="e.g. BD, ENG, UIUX" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
              <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. Business Development" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Head (optional)</label>
              <Select value={addHead} onValueChange={setAddHead}>
                <SelectTrigger><SelectValue placeholder="Pick a department head" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.fullName} — {e.designation}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submitAdd} disabled={saving || !addName || !addCode}>
              {saving ? 'Saving…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
