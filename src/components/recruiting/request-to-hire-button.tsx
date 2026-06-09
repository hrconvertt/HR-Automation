'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Briefcase, Plus } from 'lucide-react'

interface Dept { id: string; name: string }

/**
 * Floating "Request to hire" button + dialog. Manager-only;
 * HR uses the same flow but the request is auto-approved.
 *
 *   role='MANAGER'  → submits with status=PENDING, sent to HR for approval
 *   role='HR_ADMIN' → submits with status=OPEN, immediately public
 */
export function RequestToHireButton({ role }: { role: 'MANAGER' | 'HR_ADMIN' }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [departments, setDepartments] = useState<Dept[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '',
    departmentId: '',
    type: 'FULL_TIME',
    vacancies: 1,
    requestReason: 'REPLACEMENT',
    requestNote: '',
    closingDate: '',
    scoreThreshold: 60,
  })

  useEffect(() => {
    if (!open) return
    fetch('/api/employees/departments')
      .then((r) => r.json())
      .then((d) => setDepartments(d.departments ?? []))
  }, [open])

  async function submit() {
    setError('')
    if (!form.title.trim()) { setError('Job title is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/recruiting/requisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      setSaving(false)
      if (!res.ok) {
        // Show whatever the API returned — preview-mode block, missing employee, etc.
        setError(data.error || `Submit failed (HTTP ${res.status})`)
        return
      }
      setOpen(false)
      setForm({
        title: '', departmentId: '', type: 'FULL_TIME', vacancies: 1,
        requestReason: 'REPLACEMENT', requestNote: '', closingDate: '',
        scoreThreshold: 60,
      })
      router.refresh()
      return
    } catch (e) {
      setSaving(false)
      setError(e instanceof Error ? e.message : 'Network error')
      return
    }
  }

  const isManager = role === 'MANAGER'

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="w-4 h-4 mr-1.5" />
        {isManager ? 'Request to Hire' : 'New Requisition'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-blue-600" />
              {isManager ? 'Request to Hire' : 'New Job Requisition'}
            </DialogTitle>
          </DialogHeader>

          {isManager && (
            <div className="rounded-md bg-blue-50 border border-blue-100 text-xs text-blue-900 px-3 py-2">
              Your request will be sent to HR for approval. You&apos;ll be notified once HR decides.
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Job Title *</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Senior Shopify Developer"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                <Select value={form.departmentId} onValueChange={(v) => setForm({ ...form, departmentId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_TIME">Full-time</SelectItem>
                    <SelectItem value="PART_TIME">Part-time</SelectItem>
                    <SelectItem value="INTERNSHIP">Internship</SelectItem>
                    <SelectItem value="TRAINEE">Trainee</SelectItem>
                    <SelectItem value="CONTRACT">Contract</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vacancies</label>
                <Input
                  type="number"
                  min={1}
                  value={form.vacancies}
                  onChange={(e) => setForm({ ...form, vacancies: Math.max(1, Number(e.target.value) || 1) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
                <Select value={form.requestReason} onValueChange={(v) => setForm({ ...form, requestReason: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REPLACEMENT">Replacement</SelectItem>
                    <SelectItem value="GROWTH">Growth / new role</SelectItem>
                    <SelectItem value="BACKFILL">Backfill</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Target Closing Date <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <Input
                  type="date"
                  value={form.closingDate}
                  onChange={(e) => setForm({ ...form, closingDate: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quality Score Threshold</label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.scoreThreshold}
                  onChange={(e) => setForm({ ...form, scoreThreshold: Math.max(1, Math.min(100, Number(e.target.value) || 60)) })}
                />
                <p className="text-[11px] text-slate-500 mt-1">Candidates scoring above this are auto-added to Talent Pool on rejection.</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Justification <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={form.requestNote}
                onChange={(e) => setForm({ ...form, requestNote: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Why is this hire needed? Any context HR should know?"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? 'Submitting…' : (isManager ? 'Submit Request' : 'Create Requisition')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
