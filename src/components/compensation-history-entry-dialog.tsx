'use client'

/**
 * Edit dialog for a single CompensationHistory row.
 *
 * Lets HR change the effective date, type, old/new salary, and reason on
 * an existing timeline entry. The API recomputes incrementPct from the
 * final values, so we don't ask HR to type a percentage.
 *
 * Used by <CompensationPanel> when the user clicks the per-entry pencil.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  entry: {
    id: string
    effectiveDate: string
    type: string
    oldSalary: number
    newSalary: number
    reason: string | null
  }
}

const TYPES = [
  { value: 'HIRE',       label: 'Hire — Joining offer' },
  { value: 'INITIAL',    label: 'Initial Setup' },
  { value: 'INCREMENT',  label: 'Annual Increment' },
  { value: 'PROMOTION',  label: 'Promotion' },
  { value: 'BONUS',      label: 'Bonus' },
  { value: 'ADJUSTMENT', label: 'Market Adjustment' },
]

export default function CompensationHistoryEntryDialog({ open, onClose, entry }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    effectiveDate: entry.effectiveDate.split('T')[0],
    type: entry.type,
    oldSalary: entry.oldSalary,
    newSalary: entry.newSalary,
    reason: entry.reason ?? '',
  })

  const pct = form.oldSalary > 0
    ? ((form.newSalary - form.oldSalary) / form.oldSalary) * 100
    : null

  async function handleSave() {
    setError('')
    if (form.newSalary < 0 || form.oldSalary < 0) {
      setError('Salary values must be non-negative.'); return
    }
    setSaving(true)
    const res = await fetch(`/api/compensation/history/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        effectiveDate: form.effectiveDate,
        type: form.type,
        oldSalary: form.oldSalary,
        newSalary: form.newSalary,
        reason: form.reason.trim() ? form.reason.trim() : null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(data?.error ?? 'Failed to save.')
      return
    }
    onClose()
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Compensation History Entry</DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            Updates this single timeline entry. The percent change is
            recomputed automatically from old / new salary.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">
                Effective Date
              </label>
              <Input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm((p) => ({ ...p, effectiveDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">
                Type
              </label>
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">
                Old Salary (PKR)
              </label>
              <Input
                type="number"
                min={0}
                step={500}
                value={form.oldSalary}
                onChange={(e) => setForm((p) => ({ ...p, oldSalary: parseFloat(e.target.value) || 0 }))}
                className="tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">
                New Salary (PKR)
              </label>
              <Input
                type="number"
                min={0}
                step={500}
                value={form.newSalary}
                onChange={(e) => setForm((p) => ({ ...p, newSalary: parseFloat(e.target.value) || 0 }))}
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs flex items-center justify-between">
            <span className="text-slate-600">Recomputed change</span>
            <span className="font-semibold tabular-nums text-slate-900">
              {form.oldSalary > 0
                ? `${formatCurrency(form.newSalary - form.oldSalary)}${
                    pct != null ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)` : ''
                  }`
                : '—'}
            </span>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">
              Reason
            </label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
              rows={2}
              className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
              placeholder="e.g. FY26 annual review, promotion, joining offer…"
            />
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
