'use client'

/**
 * "Request Compensation Change" dialog.
 *
 * Three-step visual flow:
 *   1. Change details (type, effective date, reason)
 *   2. Pay component editing (with quick "+5% all" / "+10% basic" shortcuts)
 *   3. Side-by-side before/after comparison + notification controls
 *
 * Currently HR-only (immediate effect). Manager-proposed changes routed
 * through approvals would extend this component with a `mode="propose"` prop.
 */

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { TrendingUp, TrendingDown, Mail, Bell, Sparkles } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { calculateEOBI, calculateIncomeTax } from '@/lib/payroll'

type Salary = {
  basic: number
  houseRent: number
  utilities: number
  food: number
  fuel: number
  medicalAllowance: number
  otherAllowance: number
  monthlyPayDay?: number | null
} | null

interface Props {
  open: boolean
  onClose: () => void
  employeeId: string
  employeeName: string
  current: Salary
  // 'edit-current'  — modify the current Salary record (default)
  // 'add-history'   — backfill a historical CompensationHistory entry; the
  //                   "no changes to save" guard is skipped because the
  //                   intent is to record past data, not to change anything
  mode?: 'edit-current' | 'add-history'
}

const CHANGE_TYPES = [
  { value: 'INCREMENT',  label: 'Annual Increment', hint: 'Yearly merit raise based on performance review.' },
  { value: 'PROMOTION',  label: 'Promotion',        hint: 'Compensation aligned with a new role or band.' },
  { value: 'BONUS',      label: 'Bonus',            hint: 'One-off variable payment.' },
  { value: 'ADJUSTMENT', label: 'Market Adjustment',hint: 'Correction for market parity or cost of living.' },
  { value: 'INITIAL',    label: 'Initial Setup',    hint: 'First compensation record for the employee.' },
]

