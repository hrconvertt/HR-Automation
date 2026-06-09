'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Plus, Trash2 } from 'lucide-react'

interface Task {
  id: string
  title: string
  description: string | null
  owner: string
  category: string
  orderIndex: number
  isComplete: boolean
  completedAt: string | null
}

interface Props {
  employeeId: string
  checklistId: string
  day1Schedule: string
  notes: string
  tasks: Task[]
  canEdit: boolean
  canMarkComplete: boolean
  viewerRole: string
}

const CATEGORY_ORDER = ['PRE_ARRIVAL', 'DAY_1', 'WEEK_1_PAPERWORK', 'WEEK_1_IT', 'OTHER']
const CATEGORY_LABELS: Record<string, string> = {
  PRE_ARRIVAL: 'Pre-Arrival',
  DAY_1: 'Day 1',
  WEEK_1_PAPERWORK: 'Week 1 — Paperwork',
  WEEK_1_IT: 'Week 1 — IT & Access',
  OTHER: 'Custom Tasks',
}

export function OnboardingWorkspace(props: Props) {
  const router = useRouter()
  const [tasks, setTasks] = useState(props.tasks)
  const [day1, setDay1] = useState(props.day1Schedule)
  const [notes, setNotes] = useState(props.notes)
  const [pending, startTransition] = useTransition()
  const [showAdd, setShowAdd] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', owner: 'HR', category: 'OTHER', description: '' })

  async function toggleTask(t: Task) {
    const next = !t.isComplete
    setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, isComplete: next, completedAt: next ? new Date().toISOString() : null } : x))
    await fetch(`/api/onboarding/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isComplete: next }),
    })
    startTransition(() => router.refresh())
  }

  async function addTask() {
    if (!newTask.title.trim()) return
    const res = await fetch(`/api/onboarding/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklistId: props.checklistId, ...newTask }),
    })
    if (res.ok) {
      const { task } = await res.json()
      setTasks((prev) => [...prev, task])
      setNewTask({ title: '', owner: 'HR', category: 'OTHER', description: '' })
      setShowAdd(false)
    }
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return
    const res = await fetch(`/api/onboarding/tasks/${id}`, { method: 'DELETE' })
    if (res.ok) setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  async function saveDay1() {
    await fetch(`/api/onboarding/${props.employeeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day1ScheduleJson: day1, notes }),
    })
    startTransition(() => router.refresh())
  }

  async function markFullyOnboarded() {
    if (!confirm('Mark this employee as fully onboarded?')) return
    const res = await fetch(`/api/onboarding/${props.employeeId}/complete`, { method: 'POST' })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }))
      alert(error || 'Failed')
      return
    }
    startTransition(() => router.refresh())
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: tasks.filter((t) => t.category === cat).sort((a, b) => a.orderIndex - b.orderIndex),
  })).filter((g) => g.items.length > 0 || g.cat === 'OTHER')

  return (
    <div className="space-y-5">
      {/* Day 1 schedule */}
      <Card className="rounded-xl border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">Day 1 Schedule</h3>
        {props.canEdit ? (
          <textarea
            value={day1}
            onChange={(e) => setDay1(e.target.value)}
            onBlur={saveDay1}
            placeholder="e.g.&#10;09:00 - Welcome & coffee with manager&#10;10:00 - HR orientation&#10;11:00 - Office tour..."
            className="w-full min-h-[120px] border border-slate-200 rounded-md p-3 text-sm font-mono"
          />
        ) : (
          <pre className="text-xs text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded">{day1 || 'No schedule set yet.'}</pre>
        )}
      </Card>

      {/* Task groups */}
      {grouped.map(({ cat, items }) => (
        <Card key={cat} className="rounded-xl border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">{CATEGORY_LABELS[cat]}</h3>
            <p className="text-xs text-slate-500">{items.filter((i) => i.isComplete).length} / {items.length} done</p>
          </div>
          <div className="space-y-2">
            {items.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No tasks.</p>
            ) : items.map((t) => {
              const canCheck = props.canEdit
                || t.owner === props.viewerRole
                || (t.owner === 'IT' && props.viewerRole === 'HR_ADMIN')
                || (props.viewerRole === 'EMPLOYEE' && t.owner === 'EMPLOYEE')
              return (
                <div key={t.id} className={`flex items-start gap-3 p-2 rounded ${t.isComplete ? 'bg-emerald-50/50' : 'bg-slate-50/50'}`}>
                  <button
                    type="button"
                    disabled={!canCheck || pending}
                    onClick={() => toggleTask(t)}
                    className={`w-5 h-5 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 ${t.isComplete ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white'} disabled:opacity-40`}
                  >
                    {t.isComplete && <Check className="w-3 h-3" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${t.isComplete ? 'line-through text-slate-500' : 'text-slate-900'}`}>{t.title}</p>
                    {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">Owner: {t.owner}</p>
                  </div>
                  {props.canEdit && (
                    <button
                      type="button"
                      onClick={() => deleteTask(t.id)}
                      className="text-slate-400 hover:text-red-600 p-1"
                      title="Delete task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      ))}

      {props.canEdit && (
        <Card className="rounded-xl border-slate-200 p-5">
          {!showAdd ? (
            <Button onClick={() => setShowAdd(true)} variant="outline" size="sm">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Task
            </Button>
          ) : (
            <div className="space-y-2">
              <input
                value={newTask.title}
                onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                placeholder="Task title"
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              />
              <textarea
                value={newTask.description}
                onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
                placeholder="Description (optional)"
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <select
                  value={newTask.owner}
                  onChange={(e) => setNewTask((p) => ({ ...p, owner: e.target.value }))}
                  className="border border-slate-200 rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="HR">HR</option>
                  <option value="MANAGER">Manager</option>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="IT">IT</option>
                </select>
                <select
                  value={newTask.category}
                  onChange={(e) => setNewTask((p) => ({ ...p, category: e.target.value }))}
                  className="border border-slate-200 rounded-md px-2 py-1.5 text-sm"
                >
                  {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
                <Button onClick={addTask} size="sm">Add</Button>
                <Button onClick={() => setShowAdd(false)} variant="outline" size="sm">Cancel</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Notes */}
      <Card className="rounded-xl border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">Notes</h3>
        {props.canEdit ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveDay1}
            className="w-full min-h-[80px] border border-slate-200 rounded-md p-3 text-sm"
          />
        ) : (
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{notes || '—'}</p>
        )}
      </Card>

      {/* Mark fully onboarded */}
      {props.canEdit && (
        <Card className="rounded-xl border-slate-200 p-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Mark Onboarding Complete</h3>
            <p className="text-xs text-slate-500 mt-1">Enabled when all tasks are done AND the employee has been here ≥ 30 days.</p>
          </div>
          <Button onClick={markFullyOnboarded} disabled={!props.canMarkComplete}>
            Mark Fully Onboarded
          </Button>
        </Card>
      )}
    </div>
  )
}
