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
import { Plus, Target, Trash2, Edit3 } from 'lucide-react'
import { getInitials } from '@/lib/utils'

interface Goal {
  id: string
  goalId: string
  description: string
  kpi: string | null
  target: string | null
  weight: number
  status: string
  selfComment: string | null
  managerComment: string | null
  achievement: number | null
  employee: {
    id: string
    employeeCode: string
    fullName: string
    department: { name: string } | null
  }
}

interface Props {
  role: 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'EXECUTIVE'
  employeeId: string | null // current user's employee id
  isPreviewMode?: boolean
}

const STATUS_OPTIONS = [
  { value: 'NOT_STARTED', label: 'Not Started', variant: 'secondary' as const },
  { value: 'IN_PROGRESS', label: 'In Progress', variant: 'default' as const },
  { value: 'ON_TRACK',    label: 'On Track',    variant: 'success' as const },
  { value: 'AT_RISK',     label: 'At Risk',     variant: 'warning' as const },
  { value: 'COMPLETED',   label: 'Completed',   variant: 'success' as const },
]

export function GoalsPanel({ role, employeeId, isPreviewMode = false }: Props) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    description: '',
    kpi: '',
    target: '',
    weight: 10,
    employeeId: '', // for HR/Manager creating for someone else
  })

  // For HR/Manager — list of employees they can create goals for
  const [employeeOptions, setEmployeeOptions] = useState<{ id: string; fullName: string; employeeCode: string }[]>([])

  const fetchGoals = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/goals')
    const data = await res.json()
    setGoals(data.goals ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchGoals() }, [fetchGoals])

  useEffect(() => {
    if (role === 'HR_ADMIN' || role === 'MANAGER') {
      fetch('/api/employees?limit=200&status=ACTIVE')
        .then((r) => r.json())
        .then((d) => setEmployeeOptions(d.employees ?? []))
    }
  }, [role])

  async function handleSave() {
    setError('')
    if (!form.description.trim()) { setError('Goal description is required'); return }
    setSaving(true)
    const url = editGoal ? `/api/goals/${editGoal.id}` : '/api/goals'
    const method = editGoal ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Failed to save'); return }
    setAddOpen(false)
    setEditGoal(null)
    setForm({ description: '', kpi: '', target: '', weight: 10, employeeId: '' })
    fetchGoals()
  }

  async function handleStatusChange(goalId: string, newStatus: string) {
    await fetch(`/api/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    fetchGoals()
  }

  async function handleDelete(goalId: string) {
    if (!confirm('Delete this goal?')) return
    await fetch(`/api/goals/${goalId}`, { method: 'DELETE' })
    fetchGoals()
  }

  function openEdit(g: Goal) {
    setEditGoal(g)
    setForm({
      description: g.description,
      kpi: g.kpi ?? '',
      target: g.target ?? '',
      weight: g.weight,
      employeeId: g.employee.id,
    })
    setAddOpen(true)
  }

  const myGoals = goals.filter((g) => g.employee.id === employeeId)
  const teamGoals = goals.filter((g) => g.employee.id !== employeeId)

  const canCreate = !isPreviewMode // any real role can create; HR previewing disabled
  const headerLabel =
    role === 'EMPLOYEE'  ? 'My Goals' :
    role === 'MANAGER'   ? 'Team Goals' :
    role === 'EXECUTIVE' ? 'All Goals' : 'All Goals'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-slate-700" />
            {headerLabel}
          </h2>
          <p className="text-sm text-gray-500">
            {goals.length} {goals.length === 1 ? 'goal' : 'goals'} tracked
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => { setEditGoal(null); setForm({ description: '', kpi: '', target: '', weight: 10, employeeId: role === 'EMPLOYEE' ? '' : (employeeOptions[0]?.id ?? '') }); setAddOpen(true) }}>
            <Plus className="w-4 h-4" />
            Add Goal
          </Button>
        )}
      </div>

      {/* My Goals section (for non-employee roles, this is their own goals) */}
      {role !== 'EXECUTIVE' && employeeId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">My Goals ({myGoals.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <GoalsTable
              goals={myGoals}
              role={role}
              employeeId={employeeId}
              onStatusChange={handleStatusChange}
              onEdit={openEdit}
              onDelete={handleDelete}
              showEmployee={false}
              isPreviewMode={isPreviewMode}
            />
          </CardContent>
        </Card>
      )}

      {/* Team / All Goals */}
      {(role !== 'EMPLOYEE' || teamGoals.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {role === 'MANAGER' ? 'Team Goals' : role === 'EXECUTIVE' ? 'All Goals' : 'Other Goals'}
              {' '}({teamGoals.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <GoalsTable
              goals={teamGoals}
              role={role}
              employeeId={employeeId}
              onStatusChange={handleStatusChange}
              onEdit={openEdit}
              onDelete={handleDelete}
              showEmployee
              isPreviewMode={isPreviewMode}
            />
          </CardContent>
        </Card>
      )}

      {loading && <p className="text-sm text-gray-400 text-center py-4">Loading goals…</p>}

      {/* Add/Edit Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editGoal ? 'Edit Goal' : 'Add New Goal'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {(role === 'HR_ADMIN' || role === 'MANAGER') && !editGoal && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {employeeOptions.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Goal Description *</label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Launch new client onboarding flow by Q3"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">KPI</label>
                <Input
                  value={form.kpi}
                  onChange={(e) => setForm({ ...form, kpi: e.target.value })}
                  placeholder="e.g. # of accounts"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target</label>
                <Input
                  value={form.target}
                  onChange={(e) => setForm({ ...form, target: e.target.value })}
                  placeholder="e.g. 5 accounts"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weight (%)</label>
              <Input
                type="number" min={0} max={100}
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: Number(e.target.value) || 0 })}
                className="w-32"
              />
              <p className="text-xs text-gray-400 mt-1">Importance of this goal in overall performance</p>
            </div>
            {error && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : (editGoal ? 'Save Changes' : 'Add Goal')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function GoalsTable({
  goals, role, employeeId, onStatusChange, onEdit, onDelete, showEmployee, isPreviewMode = false,
}: {
  goals: Goal[]
  role: string
  employeeId: string | null
  onStatusChange: (id: string, status: string) => void
  onEdit: (g: Goal) => void
  onDelete: (id: string) => void
  showEmployee: boolean
  isPreviewMode?: boolean
}) {
  if (goals.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">No goals yet.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showEmployee && <TableHead>Employee</TableHead>}
          <TableHead>Goal</TableHead>
          <TableHead>KPI / Target</TableHead>
          <TableHead>Weight</TableHead>
          <TableHead>Status</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {goals.map((g) => {
          const isOwn = g.employee.id === employeeId
          const canEdit = !isPreviewMode && (isOwn || role === 'HR_ADMIN' || (role === 'MANAGER' && !isOwn))
          const canDelete = canEdit
          return (
            <TableRow key={g.id}>
              {showEmployee && (
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-slate-500 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                      {getInitials(g.employee.fullName)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{g.employee.fullName}</p>
                      <p className="text-xs text-gray-400">{g.employee.department?.name ?? '—'}</p>
                    </div>
                  </div>
                </TableCell>
              )}
              <TableCell className="max-w-[280px]">
                <p className="text-sm text-gray-900">{g.description}</p>
                <p className="text-xs text-gray-400 font-mono">{g.goalId}</p>
              </TableCell>
              <TableCell className="text-sm">
                {g.kpi || g.target ? (
                  <>
                    <p className="text-gray-700">{g.kpi || '—'}</p>
                    <p className="text-xs text-gray-400">→ {g.target || '—'}</p>
                  </>
                ) : <span className="text-gray-400">—</span>}
              </TableCell>
              <TableCell className="text-sm">{g.weight}%</TableCell>
              <TableCell>
                {canEdit ? (
                  <Select value={g.status} onValueChange={(v) => onStatusChange(g.id, v)}>
                    <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant={STATUS_OPTIONS.find((s) => s.value === g.status)?.variant ?? 'secondary'}>
                    {STATUS_OPTIONS.find((s) => s.value === g.status)?.label ?? g.status}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => onEdit(g)}>
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button size="sm" variant="ghost" onClick={() => onDelete(g.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
