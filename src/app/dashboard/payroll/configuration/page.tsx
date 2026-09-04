'use client'

import { useState, useEffect } from 'react'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function PayrollConfigSettingsPage() {
  const [standardHoursPerDay, setStandardHoursPerDay] = useState(8)
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(2)
  const [lateThresholdHour, setLateThresholdHour] = useState(10)
  const [lateThresholdMinute, setLateThresholdMinute] = useState(15)
  const [eobiEnabled, setEobiEnabled] = useState(false)
  const [eobiEmployeeRate, setEobiEmployeeRate] = useState(1)   // shown as %
  const [eobiEmployerRate, setEobiEmployerRate] = useState(5)   // shown as %
  const [eobiWageBase, setEobiWageBase] = useState(40000)
  const [province, setProvince] = useState('Punjab')
  // End-of-service benefit — one scheme, not both.
  const [endOfServiceScheme, setEndOfServiceScheme] = useState<'gratuity' | 'provident_fund' | 'none'>('gratuity')
  const [gratuityDaysPerYear, setGratuityDaysPerYear] = useState(30)
  const [gratuityEligibilityMonths, setGratuityEligibilityMonths] = useState(12)
  const [pfEmployeeRate, setPfEmployeeRate] = useState(8.33) // shown as %
  const [pfEmployerRate, setPfEmployerRate] = useState(8.33) // shown as %
  const [pfVestingMonths, setPfVestingMonths] = useState(24)
  // Provincial social security
  const [ssEnabled, setSsEnabled] = useState(false)
  const [ssInstitution, setSsInstitution] = useState('PESSI')
  const [ssEmployeeRate, setSsEmployeeRate] = useState(1)  // shown as %
  const [ssEmployerRate, setSsEmployerRate] = useState(6)  // shown as %
  const [ssWageCeiling, setSsWageCeiling] = useState(25000)
  // Pay cycle
  const [payFrequency, setPayFrequency] = useState<'monthly' | 'bi_weekly' | 'weekly'>('monthly')
  const [payrollCutoffDay, setPayrollCutoffDay] = useState(25)
  const [payrollReviewDays, setPayrollReviewDays] = useState(2)
  const [payrollDisburseDay, setPayrollDisburseDay] = useState(28)
  // Leave-linked pay + full & final
  const [lwpRateBasis, setLwpRateBasis] = useState<'gross' | 'basic'>('gross')
  const [lwpDayDivisor, setLwpDayDivisor] = useState<'calendar' | 'working'>('calendar')
  const [leaveEncashmentEnabled, setLeaveEncashmentEnabled] = useState(false)
  const [leaveEncashmentBasis, setLeaveEncashmentBasis] = useState<'gross' | 'basic'>('basic')
  const [fnfNoticeRecovery, setFnfNoticeRecovery] = useState(true)
  const [fnfEncashUnusedLeave, setFnfEncashUnusedLeave] = useState(true)
  const [fnfIncludeGratuity, setFnfIncludeGratuity] = useState(true)
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      if (d.config?.standardHoursPerDay) setStandardHoursPerDay(Number(d.config.standardHoursPerDay))
      if (d.config?.overtimeMultiplier) setOvertimeMultiplier(Number(d.config.overtimeMultiplier))
      if (d.config?.lateThresholdHour) setLateThresholdHour(Number(d.config.lateThresholdHour))
      if (d.config?.lateThresholdMinute) setLateThresholdMinute(Number(d.config.lateThresholdMinute))
      if (d.config?.eobiEmployeeRate) setEobiEmployeeRate(Number(d.config.eobiEmployeeRate) * 100)
      if (d.config?.eobiEmployerRate) setEobiEmployerRate(Number(d.config.eobiEmployerRate) * 100)
      if (d.config?.eobiWageBase) setEobiWageBase(Number(d.config.eobiWageBase))
      if (d.config?.province) setProvince(d.config.province)
      if (d.config?.endOfServiceScheme) setEndOfServiceScheme(d.config.endOfServiceScheme)
      if (d.config?.gratuityDaysPerYear) setGratuityDaysPerYear(Number(d.config.gratuityDaysPerYear))
      if (d.config?.gratuityEligibilityMonths) setGratuityEligibilityMonths(Number(d.config.gratuityEligibilityMonths))
      if (d.config?.pfEmployeeRate) setPfEmployeeRate(Number(d.config.pfEmployeeRate) * 100)
      if (d.config?.pfEmployerRate) setPfEmployerRate(Number(d.config.pfEmployerRate) * 100)
      if (d.config?.pfVestingMonths) setPfVestingMonths(Number(d.config.pfVestingMonths))
      if (d.config?.socialSecurityEnabled !== undefined) setSsEnabled(d.config.socialSecurityEnabled === 'true')
      if (d.config?.socialSecurityInstitution) setSsInstitution(d.config.socialSecurityInstitution)
      if (d.config?.ssEmployeeRate) setSsEmployeeRate(Number(d.config.ssEmployeeRate) * 100)
      if (d.config?.ssEmployerRate) setSsEmployerRate(Number(d.config.ssEmployerRate) * 100)
      if (d.config?.ssWageCeiling) setSsWageCeiling(Number(d.config.ssWageCeiling))
      if (d.config?.eobiEnabled !== undefined) setEobiEnabled(d.config.eobiEnabled === 'true')
      if (d.config?.payFrequency) setPayFrequency(d.config.payFrequency)
      if (d.config?.payrollCutoffDay) setPayrollCutoffDay(Number(d.config.payrollCutoffDay))
      if (d.config?.payrollReviewDays) setPayrollReviewDays(Number(d.config.payrollReviewDays))
      if (d.config?.payrollDisburseDay) setPayrollDisburseDay(Number(d.config.payrollDisburseDay))
      if (d.config?.lwpRateBasis) setLwpRateBasis(d.config.lwpRateBasis)
      if (d.config?.lwpDayDivisor) setLwpDayDivisor(d.config.lwpDayDivisor)
      if (d.config?.leaveEncashmentEnabled !== undefined) setLeaveEncashmentEnabled(d.config.leaveEncashmentEnabled === 'true')
      if (d.config?.leaveEncashmentBasis) setLeaveEncashmentBasis(d.config.leaveEncashmentBasis)
      if (d.config?.fnfNoticeRecovery !== undefined) setFnfNoticeRecovery(d.config.fnfNoticeRecovery === 'true')
      if (d.config?.fnfEncashUnusedLeave !== undefined) setFnfEncashUnusedLeave(d.config.fnfEncashUnusedLeave === 'true')
      if (d.config?.fnfIncludeGratuity !== undefined) setFnfIncludeGratuity(d.config.fnfIncludeGratuity === 'true')
      if (d.config?.taxEnabled !== undefined) setTaxEnabled(d.config.taxEnabled === 'true')
    }).catch(() => {})
  }, [])

  // The cap is no longer typed — it is the contribution: base × rate.
  const employeeContribution = Math.round(eobiWageBase * (eobiEmployeeRate / 100))
  const employerContribution = Math.round(eobiWageBase * (eobiEmployerRate / 100))

  async function save() {
    const res = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        standardHoursPerDay, overtimeMultiplier, lateThresholdHour, lateThresholdMinute,
        eobiEnabled,
        eobiEmployeeRate: eobiEmployeeRate / 100,
        eobiEmployerRate: eobiEmployerRate / 100,
        eobiWageBase, province,
        endOfServiceScheme, gratuityDaysPerYear, gratuityEligibilityMonths,
        pfEmployeeRate: pfEmployeeRate / 100,
        pfEmployerRate: pfEmployerRate / 100,
        pfVestingMonths,
        socialSecurityEnabled: ssEnabled,
        socialSecurityInstitution: ssInstitution,
        ssEmployeeRate: ssEmployeeRate / 100,
        ssEmployerRate: ssEmployerRate / 100,
        ssWageCeiling,
        payFrequency, payrollCutoffDay, payrollReviewDays, payrollDisburseDay,
        lwpRateBasis, lwpDayDivisor, leaveEncashmentEnabled, leaveEncashmentBasis,
        fnfNoticeRecovery, fnfEncashUnusedLeave, fnfIncludeGratuity,
        taxEnabled,
      }),
    })
    if (!res.ok) {
      toastError('Payroll configuration not saved', (await res.json().catch(() => ({}))).error)
      return
    }
    toastSuccess('Payroll configuration saved')
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Payroll Configuration</h1>
          <p className="text-sm text-slate-500">Rates, statutory contributions and the pay calendar — every value editable.</p>
        </div>
      </div>

      {/* One section at a time: each card spans the full width and they stack
          top to bottom, so a section finishes before the next one begins.
          The horizontal space is used inside each card, not beside it. */}
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">Working Hours &amp; Attendance</p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
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
        </div>

        {/* Pay cycle — frequency and the month's processing calendar. */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">Pay Cycle &amp; Processing Calendar</p>
          <Field label="Pay frequency">
            <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
              value={payFrequency} onChange={(e) => setPayFrequency(e.target.value as typeof payFrequency)}>
              <option value="monthly">Monthly</option>
              <option value="bi_weekly">Bi-weekly (every 2 weeks)</option>
              <option value="weekly">Weekly</option>
            </select>
          </Field>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            <Field label="Cutoff day" hint="Inputs locked">
              <Input type="number" min={1} max={31} value={payrollCutoffDay}
                onChange={(e) => setPayrollCutoffDay(Number(e.target.value))} />
            </Field>
            <Field label="Review window (days)" hint="CEO/HR approval">
              <Input type="number" min={0} max={15} value={payrollReviewDays}
                onChange={(e) => setPayrollReviewDays(Number(e.target.value))} />
            </Field>
            <Field label="Disburse day" hint="Salaries paid">
              <Input type="number" min={1} max={31} value={payrollDisburseDay}
                onChange={(e) => setPayrollDisburseDay(Number(e.target.value))} />
            </Field>
          </div>
          <p className="text-[11px] text-slate-400">
            Each month: inputs finalise on the {ordinal(payrollCutoffDay)}, {payrollReviewDays} day(s) for review, salaries hit accounts on the {ordinal(payrollDisburseDay)}.
          </p>
        </div>

        {/* Province — minimum wage and social-security bodies vary by it. */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
          <Field label="Province / Branch location" hint="EOBI wage base and social security differ by province">
            <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
              value={province} onChange={(e) => setProvince(e.target.value)}>
              {['Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan',
                'Islamabad Capital Territory', 'Gilgit-Baltistan', 'Azad Kashmir'].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className={`rounded-xl border bg-white shadow-sm p-5 ${eobiEnabled ? 'border-slate-300' : 'border-slate-200'}`}>
          <Toggle label="EOBI (Employees' Old-Age Benefits)"
            sub={eobiEnabled ? 'Active - contributions on the statutory wage base' : 'Disabled - no contribution'}
            checked={eobiEnabled} onChange={setEobiEnabled} />
          <div className={`space-y-4 mt-4 ${eobiEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
            <Field label="Wage Base (PKR)" hint="Provincial minimum wage EOBI is calculated on — not the salary. Editable; revised over time.">
              <Input type="number" min={0} step={1000}
                value={eobiWageBase} onChange={(e) => setEobiWageBase(Number(e.target.value))} />
            </Field>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <Field label="Employee Rate (% of wage base)">
                <Input type="number" min={0} max={20} step={0.1}
                  value={eobiEmployeeRate} onChange={(e) => setEobiEmployeeRate(Number(e.target.value))} />
              </Field>
              <Field label="Employer Rate (% of wage base)">
                <Input type="number" min={0} max={20} step={0.1}
                  value={eobiEmployerRate} onChange={(e) => setEobiEmployerRate(Number(e.target.value))} />
              </Field>
            </div>
            {/* Computed, not typed — the cap is the contribution. */}
            <div className="rounded-md bg-white border border-slate-200 p-3 text-sm text-slate-700 grid grid-cols-2 gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Employee contribution / month</p>
                <p className="font-semibold tabular-nums">PKR {employeeContribution.toLocaleString('en-PK')}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Employer contribution / month</p>
                <p className="font-semibold tabular-nums">PKR {employerContribution.toLocaleString('en-PK')}</p>
              </div>
              <p className="col-span-full text-[11px] text-slate-400">
                Computed as wage base × rate — no manual cap to keep in step.
              </p>
            </div>
          </div>
        </div>

        {/* End-of-service benefit — Gratuity OR Provident Fund, never both. */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
          <div className="border-b border-slate-100 pb-2">
            <p className="text-sm font-semibold text-slate-900">End-of-Service Benefit</p>
            <p className="text-xs text-slate-500 mt-0.5">
              A company runs one scheme. Gratuity is the statutory Standing-Orders benefit; a Provident Fund is a contributory alternative.
            </p>
          </div>
          <div className="inline-flex rounded-md border border-slate-300 overflow-hidden">
            {([
              ['gratuity', 'Gratuity'],
              ['provident_fund', 'Provident Fund'],
              ['none', 'None'],
            ] as const).map(([val, label]) => (
              <button key={val} type="button" onClick={() => setEndOfServiceScheme(val)}
                className={`px-3 py-1.5 text-xs ${endOfServiceScheme === val
                  ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
          </div>

          {endOfServiceScheme === 'gratuity' && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <Field label="Days' wages per year of service" hint="Standing Orders: 30 days per completed year">
                <Input type="number" min={0} max={90} step={1}
                  value={gratuityDaysPerYear} onChange={(e) => setGratuityDaysPerYear(Number(e.target.value))} />
              </Field>
              <Field label="Eligibility (months of service)" hint="Minimum service before gratuity accrues">
                <Input type="number" min={0} max={120} step={1}
                  value={gratuityEligibilityMonths} onChange={(e) => setGratuityEligibilityMonths(Number(e.target.value))} />
              </Field>
              <p className="col-span-full text-[11px] text-slate-400">
                Example: {gratuityDaysPerYear} days ÷ 30 = {(gratuityDaysPerYear / 30).toFixed(2)} month(s) of last-drawn Basic for every completed year, once past {gratuityEligibilityMonths} months.
              </p>
            </div>
          )}

          {endOfServiceScheme === 'provident_fund' && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <Field label="Employee contribution (% of Basic)">
                <Input type="number" min={0} max={30} step={0.01}
                  value={pfEmployeeRate} onChange={(e) => setPfEmployeeRate(Number(e.target.value))} />
              </Field>
              <Field label="Employer contribution (% of Basic)">
                <Input type="number" min={0} max={30} step={0.01}
                  value={pfEmployerRate} onChange={(e) => setPfEmployerRate(Number(e.target.value))} />
              </Field>
              <Field label="Vesting period (months)" hint="Employer share forfeited if the employee leaves earlier">
                <Input type="number" min={0} max={120} step={1}
                  value={pfVestingMonths} onChange={(e) => setPfVestingMonths(Number(e.target.value))} />
              </Field>
              <p className="col-span-full text-[11px] text-slate-400">
                Both sides contribute to each month&apos;s fund; the employer&apos;s {pfEmployerRate}% vests to the employee after {pfVestingMonths} months.
              </p>
            </div>
          )}

          {endOfServiceScheme === 'none' && (
            <p className="text-xs text-slate-400">No end-of-service benefit is configured.</p>
          )}
        </div>

        {/* Provincial social security — PESSI/SESSI/etc. Employer-heavy split. */}
        <div className={`rounded-xl border bg-white shadow-sm p-5 ${ssEnabled ? 'border-slate-300' : 'border-slate-200'}`}>
          <Toggle label="Provincial Social Security"
            sub={ssEnabled ? `Active — ${ssInstitution} contributions on the secured wage` : 'Disabled — no contribution'}
            checked={ssEnabled} onChange={setSsEnabled} />
          <div className={`space-y-4 mt-4 ${ssEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
            <Field label="Institution" hint="Provincial body that collects the contribution">
              <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                value={ssInstitution} onChange={(e) => setSsInstitution(e.target.value)}>
                {['PESSI', 'SESSI', 'KPESSI', 'BESSI', 'ICT-ESSI'].map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </Field>
            <Field label="Wage Ceiling (PKR)" hint="Only employees earning at or below this are covered; contribution is calculated on it">
              <Input type="number" min={0} step={1000}
                value={ssWageCeiling} onChange={(e) => setSsWageCeiling(Number(e.target.value))} />
            </Field>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <Field label="Employee Rate (% of secured wage)">
                <Input type="number" min={0} max={20} step={0.1}
                  value={ssEmployeeRate} onChange={(e) => setSsEmployeeRate(Number(e.target.value))} />
              </Field>
              <Field label="Employer Rate (% of secured wage)">
                <Input type="number" min={0} max={20} step={0.1}
                  value={ssEmployerRate} onChange={(e) => setSsEmployerRate(Number(e.target.value))} />
              </Field>
            </div>
            <div className="rounded-md bg-white border border-slate-200 p-3 text-sm text-slate-700 grid grid-cols-2 gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Employee / month</p>
                <p className="font-semibold tabular-nums">PKR {Math.round(ssWageCeiling * (ssEmployeeRate / 100)).toLocaleString('en-PK')}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Employer / month</p>
                <p className="font-semibold tabular-nums">PKR {Math.round(ssWageCeiling * (ssEmployerRate / 100)).toLocaleString('en-PK')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Leave-linked pay: how unpaid leave is priced, and encashment. */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">Leave-Linked Deductions</p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            <Field label="Leave-without-pay is deducted from" hint="Which salary figure a day of LWP is priced on">
              <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                value={lwpRateBasis} onChange={(e) => setLwpRateBasis(e.target.value as 'gross' | 'basic')}>
                <option value="gross">Gross salary</option>
                <option value="basic">Basic salary</option>
              </select>
            </Field>
            <Field label="Per-day rate divides by" hint="Days used to get the daily rate">
              <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                value={lwpDayDivisor} onChange={(e) => setLwpDayDivisor(e.target.value as 'calendar' | 'working')}>
                <option value="calendar">Calendar days in month</option>
                <option value="working">Working days in month</option>
              </select>
            </Field>
          </div>
          <p className="text-[11px] text-slate-400">
            One unpaid day = monthly {lwpRateBasis} ÷ {lwpDayDivisor === 'calendar' ? 'calendar' : 'working'} days in the month.
          </p>
          <div className="border-t border-slate-100 pt-3">
            <Toggle label="Leave Encashment"
              sub={leaveEncashmentEnabled ? 'Unused leave is paid out' : 'Unused leave is not paid out'}
              checked={leaveEncashmentEnabled} onChange={setLeaveEncashmentEnabled} />
            {leaveEncashmentEnabled && (
              <div className="mt-3">
                <Field label="Encashment priced on">
                  <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                    value={leaveEncashmentBasis} onChange={(e) => setLeaveEncashmentBasis(e.target.value as 'gross' | 'basic')}>
                    <option value="basic">Basic salary</option>
                    <option value="gross">Gross salary</option>
                  </select>
                </Field>
              </div>
            )}
          </div>
        </div>

        {/* Full & Final settlement — what an exit payout includes. */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">Full &amp; Final Settlement</p>
          <p className="text-xs text-slate-500 -mt-1">What an employee&apos;s exit settlement includes.</p>
          <Toggle label="Recover unserved notice"
            sub="Deduct salary in lieu of notice not served"
            checked={fnfNoticeRecovery} onChange={setFnfNoticeRecovery} />
          <Toggle label="Encash remaining leave"
            sub="Pay out the leave balance on exit"
            checked={fnfEncashUnusedLeave} onChange={setFnfEncashUnusedLeave} />
          <Toggle label="Include end-of-service benefit"
            sub="Add the gratuity / provident-fund payout"
            checked={fnfIncludeGratuity} onChange={setFnfIncludeGratuity} />
        </div>

        <div className={`rounded-xl border bg-white shadow-sm p-5 ${taxEnabled ? 'border-slate-300' : 'border-slate-200'}`}>
          <Toggle label="Income Tax Withholding (FBR)"
            sub={taxEnabled ? 'Active - FBR 2025-26 slabs applied' : 'Disabled'}
            checked={taxEnabled} onChange={setTaxEnabled} />
          <a href="/dashboard/settings/tax-slabs" className="inline-block mt-3 text-xs font-medium text-slate-600 underline hover:text-slate-900">
            Edit tax slabs →
          </a>
        </div>
      </div>

      {/* Sticky save bar — always reachable no matter the column heights. */}
      <div className="sticky bottom-0 flex items-center justify-end gap-3 bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
        {saved && <span className="text-xs text-emerald-600">Saved ✓</span>}
        <Button onClick={save}>{saved ? 'Saved' : 'Save Payroll Settings'}</Button>
      </div>
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
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
