'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function PayrollConfigSettingsPage() {
  const [standardHoursPerDay, setStandardHoursPerDay] = useState(8)
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(2)
  const [lateThresholdHour, setLateThresholdHour] = useState(10)
  const [lateThresholdMinute, setLateThresholdMinute] = useState(15)
  const [eobiEnabled, setEobiEnabled] = useState(false)
  const [eobiEmployeeRate, setEobiEmployeeRate] = useState(1)
  const [eobiCap, setEobiCap] = useState(470)
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      if (d.config?.standardHoursPerDay) setStandardHoursPerDay(Number(d.config.standardHoursPerDay))
      if (d.config?.overtimeMultiplier) setOvertimeMultiplier(Number(d.config.overtimeMultiplier))
      if (d.config?.lateThresholdHour) setLateThresholdHour(Number(d.config.lateThresholdHour))
      if (d.config?.lateThresholdMinute) setLateThresholdMinute(Number(d.config.lateThresholdMinute))
      if (d.config?.eobiEmployeeRate) setEobiEmployeeRate(Number(d.config.eobiEmployeeRate) * 100)
      if (d.config?.eobiCap) setEobiCap(Number(d.config.eobiCap))
      if (d.config?.eobiEnabled !== undefined) setEobiEnabled(d.config.eobiEnabled === 'true')
      if (d.config?.taxEnabled !== undefined) setTaxEnabled(d.config.taxEnabled === 'true')
    }).catch(() => {})
  }, [])

  async function save() {
    await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        standardHoursPerDay, overtimeMultiplier, lateThresholdHour, lateThresholdMinute,
        eobiEnabled, eobiEmployeeRate: eobiEmployeeRate / 100, eobiCap, taxEnabled,
      }),
    })
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Card>
      <CardHeader className="border-b border-slate-100"><CardTitle>Payroll Configuration</CardTitle></CardHeader>
      <CardContent className="p-6 space-y-6 max-w-xl">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Standard Hours / Day" hint="Used for OT threshold + hourly rate">
            <Input type="number" min={1} max={24} step={0.5}
              value={standardHoursPerDay} onChange={(e) => setStandardHoursPerDay(Number(e.target.value))} />
          </Field>
          <Field label="Overtime Multiplier" hint="Pakistan Factories Act default: 2x">
            <Input type="number" min={1} max={5} step={0.5}
              value={overtimeMultiplier} onChange={(e) => setOvertimeMultiplier(Number(e.target.value))} />
          </Field>
        </div>

        <Field label="Late Arrival Threshold (24h)" hint="Clock-in after this time is marked Late">
          <div className="flex items-center gap-2">
            <Input type="number" min={0} max={23} className="w-20"
              value={lateThresholdHour} onChange={(e) => setLateThresholdHour(Number(e.target.value))} />
            <span className="text-slate-500">:</span>
            <Input type="number" min={0} max={59} className="w-20"
              value={lateThresholdMinute} onChange={(e) => setLateThresholdMinute(Number(e.target.value))} />
          </div>
        </Field>

        <div className={`rounded-lg border p-4 ${eobiEnabled ? 'border-slate-100 bg-slate-50/30' : 'border-slate-200'}`}>
          <Toggle label="EOBI (Employee Old-Age Benefits)"
            sub={eobiEnabled ? 'Active - deducted from each payslip' : 'Disabled - no deduction'}
            checked={eobiEnabled} onChange={setEobiEnabled} />
          <div className={`grid grid-cols-2 gap-4 mt-4 ${eobiEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
            <Field label="Employee Rate (% of basic)">
              <Input type="number" min={0} max={10} step={0.1}
                value={eobiEmployeeRate} onChange={(e) => setEobiEmployeeRate(Number(e.target.value))} />
            </Field>
            <Field label="Monthly Cap (PKR)">
              <Input type="number" min={0}
                value={eobiCap} onChange={(e) => setEobiCap(Number(e.target.value))} />
            </Field>
          </div>
        </div>

        <div className={`rounded-lg border p-4 ${taxEnabled ? 'border-slate-100 bg-slate-50/30' : 'border-slate-200'}`}>
          <Toggle label="Income Tax Withholding (FBR)"
            sub={taxEnabled ? 'Active - FBR 2025-26 slabs applied' : 'Disabled'}
            checked={taxEnabled} onChange={setTaxEnabled} />
        </div>

        <Button onClick={save}>{saved ? 'Saved' : 'Save Payroll Settings'}</Button>
      </CardContent>
    </Card>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function Toggle({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
        <div className="w-11 h-6 bg-slate-200 peer-checked:bg-slate-700 rounded-full peer transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
      </label>
    </div>
  )
}