export default function EditSalaryDialog({
  open, onClose, employeeId, employeeName, current, mode = 'edit-current',
}: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isAddHistory = mode === 'add-history'

  const [form, setForm] = useState({
    basic:             current?.basic            ?? 0,
    houseRent:         current?.houseRent        ?? 0,
    utilities:         current?.utilities        ?? 0,
    food:              current?.food             ?? 0,
    fuel:              current?.fuel             ?? 0,
    medicalAllowance:  current?.medicalAllowance ?? 0,
    otherAllowance:    current?.otherAllowance   ?? 0,
    effectiveFrom: isAddHistory ? '' : new Date().toISOString().split('T')[0],
    type: isAddHistory ? 'INCREMENT' : (current ? 'INCREMENT' : 'INITIAL'),
    reason: '',
    notifyInApp: !isAddHistory,
    notifyEmail: !isAddHistory,
    monthlyPayDay: current?.monthlyPayDay ?? '' as number | '',
  })

  const oldGross = useMemo(() => current
    ? current.basic + current.houseRent + current.utilities + current.food +
      current.fuel + current.medicalAllowance + current.otherAllowance
    : 0
  , [current])

  const newGross =
    form.basic + form.houseRent + form.utilities + form.food +
    form.fuel + form.medicalAllowance + form.otherAllowance
  const diff = newGross - oldGross
  const pct = oldGross > 0 ? (diff / oldGross) * 100 : null

  // ─── Net Pay calculation (after EOBI + income tax) ───
  // EOBI: 1% of basic capped at PKR 370/month (Pakistan)
  // Income tax: progressive slabs applied to annual gross, divided by 12
  function computeNet(basic: number, gross: number): number {
    const eobi = calculateEOBI(basic, 0.01, 370)
    const annualTax = calculateIncomeTax(gross * 12)
    const monthlyTax = Math.round(annualTax / 12)
    return Math.max(0, gross - eobi - monthlyTax)
  }
  const oldNet = current ? computeNet(current.basic, oldGross) : 0
  const newNet = computeNet(form.basic, newGross)
  const netDiff = newNet - oldNet
  const netPct = oldNet > 0 ? (netDiff / oldNet) * 100 : null

  const selectedType = CHANGE_TYPES.find((t) => t.value === form.type)

  function f<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((p) => ({ ...p, [k]: v }))
  }

  function applyPercentToAll(p: number) {
    const factor = 1 + p / 100
    setForm((prev) => ({
      ...prev,
      basic:            Math.round(prev.basic            * factor),
      houseRent:        Math.round(prev.houseRent        * factor),
      utilities:        Math.round(prev.utilities        * factor),
      food:             Math.round(prev.food             * factor),
      fuel:             Math.round(prev.fuel             * factor),
      medicalAllowance: Math.round(prev.medicalAllowance * factor),
      otherAllowance:   Math.round(prev.otherAllowance   * factor),
    }))
  }

  function reset() {
    if (!current) return
    setForm((prev) => ({
      ...prev,
      basic:            current.basic,
      houseRent:        current.houseRent,
      utilities:        current.utilities,
      food:             current.food,
      fuel:             current.fuel,
      medicalAllowance: current.medicalAllowance,
      otherAllowance:   current.otherAllowance,
    }))
  }

  async function handleSave() {
    setError('')
    if (form.basic <= 0) { setError('Basic salary must be greater than zero.'); return }

    if (isAddHistory) {
      // Backfill mode: NO "no changes" guard — HR is recording past data.
      if (!form.effectiveFrom) {
        setError('Effective date is required when adding a historical entry.'); return
      }
      const eff = new Date(form.effectiveFrom)
      if (eff > new Date()) {
        setError('Historical effective date must be in the past.'); return
      }
    } else {
      if (current && diff === 0) {
        setError('No changes to save. Adjust at least one pay component first.'); return
      }
      if (current && !form.reason.trim()) {
        setError('Please provide a reason for this compensation change.'); return
      }
    }

    // Validate monthlyPayDay if provided (1–31)
    if (form.monthlyPayDay !== '' && (form.monthlyPayDay < 1 || form.monthlyPayDay > 31)) {
      setError('Monthly pay date must be between 1 and 31.'); return
    }

    setSaving(true)
    const endpoint = isAddHistory
      ? `/api/employees/${employeeId}/salary/history`
      : `/api/employees/${employeeId}/salary`
    const res = await fetch(endpoint, {
      method: isAddHistory ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        monthlyPayDay: form.monthlyPayDay === '' ? null : Number(form.monthlyPayDay),
        notifyEmployee: !isAddHistory && (form.notifyInApp || form.notifyEmail),
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Failed to save'); return }
    onClose()
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">

        {/* ─── Header ───────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-6 py-5">
          <DialogHeader>
            <DialogTitle className="text-white text-lg">
              {isAddHistory
                ? 'Add Historical Compensation Entry'
                : current
                  ? 'Request Compensation Change'
                  : 'Set Initial Compensation'}
            </DialogTitle>
            <p className="text-sm text-slate-300 mt-1">
              {employeeName} · This change will be logged and{' '}
              {form.notifyInApp || form.notifyEmail ? 'communicated to the employee.' : 'kept private from the employee.'}
            </p>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* ─── 1. Change metadata ────────────────────────────── */}
          <section>
            <SectionHead step={1} title="Change Details" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Change Type</Label>
                <Select value={form.type} onValueChange={(v) => f('type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANGE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedType && <p className="text-[11px] text-slate-500 mt-1">{selectedType.hint}</p>}
              </div>
              <div>
                <Label>Effective From {isAddHistory && <span className="text-red-500">*</span>}</Label>
                <Input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(e) => f('effectiveFrom', e.target.value)}
                  max={isAddHistory ? new Date().toISOString().split('T')[0] : undefined}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {isAddHistory
                    ? 'Past date this compensation took effect.'
                    : 'Applied to the next payroll run on or after this date.'}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <Label>Monthly Pay Date (optional)</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={form.monthlyPayDay}
                onChange={(e) => {
                  const v = e.target.value
                  f('monthlyPayDay', v === '' ? '' as never : (parseInt(v, 10) || '' as never))
                }}
                placeholder="e.g. 5 (paid on the 5th)"
                className="w-40 tabular-nums"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Day-of-month the salary is paid. Leave blank to inherit the org default.
              </p>
            </div>
            <div className="mt-3">
              <Label>Reason / Justification {current && <span className="text-red-500">*</span>}</Label>
              <textarea
                value={form.reason}
                onChange={(e) => f('reason', e.target.value)}
                rows={2}
                className="w-full text-sm rounded-md border border-slate-200 px-3 py-2"
                placeholder='e.g. "FY26 annual review — exceeded goals", "Promotion to Senior UI/UX Designer", "Bringing to market median per Q2 survey"…'
              />
            </div>
          </section>

          {/* ─── 2. Pay components ──────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <SectionHead step={2} title="Pay Components" inline />
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-500 mr-1">Quick raise:</span>
                {[5, 10, 15].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyPercentToAll(p)}
                    className="text-[11px] px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                  >
                    +{p}%
                  </button>
                ))}
                {current && (
                  <button
                    type="button"
                    onClick={reset}
                    className="text-[11px] px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 ml-1"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MoneyField label="Basic Salary" required value={form.basic}            onChange={(v) => f('basic', v)} />
              <MoneyField label="House Rent"            value={form.houseRent}        onChange={(v) => f('houseRent', v)} />
              <MoneyField label="Utilities"             value={form.utilities}        onChange={(v) => f('utilities', v)} />
              <MoneyField label="Food Allowance"        value={form.food}             onChange={(v) => f('food', v)} />
              <MoneyField label="Fuel Allowance"        value={form.fuel}             onChange={(v) => f('fuel', v)} />
              <MoneyField label="Medical Allowance"     value={form.medicalAllowance} onChange={(v) => f('medicalAllowance', v)} />
              <MoneyField label="Other Allowances"      value={form.otherAllowance}   onChange={(v) => f('otherAllowance', v)} />
            </div>
          </section>

          {/* ─── 3. Before / after comparison ─────────────────── */}
          <section>
            <SectionHead step={3} title="Review & Confirm" />
            <div className="grid grid-cols-3 gap-3">
              <SummaryCard label="Previous Gross"  value={oldGross > 0 ? formatCurrency(oldGross) : '—'} tone="neutral" />
              <SummaryCard label="New Gross"       value={formatCurrency(newGross)} tone="primary" />
              <SummaryCard
                label="Gross Change"
                value={
                  diff === 0
                    ? '—'
                    : `${diff > 0 ? '+' : ''}${formatCurrency(diff)}${pct != null ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)` : ''}`
                }
                tone={diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'neutral'}
                icon={diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Sparkles}
              />
            </div>

            {/* Net Pay (take-home) row — after EOBI + income tax */}
            <div className="grid grid-cols-3 gap-3 mt-3">
              <SummaryCard label="Previous Net"  value={oldNet > 0 ? formatCurrency(oldNet) : '—'} tone="neutral" />
              <SummaryCard label="New Net"       value={formatCurrency(newNet)} tone="primary" />
              <SummaryCard
                label="Net Change"
                value={
                  netDiff === 0
                    ? '—'
                    : `${netDiff > 0 ? '+' : ''}${formatCurrency(netDiff)}${netPct != null ? ` (${netPct > 0 ? '+' : ''}${netPct.toFixed(1)}%)` : ''}`
                }
                tone={netDiff > 0 ? 'positive' : netDiff < 0 ? 'negative' : 'neutral'}
                icon={netDiff > 0 ? TrendingUp : netDiff < 0 ? TrendingDown : Sparkles}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Net = Gross − EOBI (1% basic, PKR 370 cap) − Income Tax (per PK slabs).
              Other deductions (loans, advances, healthcare) are applied at payroll-run time.
            </p>

            {/* Notification controls — hidden in add-history mode (we're
                recording past data, not announcing a change) */}
            {!isAddHistory && (
            <div className="mt-4 border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/50">
              <p className="text-[11px] uppercase tracking-wider text-slate-600 font-semibold">
                Communication
              </p>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.notifyInApp}
                  onChange={(e) => f('notifyInApp', e.target.checked)}
                />
                <Bell className="w-3.5 h-3.5 text-slate-400" />
                Send in-app notification to {employeeName}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.notifyEmail}
                  onChange={(e) => f('notifyEmail', e.target.checked)}
                />
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                Email the change summary (queued if SMTP not configured)
              </label>
              <p className="text-[11px] text-slate-500 italic">
                The audit log is always written regardless of notification choice.
              </p>
            </div>
            )}
          </section>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-200 bg-slate-50">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? 'Saving…' : isAddHistory ? 'Add History Entry' : current ? 'Submit Change' : 'Set Salary'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SectionHead({ step, title, inline }: { step: number; title: string; inline?: boolean }) {
  const body = (
    <div className="flex items-center gap-2">
      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
        {step}
      </span>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    </div>
  )
  return inline ? body : <div className="mb-3">{body}</div>
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">
      {children}
    </label>
  )
}

function MoneyField({
  label, value, onChange, required,
}: {
  label: string; value: number; onChange: (v: number) => void; required?: boolean
}) {
  return (
    <div>
      <Label>{label}{required && <span className="text-red-500"> *</span>}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-semibold pointer-events-none">PKR</span>
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

function SummaryCard({ label, value, tone, icon: Icon }: {
  label: string; value: string; tone: 'neutral' | 'primary' | 'positive' | 'negative';
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const tones = {
    neutral:  'bg-slate-50 border-slate-200 text-slate-900',
    primary:  'bg-blue-50 border-blue-200 text-blue-900',
    positive: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    negative: 'bg-rose-50 border-rose-200 text-rose-900',
  }
  return (
    <div className={`border rounded-lg p-3 ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70 mb-1">{label}</p>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="w-4 h-4" />}
        <p className="text-base font-bold tabular-nums">{value}</p>
      </div>
    </div>
  )
}
