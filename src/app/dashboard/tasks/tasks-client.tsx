'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { CheckSquare, Play, Plus } from 'lucide-react'

interface Task {
  id: string
  status: string
  assignedAt: string
  startedAt: string | null
  completedAt: string | null
  actualHours: number | null
  qualityScore: number | null
  efficiency: number | null
  delayReason: string | null
  delayJustified: boolean
  customName: string | null
  customExpectedHours: number | null
  notes: string | null
  employee: { id: string; fullName: string; employeeCode: string } | null
  template: { name: string; expectedHours: number; complexity: string } | null
}

interface Template {
  id: string
  name: string
  description: string | null
  expectedHours: number
  complexity: string
  departmentName: string | null
  departmentId: string | null
  isActive: boolean
}

interface Props {
  role: string
  myTasks: Task[]
  teamTasks: Task[]
  templates: Template[]
  departments: { id: string; name: string }[]
  reports: { id: string; fullName: string; designation: string }[]
}

function taskTitle(t: Task) { return t.template?.name ?? t.customName ?? '(unnamed task)' }
function expectedHours(t: Task) { return t.template?.expectedHours ?? t.customExpectedHours ?? null }

const STATUS_TONE: Record<string, string> = {
  ASSIGNED: 'bg-slate-100 text-slate-700',
  IN_PROGRESS: 'bg-slate-100 text-slate-900',
  COMPLETED: 'bg-slate-100 text-slate-900',
  SCORED: 'bg-slate-100 text-slate-900',
}

