'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { FileText } from 'lucide-react'

const LETTER_OPTIONS = [
  { value: 'EXPERIENCE',         label: 'Experience Letter',          hint: 'For new job applications, visas, etc.' },
  { value: 'SALARY_CERTIFICATE', label: 'Salary Certificate',         hint: 'For bank loans, credit cards.' },
  { value: 'NOC_VISA',           label: 'NOC for Visa',               hint: 'For travelling abroad.' },
  { value: 'BONAFIDE',           label: 'Bonafide / Employment Verification', hint: 'For landlord, school, etc.' },
  { value: 'RELIEVING',          label: 'Relieving Letter',           hint: 'Issued on exit.' },
] as const

export function RequestLetterDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    letterType: 'EXPERIENCE' as (typeof LETTER_OPTIONS)[number]['value'],
    purpose: '',
    destinationCountry: '',
    bankName: '',
    travelFrom: '',
    travelTo: '',
  })

  function reset() {
    setForm({ letterType: 'EXPERIENCE', purpose: '', destinationCountry: '', bankName: '', travelFrom: '', travelTo: '' })
    setError('')
  }

  async function submit() {
    setError('')
    setSaving(true)
    const payload: Record<string, unknown> = {
      letterType: form.letterType,
      purpose: form.purpose || undefined,
    }
    if (form.letterType === 'NOC_VISA') {
      payload.destinationCountry = form.destinationCountry
      payload.travelFrom = form.travelFrom
      payload.travelTo = form.travelTo
    }
    if (form.letterType === 'SALARY_CERTIFICATE') {
      payload.bankName = form.bankName || undefined
    }
    const res = await fetch('/api/letters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error || 'Failed to submit request')
      return
    }
    setOpen(false)
    reset()
    router.refresh()
  }

  const selected = LETTER_OPTIONS.find((o) => o.value === form.letterType)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <FileText className="w-4 h-4" />
        Request a Letter
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request a Letter</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Letter Type</label>
              <Select value={form.letterType} onValueChange={(v) => setForm({ ...form, letterType: v as typeof form.letterType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LETTER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected && <p className="text-xs text-gray-500 mt-1">{selected.hint}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Purpose (optional)</label>
              <Input
                placeholder="e.g. for HBL home loan application"
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
            </div>

            {form.letterType === 'SALARY_CERTIFICATE' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                <Input
                  placeholder="e.g. HBL, Meezan Bank"
                  value={form.bankName}
                  onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                />
              </div>
            )}

            {form.letterType === 'NOC_VISA' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Destination Country</label>
                  <Input
                    placeholder="e.g. United Kingdom"
                    value={form.destinationCountry}
                    onChange={(e) => setForm({ ...form, destinationCountry: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Travel From</label>
                    <Input
                      type="date"
                      value={form.travelFrom}
                      onChange={(e) => setForm({ ...form, travelFrom: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Travel To</label>
                    <Input
                      type="date"
                      value={form.travelTo}
                      onChange={(e) => setForm({ ...form, travelTo: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'Submitting…' : 'Submit Request'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
