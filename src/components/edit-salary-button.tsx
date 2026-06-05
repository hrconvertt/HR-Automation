'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Pencil, TrendingUp, TrendingDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Props {
  employeeId: string
  employeeName: string
  current: {
    basic: number
    houseRent: number
    utilities: number
    food: number
    fuel: number
    medicalAllowance: number
    otherAllowance: number
  } | null
}

export default function EditSalaryButton({ employeeId, employeeName, current }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    basic: current?.basic ?? 0,
    houseRent: current?.houseRent ?? 0,
    utilities: current?.utilities ?? 0,
    food: current?.food ?? 0,
    fuel: current?.fuel ?? 0,
    medicalAllowance: current?.medicalAllowance ?? 0,
    otherAllowance: current?.otherAllowance ?? 0,
    effectiveFrom: new Date().toISOString().split('T')[0],
    type: current ? 'INCREMENT' : 'INITIAL',
    reason: '',
    notifyEmployee: true,
  })

  const oldGross = current
    ? current.basic + current.houseRent + current.utilities + current.food +
      current.fuel + current.medicalAllowance + current.otherAllowance
    : 0
  const newGross =
    form.basic + form.houseRent + form.utilities + form.food +
    form.fuel + form.medicalAllowance + form.otherAllowance
  const diff = newGross - oldGross
  const pct = oldGross > 0 ? (diff / oldGross) * 100 : null

  function setField(k: keyof typeof form, v: number | string | boolean) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  async function handleSave() {
    setError('')
    if (form.basic <= 0) { setError('Basic salary must be greater than 0'); return }
    setSaving(true)
    const res = await fetch(`/api/employees/${employeeId}/salary`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Failed to save'); return }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="w-3.5 h-3.5" />
        {current ? 'Edit Salary' : 'Set Salary'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {current ? 'Update Salary' : 'Set Initial Salary'} — {employeeName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              All figures in PKR per month. Changes are recorded in the employee's
              compensation history and reflected in future payroll runs.
            </p>

            {/* Salary components grid */}
            <div className="grid grid-cols-2 gap-3">
              <MoneyField label="Basic Salary *" value={form.basic} onChange={(v) => setField('basic', v)} />
              <MoneyField label="House Rent" value={form.houseRent} onChange={(v) => setField('houseRent', v)} />
              <MoneyField label="Utilities" value={form.utilities} onChange={(v) => setField('utilities', v)} />
              <MoneyField label="Food Allowance" value={form.food} onChange={(v) => setField('food', v)} />
              <MoneyField label="Fuel Allowance" value={form.fuel} onChange={(v) => setField('fuel', v)} />
              <MoneyField label="Medical Allowance" value={form.medicalAllowance} onChange={(v) => setField('medicalAllowance', v)} />
              <MoneyField label="Other Allowances" value={form.otherAllowance} onChange={(v) => setField('otherAllowance', v)} />
            </div>

            {/* Live total */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Previous gross</span>
                <span className="text-slate-700 tabular-nums">{oldGross > 0 ? formatCurrency(oldGross) : '—'}</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span className="text-slate-700">New gross</span>
                <span className="text-slate-900 tabular-nums">{formatCurrency(newGross)}</span>
              </div>
              {oldGross > 0 && diff !== 0 && (
                <div className={`flex justify-between text-sm font-semibold ${diff > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  <span className="flex items-center gap-1">
                    {diff > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    Change
                  </span>
                  <span className="tabular-nums">
                    {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                    {pct != null && ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`}
                  </span>
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Effective From *</label>
                <Input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(e) => setField('effectiveFrom', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Change Type</label>
                <Select value={form.type} onValueChange={(v) => setField('type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCREMENT">Annual Increment</SelectItem>
                    <SelectItem value="PROMOTION">Promotion</SelectItem>
                    <SelectItem value="BONUS">Bonus / One-off</SelectItem>
                    <SelectItem value="ADJUSTMENT">Correction / Adjustment</SelectItem>
                    <SelectItem value="INITIAL">Initial Setup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reason / Justification</label>
              <textarea
                value={form.reason}
                onChange={(e) => setField('reason', e.target.value)}
                rows={2}
                className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
                placeholder="e.g. Promotion to Senior Designer, 15% market adjustment, etc."
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.notifyEmployee}
                onChange={(e) => setField('notifyEmployee', e.target.checked)}
              />
              Notify employee in-app
            </label>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : current ? 'Save Changes' : 'Set Salary'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function MoneyField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">PKR</span>
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="pl-12 tabular-nums"
          min={0}
          step={500}
        />
      </div>
    </div>
  )
}
