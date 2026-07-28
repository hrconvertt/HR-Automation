'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { UserPlus } from 'lucide-react'

interface Req { id: string; title: string }

/**
 * "Add Candidate" — adds a person to the top of the pipeline for an OPEN
 * requisition. HR / Manager only (API enforces).
 */
export function AddCandidateButton({ openRequisitions }: { openRequisitions: Req[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '',
    requisitionId: '', currentCompany: '', currentRole: '',
    experience: '' as string, source: 'LINKEDIN',
    notes: '',
  })

  useEffect(() => {
    // Pre-pick the first open req
    if (open && openRequisitions[0] && !form.requisitionId) {
      setForm((f) => ({ ...f, requisitionId: openRequisitions[0].id }))
    }
  }, [open, openRequisitions, form.requisitionId])

  async function submit() {
    setError('')
    if (!form.fullName.trim()) { setError('Name is required'); return }
    if (!form.email.trim())    { setError('Email is required'); return }
    if (!form.requisitionId)   { setError('Pick the role they applied for'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/recruiting/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          experience: form.experience ? Number(form.experience) : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      setSaving(false)
      if (!res.ok) { setError(data.error || `Failed (HTTP ${res.status})`); return }
      setOpen(false)
      setForm({
        fullName: '', email: '', phone: '',
        requisitionId: '', currentCompany: '', currentRole: '',
        experience: '', source: 'LINKEDIN', notes: '',
      })
      router.refresh()
    } catch (e) {
      setSaving(false)
      setError(e instanceof Error ? e.message : 'Network error')
    }
  }

  const noOpenRoles = openRequisitions.length === 0

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={noOpenRoles} title={noOpenRoles ? 'No open requisitions — open or approve one first' : 'Add a candidate to the pipeline'}>
        <UserPlus className="w-4 h-4 mr-1.5" />
        Add Candidate
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-slate-700" /> Add Candidate
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Applying for *</label>
              <Select value={form.requisitionId} onValueChange={(v) => setForm({ ...form, requisitionId: v })}>
                <SelectTrigger><SelectValue placeholder="Pick an open role" /></SelectTrigger>
                <SelectContent>
                  {openRequisitions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Ahmed Khan" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ahmed@example.com" type="email" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+92 300 1234567" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LINKEDIN">LinkedIn</SelectItem>
                    <SelectItem value="REFERRAL">Referral</SelectItem>
                    <SelectItem value="PORTAL">Job Portal</SelectItem>
                    <SelectItem value="WALK_IN">Walk-in</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Current Company</label>
                <Input value={form.currentCompany} onChange={(e) => setForm({ ...form, currentCompany: e.target.value })} placeholder="—" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Years Experience</label>
                <Input value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} type="number" min={0} step={0.5} placeholder="2.5" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="Any context — referrer name, key skills, follow-up reminders…"
                className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-100"
              />
            </div>

            {error && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'Adding…' : 'Add to Pipeline'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