export function TasksClient({ role, myTasks, teamTasks, templates, departments, reports }: Props) {
  const isHR = role === 'HR_ADMIN'
  const isManager = role === 'MANAGER'

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <CheckSquare className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
            <p className="text-white/85 text-sm mt-1">Per-task efficiency = expected ÷ actual. Quality scored 1–5 by manager.</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="mine">
        <TabsList className="bg-white border border-slate-200 rounded-lg p-1 inline-flex">
          <TabsTrigger value="mine">My Tasks</TabsTrigger>
          {(isHR || isManager) && <TabsTrigger value="team">Team Tasks</TabsTrigger>}
          {isHR && <TabsTrigger value="catalog">Task Catalog</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine" className="mt-4">
          <MyTasksView tasks={myTasks} />
        </TabsContent>

        {(isHR || isManager) && (
          <TabsContent value="team" className="mt-4">
            <TeamTasksView tasks={teamTasks} templates={templates} reports={reports} />
          </TabsContent>
        )}

        {isHR && (
          <TabsContent value="catalog" className="mt-4">
            <CatalogView templates={templates} departments={departments} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

function MyTasksView({ tasks }: { tasks: Task[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [completeOpen, setCompleteOpen] = useState<Task | null>(null)
  const [actualHours, setActualHours] = useState('')
  const [delayReason, setDelayReason] = useState('')

  async function act(id: string, body: Record<string, unknown>) {
    setBusyId(id)
    await fetch(`/api/tasks/assignments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusyId(null)
    router.refresh()
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">My Tasks ({tasks.length})</h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-500">No tasks assigned to you.</p>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => {
            const exp = expectedHours(t)
            const overrun = t.actualHours && exp ? t.actualHours > exp : false
            return (
              <div key={t.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900">{taskTitle(t)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Expected: {exp != null ? `${exp}h` : '—'}
                      {t.actualHours != null && ` · Actual: ${t.actualHours}h`}
                      {t.efficiency != null && ` · Eff: ${(t.efficiency * 100).toFixed(0)}%`}
                    </p>
                  </div>
                  <Badge className={STATUS_TONE[t.status] ?? 'bg-slate-100'}>{t.status}</Badge>
                </div>
                {t.delayReason && (
                  <p className="text-xs text-slate-700 mt-2 bg-slate-50 border border-slate-100 rounded p-2">
                    Delay reason: {t.delayReason} {t.delayJustified && <span className="text-slate-700 ml-1">✓ justified</span>}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  {t.status === 'ASSIGNED' && (
                    <Button size="sm" onClick={() => act(t.id, { action: 'START' })} disabled={busyId === t.id}>
                      <Play className="w-3.5 h-3.5 mr-1" /> Start
                    </Button>
                  )}
                  {t.status === 'IN_PROGRESS' && (
                    <Button size="sm" onClick={() => { setCompleteOpen(t); setActualHours(''); setDelayReason('') }} disabled={busyId === t.id}>
                      Complete
                    </Button>
                  )}
                  {overrun && <span className="text-xs text-slate-700">Overrun</span>}
                  {t.qualityScore != null && (
                    <span className="text-xs text-slate-700 font-semibold">Quality: {t.qualityScore}/5</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={!!completeOpen} onOpenChange={(o) => { if (!o) setCompleteOpen(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Complete Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-700">{completeOpen && taskTitle(completeOpen)}</p>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Actual hours spent</label>
              <Input type="number" min={0.1} step={0.1} value={actualHours} onChange={(e) => setActualHours(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Delay reason (optional)</label>
              <Input value={delayReason} onChange={(e) => setDelayReason(e.target.value)} placeholder="If you went over expected" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!completeOpen) return
                const h = Number(actualHours)
                if (!Number.isFinite(h) || h <= 0) return
                act(completeOpen.id, { action: 'COMPLETE', actualHours: h, delayReason: delayReason || undefined })
                setCompleteOpen(null)
              }}
            >Mark Complete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function TeamTasksView({ tasks, templates, reports }: { tasks: Task[]; templates: Template[]; reports: { id: string; fullName: string; designation: string }[] }) {
  const router = useRouter()
  const [assignOpen, setAssignOpen] = useState(false)
  const [scoreOpenId, setScoreOpenId] = useState<string | null>(null)
  const [score, setScore] = useState(4)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ employeeId: '', templateId: '', customName: '', customExpectedHours: '', notes: '' })

  async function submit() {
    setErr('')
    if (!form.employeeId) { setErr('Pick an employee'); return }
    if (!form.templateId && !form.customName.trim()) { setErr('Pick a template or enter a custom name'); return }
    const body: Record<string, unknown> = { employeeId: form.employeeId, notes: form.notes }
    if (form.templateId) body.templateId = form.templateId
    else { body.customName = form.customName; body.customExpectedHours = Number(form.customExpectedHours) }
    setBusy(true)
    const r = await fetch('/api/tasks/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Failed'); return }
    setAssignOpen(false)
    setForm({ employeeId: '', templateId: '', customName: '', customExpectedHours: '', notes: '' })
    router.refresh()
  }

  async function submitScore(id: string) {
    setBusy(true)
    await fetch(`/api/tasks/assignments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'SCORE_QUALITY', qualityScore: score }),
    })
    setBusy(false)
    setScoreOpenId(null)
    router.refresh()
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Team Tasks ({tasks.length})</h2>
        <Button size="sm" onClick={() => setAssignOpen(true)}><Plus className="w-4 h-4 mr-1" /> Assign Task</Button>
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-500">No tasks assigned to your team yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead>Efficiency</TableHead>
                <TableHead>Quality</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => {
                const exp = expectedHours(t)
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.employee?.fullName ?? '—'}</TableCell>
                    <TableCell>{taskTitle(t)}</TableCell>
                    <TableCell className="tabular-nums">{exp != null ? `${exp}h` : '—'}</TableCell>
                    <TableCell className="tabular-nums">{t.actualHours != null ? `${t.actualHours}h` : '—'}</TableCell>
                    <TableCell className="tabular-nums">{t.efficiency != null ? `${(t.efficiency * 100).toFixed(0)}%` : '—'}</TableCell>
                    <TableCell className="tabular-nums">{t.qualityScore != null ? `${t.qualityScore}/5` : '—'}</TableCell>
                    <TableCell><Badge className={STATUS_TONE[t.status] ?? 'bg-slate-100'}>{t.status}</Badge></TableCell>
                    <TableCell>
                      {t.status === 'COMPLETED' && (
                        <Button size="sm" variant="outline" onClick={() => { setScoreOpenId(t.id); setScore(4) }}>Score</Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Employee</label>
              <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                <SelectTrigger><SelectValue placeholder="Pick employee" /></SelectTrigger>
                <SelectContent>
                  {reports.map((r) => <SelectItem key={r.id} value={r.id}>{r.fullName} · {r.designation}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">From Catalog (or leave blank for custom)</label>
              <Select value={form.templateId} onValueChange={(v) => setForm({ ...form, templateId: v })}>
                <SelectTrigger><SelectValue placeholder="Pick template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} · {t.expectedHours}h</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!form.templateId && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Custom name</label>
                  <Input value={form.customName} onChange={(e) => setForm({ ...form, customName: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Expected hours</label>
                  <Input type="number" min={0.1} step={0.1} value={form.customExpectedHours} onChange={(e) => setForm({ ...form, customExpectedHours: e.target.value })} />
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {err && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Assign'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!scoreOpenId} onOpenChange={(o) => { if (!o) setScoreOpenId(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Score Quality</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-700 mb-1">Quality (1-5)</label>
            <Input type="number" min={1} max={5} value={score} onChange={(e) => setScore(Math.max(1, Math.min(5, Number(e.target.value) || 1)))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScoreOpenId(null)}>Cancel</Button>
            <Button onClick={() => scoreOpenId && submitScore(scoreOpenId)} disabled={busy}>Save Score</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function CatalogView({ templates, departments }: { templates: Template[]; departments: { id: string; name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ name: '', description: '', expectedHours: '4', complexity: 'MEDIUM', departmentId: '' })

  async function submit() {
    setErr('')
    if (!form.name.trim()) { setErr('Name required'); return }
    setBusy(true)
    const r = await fetch('/api/tasks/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, expectedHours: Number(form.expectedHours) }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Failed'); return }
    setOpen(false)
    setForm({ name: '', description: '', expectedHours: '4', complexity: 'MEDIUM', departmentId: '' })
    router.refresh()
  }

  async function archive(id: string) {
    if (!confirm('Archive this template? Existing assignments are preserved.')) return
    await fetch(`/api/tasks/templates/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Task Catalog ({templates.length})</h2>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> New Template</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Expected Hours</TableHead>
            <TableHead>Complexity</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-8">No templates yet. Create one to standardize task durations.</TableCell></TableRow>
          ) : (
            templates.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}{t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}</TableCell>
                <TableCell>{t.departmentName ?? '—'}</TableCell>
                <TableCell className="tabular-nums">{t.expectedHours}h</TableCell>
                <TableCell><Badge variant="secondary">{t.complexity}</Badge></TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => archive(t.id)}>Archive</Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Task Template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Landing page design" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
              <textarea className="w-full rounded-md border border-slate-300 p-2 text-sm" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Expected Hours</label>
                <Input type="number" min={0.5} step={0.5} value={form.expectedHours} onChange={(e) => setForm({ ...form, expectedHours: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Complexity</label>
                <Select value={form.complexity} onValueChange={(v) => setForm({ ...form, complexity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">LOW</SelectItem>
                    <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                    <SelectItem value="HIGH">HIGH</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
                <Select value={form.departmentId} onValueChange={(v) => setForm({ ...form, departmentId: v })}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {err && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
