'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Briefcase, Mail } from 'lucide-react'

interface Props {
  candidateId: string
  candidateName: string
  roleTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Create Offer dialog — used when HR moves a candidate to OFFER stage.
 *
 *   Captures salary, joining date, expiry, optional note → POSTs to
 *   /api/recruiting/offers which creates the JobOffer row, advances the
 *   candidate to OFFER stage, and drafts the offer-letter email.
 */
export function CreateOfferDialog({ candidateId, candidateName, roleTitle, open, onOpenChange }: Props) {
  const router = useRouter()
  const [salary, setSalary] = useState('')
  const [joiningDate, setJoiningDate] = useState(defaultJoiningDate())
  const [expiryDate, setExpiryDate] = useState(defaultExpiryDate())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    const salaryNum = Number(salary)
    if (!Number.isFinite(salaryNum) || salaryNum <= 0) { setError('Enter a valid salary'); return }
    setSaving(true)
    const res = await fetch('/api/recruiting/offers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId, salary: salaryNum, joiningDate, expiryDate, note }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Failed to create offer'); return }
    onOpenChange(false)
    setSalary(''); setNote('')
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-blue-600" />
            Create Offer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
            <span className="font-medium text-slate-900">{candidateName}</span>
            <span className="text-slate-400 mx-1.5">·</span>
            {roleTitle}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Salary (PKR / month) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">PKR</span>
              <Input
                type="number" min={0} step={1000}
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="150000"
                className="pl-12 tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Joining Date</label>
              <Input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Offer Expires</label>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Note <span className="text-slate-400 font-normal normal-case">(optional — included in the offer letter)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Reporting line, key first deliverable, sign-on bonus details…"
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div className="rounded-md bg-blue-50 border border-blue-100 text-xs text-blue-900 px-3 py-2 flex items-start gap-2">
            <Mail className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>On save: candidate moves to <strong>OFFER</strong> stage, a JobOffer record is created, and an offer letter email is drafted in the Email Queue for you to review before sending.</span>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !salary}>
            {saving ? 'Saving…' : 'Create Offer & Draft Letter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function defaultJoiningDate(): string {
  // Next month, 1st of month.
  const d = new Date()
  d.setMonth(d.getMonth() + 1, 1)
  return d.toISOString().slice(0, 10)
}
function defaultExpiryDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}
