'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { ClipboardList, Plus, MessageSquarePlus } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface PIP {
  id: string
  startDate: string
  endDate: string
  objectives: string
  metrics: string
  checkIns: string | null
  outcome: string | null
  employee: {
    id: string
    employeeCode: string
    fullName: string
    department: { name: string } | null
  }
}

interface Props {
  role: 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'EXECUTIVE'
  isPreviewMode?: boolean
}

const OUTCOMES = [
  { value: 'IN_PROGRESS', label: 'In Progress', variant: 'default' as const },
  { value: 'PASSED',      label: 'Passed',      variant: 'success' as const },
  { value: 'FAILED',      label: 'Failed',      variant: 'destructive' as const },
  { value: 'EXTENDED',    label: 'Extended',    variant: 'warning' as const },
]

export function PipPanel({ role, isPreviewMode = false }: Props) {
  const [pips, setPips] = useState<PIP[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editPip, setEditPip] = useState<PIP | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [employeeOptions, setEmployeeOptions] = useState<{ id: string; fullName: string; employeeCode: string }[]>([])

  const [form, setForm] = useState({
    employeeId: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    objectives: '',
    metrics: '',
  })

  const [checkInForm, setCheckInForm] = useState({ checkIns: '', outcome: '' })

  const fetchPips = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/performance/pip')
    const data = await res.json()
    setPips(data.pips ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchPips() }, [fetchPips])

  useEffect(() => {
    if (role === 'HR_ADMIN') {
      fetch('/api/employees?limit=200&status=ACTIVE')
        .then((r) => r.json())
        .then((d) => setEmployeeOptions(d.employees ?? []))
    }
  }, [role])

  async function handleCreate() {
    setError('')
    if (!form.employeeId || !form.endDate || !form.objectives || !form.metrics) {
      setError('All fields required'); return
    }
    setSaving(true)
    const res = await fetch('/api/performance/pip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Failed'); return }
    setCreateOpen(false)
    setForm({
      employeeId: '',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '', objectives: '', metrics: '',
    })
    fetchPips()
  }

  async function handleEdit() {
    if (!editPip) return
    setSaving(true)
    setError('')
    const body: Record<string, string> = {}
    if (checkInForm.checkIns) body.checkIns = checkInForm.checkIns
    if (checkInForm.outcome) body.outcome = checkInForm.outcome

    const res = await fetch(`/api/performance/pip/${editPip.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Failed'); return }
    setEditPip(null)
    setCheckInForm({ checkIns: '', outcome: '' })
    fetchPips()
  }

  const canCreate = role === 'HR_ADMIN' && !isPreviewMode

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-red-500" />
            Performance Improvement Plans
          </h2>
          <p className="text-sm text-gray-500">{pips.length} {pips.length === 1 ? 'PIP' : 'PIPs'} on record</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> Create PIP
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Check-ins</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400">Loading…</TableCell></TableRow>
            ) : pips.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400">No active PIPs.</TableCell></TableRow>
            ) : pips.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <p className="font-medium">{p.employee.fullName}</p>
                  <p className="text-xs text-gray-400">{p.employee.employeeCode}</p>
                </TableCell>
                <TableCell className="text-sm">{formatDate(p.startDate)}</TableCell>
                <TableCell className="text-sm">{formatDate(p.endDate)}</TableCell>
                <TableCell>
                  <Badge variant={OUTCOMES.find((o) => o.value === (p.outcome ?? 'IN_PROGRESS'))?.variant ?? 'secondary'}>
                    {OUTCOMES.find((o) => o.value === (p.outcome ?? 'IN_PROGRESS'))?.label ?? p.outcome ?? 'In Progress'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-gray-500">
                  {p.checkIns ? `${p.checkIns.split('\n\n').length} check-in(s)` : '—'}
                </TableCell>
                <TableCell>
                  {!isPreviewMode && (role === 'HR_ADMIN' || role === 'MANAGER') && (
                    <Button size="sm" variant="outline" onClick={() => { setEditPip(p); setCheckInForm({ checkIns: '', outcome: '' }) }}>
                      <MessageSquarePlus className="w-3.5 h-3.5" /> Update
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Create PIP Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Performance Improvement Plan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
              <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employeeOptions.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Objectives *</label>
              <textarea
                rows={3}
                value={form.objectives}
                onChange={(e) => setForm({ ...form, objectives: e.target.value })}
                placeholder="Specific improvement areas — bullet points work well"
                className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Success Metrics *</label>
              <textarea
                rows={3}
                value={form.metrics}
                onChange={(e) => setForm({ ...form, metrics: e.target.value })}
                placeholder="How will success be measured? Use KPIs / targets / dates"
                className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create PIP'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update PIP Dialog */}
      <Dialog open={!!editPip} onOpenChange={(o) => !o && setEditPip(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Update PIP — {editPip?.employee.fullName}</DialogTitle></DialogHeader>
          {editPip && (
            <div className="space-y-4">
              {/* Show original objectives & metrics */}
              <div className="bg-gray-50 p-3 rounded-lg text-sm space-y-2">
                <div>
                  <p className="text-xs uppercase text-gray-500 font-semibold">Objectives</p>
                  <p className="text-gray-800 whitespace-pre-wrap">{editPip.objectives}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-500 font-semibold">Metrics</p>
                  <p className="text-gray-800 whitespace-pre-wrap">{editPip.metrics}</p>
                </div>
              </div>
              {editPip.checkIns && (
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-sm">
                  <p className="text-xs uppercase text-blue-700 font-semibold mb-1">Previous Check-ins</p>
                  <p className="text-blue-900 whitespace-pre-wrap text-xs">{editPip.checkIns}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Add Check-in Note</label>
                <textarea
                  rows={3}
                  value={checkInForm.checkIns}
                  onChange={(e) => setCheckInForm({ ...checkInForm, checkIns: e.target.value })}
                  placeholder="Progress update, observations, action items…"
                  className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              {role === 'HR_ADMIN' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Set Outcome (HR only)</label>
                  <Select value={checkInForm.outcome} onValueChange={(v) => setCheckInForm({ ...checkInForm, outcome: v })}>
                    <SelectTrigger><SelectValue placeholder="Keep current" /></SelectTrigger>
                    <SelectContent>
                      {OUTCOMES.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPip(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? 'Saving…' : 'Save Update'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
