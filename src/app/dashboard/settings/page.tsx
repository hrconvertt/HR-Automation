'use client'

/**
 * Settings — Stripe/Linear-style left-nav layout.
 *
 *   ┌──────────────────────────────┬──────────────────────────────────┐
 *   │  Organization                │   <selected section content>    │
 *   │  Working Days & Hours        │                                  │
 *   │  Payroll Calculations        │                                  │
 *   │  Departments                 │                                  │
 *   │  Positions                   │                                  │
 *   │  Leave Policies              │                                  │
 *   │  Email & Notifications       │                                  │
 *   │  Access & Roles              │                                  │
 *   └──────────────────────────────┴──────────────────────────────────┘
 *
 * Each section is its own self-contained card with description copy
 * so HR sees "what changes here" before they touch anything.
 */
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Building2, Calendar, Calculator, Users, Briefcase, Plane,
  Mail, ShieldCheck, ChevronRight,
} from 'lucide-react'

interface Department { id: string; code: string; name: string }
interface Position { id: string; title: string; level: string }
interface LeavePolicy { id: string; leaveType: string; daysPerYear: number; employeeType: string; isCarryForward?: boolean; accrualPerMonth?: number | null }

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const NAV = [
  { id: 'organization', label: 'Organization',       icon: Building2,   sub: 'Company name, tax IDs, address' },
  { id: 'workdays',     label: 'Working Days & Hours',icon: Calendar,   sub: 'Schedule + holiday calendar' },
  { id: 'payroll',      label: 'Payroll Calculations',icon: Calculator, sub: 'EOBI, tax, OT multiplier' },
  { id: 'departments',  label: 'Departments',         icon: Users,      sub: 'Organizational units' },
  { id: 'positions',    label: 'Positions',           icon: Briefcase,  sub: 'Designations & levels' },
  { id: 'leave',        label: 'Leave Policies',      icon: Plane,      sub: 'Quotas by employee type' },
  { id: 'email',        label: 'Email & Notifications',icon: Mail,      sub: 'Sender, SMTP, channels' },
  { id: 'roles',        label: 'Access & Roles',      icon: ShieldCheck,sub: 'What each role can do' },
] as const

type NavId = typeof NAV[number]['id']

export default function SettingsPage() {
  const router = useRouter()
  // Non-HR users land on the personal /settings/account view.
  // Only HR_ADMIN sees the org-level settings on this URL.
  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => {
      if (d.user && d.user.role !== 'HR_ADMIN') {
        router.replace('/dashboard/settings/account')
      }
    }).catch(() => {})
  }, [router])
  const [section, setSection] = useState<NavId>('organization')
  const [workingDays, setWorkingDays] = useState<string[]>(['Monday','Tuesday','Wednesday','Thursday','Friday'])
  // Snapshot of last-saved working days, so we can disable Save when there
  // are no changes vs the persisted value (the dirty-state UX glitch fix).
  const [workingDaysSaved, setWorkingDaysSaved] = useState<string[]>(['Monday','Tuesday','Wednesday','Thursday','Friday'])
  const [workingDaysOk, setWorkingDaysOk] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicy[]>([])
  const [companyName, setCompanyName] = useState('Convertt Technologies Pvt Ltd')
  const [companyAddress, setCompanyAddress] = useState('')
  const [companyNtn, setCompanyNtn] = useState('')
  const [companyEobi, setCompanyEobi] = useState('')
  const [companySessi, setCompanySessi] = useState('')
  const [saved, setSaved] = useState(false)

  // Payroll
  const [standardHoursPerDay, setStandardHoursPerDay] = useState(8)
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(2)
  const [lateThresholdHour, setLateThresholdHour] = useState(10)
  const [lateThresholdMinute, setLateThresholdMinute] = useState(15)
  const [eobiEnabled, setEobiEnabled] = useState(false)
  const [eobiEmployeeRate, setEobiEmployeeRate] = useState(1)
  const [eobiCap, setEobiCap] = useState(470)
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [calcSaved, setCalcSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      if (d.departments) setDepartments(d.departments)
      if (d.positions) setPositions(d.positions)
      if (d.leavePolicies) setLeavePolicies(d.leavePolicies)
      if (d.config?.companyName) setCompanyName(d.config.companyName)
      if (d.config?.companyAddress) setCompanyAddress(d.config.companyAddress)
      if (d.config?.companyNtn) setCompanyNtn(d.config.companyNtn)
      if (d.config?.companyEobi) setCompanyEobi(d.config.companyEobi)
      if (d.config?.companySessi) setCompanySessi(d.config.companySessi)
      if (d.config?.workingDays) {
        try {
          const parsed = JSON.parse(d.config.workingDays)
          setWorkingDays(parsed)
          setWorkingDaysSaved(parsed)
        } catch { /* keep default */ }
      }
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

  async function saveOrg() {
    await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName, companyAddress, companyNtn, companyEobi, companySessi }),
    })
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }
  async function saveWorkingDays() {
    await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDays }),
    })
    setWorkingDaysSaved([...workingDays])
    setWorkingDaysOk(true); setTimeout(() => setWorkingDaysOk(false), 2000)
  }
  // Compare current selection to the last-saved snapshot — order-independent.
  const workingDaysDirty = (() => {
    if (workingDays.length !== workingDaysSaved.length) return true
    const s = new Set(workingDaysSaved)
    return workingDays.some((d) => !s.has(d))
  })()
  async function savePayroll() {
    await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        standardHoursPerDay, overtimeMultiplier, lateThresholdHour, lateThresholdMinute,
        eobiEnabled, eobiEmployeeRate: eobiEmployeeRate / 100, eobiCap, taxEnabled,
      }),
    })
    setCalcSaved(true); setTimeout(() => setCalcSaved(false), 2500)
  }

  function toggleDay(day: string) {
    setWorkingDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day])
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure how Convertt HR works for your organization.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
        {/* ─── LEFT NAV ─── */}
        <aside className="space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = section === item.id
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`
                  w-full text-left rounded-lg px-3 py-2.5 flex items-center gap-3 transition-colors
                  ${active
                    ? 'bg-blue-50 text-blue-900 ring-1 ring-blue-200'
                    : 'text-slate-700 hover:bg-slate-100'}
                `}
              >
                <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.label}</p>
                  <p className="text-[11px] text-slate-500 truncate">{item.sub}</p>
                </div>
                <ChevronRight className={`w-4 h-4 flex-shrink-0 ${active ? 'text-blue-600' : 'text-slate-300'}`} />
              </button>
            )
          })}
        </aside>

        {/* ─── RIGHT PANE ─── */}
        <div className="min-w-0">
          {section === 'organization' && (
            <Card>
              <CardHeader className="border-b border-slate-100"><CardTitle>Organization</CardTitle></CardHeader>
              <CardContent className="p-6 space-y-5 max-w-xl">
                <Field label="Company Name" hint="Shown on letters, payslips, and exports.">
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </Field>
                <Field label="Registered Address">
                  <textarea value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)}
                    rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="NTN (FBR)" hint="National Tax Number">
                    <Input value={companyNtn} onChange={(e) => setCompanyNtn(e.target.value)} placeholder="0000000-0" />
                  </Field>
                  <Field label="EOBI Reg. No." hint="Employer registration">
                    <Input value={companyEobi} onChange={(e) => setCompanyEobi(e.target.value)} />
                  </Field>
                </div>
                <Field label="SESSI Reg. No." hint="Sindh Employees' Social Security (optional, provincial)">
                  <Input value={companySessi} onChange={(e) => setCompanySessi(e.target.value)} />
                </Field>
                <div>
                  <Button onClick={saveOrg}>{saved ? '✓ Saved' : 'Save Organization'}</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {section === 'workdays' && (
            <Card>
              <CardHeader className="border-b border-slate-100"><CardTitle>Working Days & Hours</CardTitle></CardHeader>
              <CardContent className="p-6 space-y-5">
                <p className="text-sm text-slate-500">Tap the days the company operates. Excluded days are treated as weekends.</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => (
                    <button key={day} onClick={() => toggleDay(day)}
                      className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                        workingDays.includes(day)
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}>{day}</button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <Button onClick={saveWorkingDays} disabled={!workingDaysDirty || workingDaysOk}>
                    {workingDaysOk ? '✓ Saved' : 'Save Changes'}
                  </Button>
                  {workingDaysOk && (
                    <span className="text-sm text-emerald-600 font-medium">✓ Saved</span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {section === 'payroll' && (
            <Card>
              <CardHeader className="border-b border-slate-100"><CardTitle>Payroll Calculations</CardTitle></CardHeader>
              <CardContent className="p-6 space-y-6 max-w-xl">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Standard Hours / Day" hint="Used for OT threshold + hourly rate">
                    <Input type="number" min={1} max={24} step={0.5}
                      value={standardHoursPerDay} onChange={(e) => setStandardHoursPerDay(Number(e.target.value))} />
                  </Field>
                  <Field label="Overtime Multiplier" hint="Pakistan Factories Act default: 2×">
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

                <div className={`rounded-lg border p-4 ${eobiEnabled ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200'}`}>
                  <Toggle label="EOBI (Employee Old-Age Benefits)"
                    sub={eobiEnabled ? 'Active — deducted from each payslip' : 'Disabled — no deduction'}
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

                <div className={`rounded-lg border p-4 ${taxEnabled ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200'}`}>
                  <Toggle label="Income Tax Withholding (FBR)"
                    sub={taxEnabled ? 'Active — FBR 2025-26 slabs applied' : 'Disabled'}
                    checked={taxEnabled} onChange={setTaxEnabled} />
                </div>

                <Button onClick={savePayroll}>{calcSaved ? '✓ Saved' : 'Save Payroll Settings'}</Button>
              </CardContent>
            </Card>
          )}

          {section === 'departments' && (
            <Card>
              <CardHeader className="border-b border-slate-100"><CardTitle>Departments ({departments.length})</CardTitle></CardHeader>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {departments.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="text-center py-8 text-slate-400">No departments.</TableCell></TableRow>
                  ) : departments.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell><Badge variant="secondary">{d.code}</Badge></TableCell>
                      <TableCell className="font-medium">{d.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {section === 'positions' && (
            <Card>
              <CardHeader className="border-b border-slate-100"><CardTitle>Positions ({positions.length})</CardTitle></CardHeader>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Title</TableHead><TableHead>Level</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {positions.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="text-center py-8 text-slate-400">No positions.</TableCell></TableRow>
                  ) : positions.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.title}</TableCell>
                      <TableCell><Badge>{p.level}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {section === 'leave' && (
            <Card>
              <CardHeader className="border-b border-slate-100"><CardTitle>Leave Policies</CardTitle></CardHeader>
              <CardContent className="p-0">
                <p className="px-6 py-3 text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
                  Pakistani standard: PERMANENT employees get the full annual quota upfront.
                  PROBATION/INTERNSHIP/TRAINING staff accrue 1 day per month worked.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee Type</TableHead>
                      <TableHead>Leave Type</TableHead>
                      <TableHead>Days / Year</TableHead>
                      <TableHead>Accrual</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leavePolicies.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-400">No leave policies.</TableCell></TableRow>
                    ) : leavePolicies.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell><Badge variant="secondary">{p.employeeType}</Badge></TableCell>
                        <TableCell className="font-medium">{p.leaveType}</TableCell>
                        <TableCell>{p.daysPerYear}</TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {p.accrualPerMonth ? `${p.accrualPerMonth}/month` : 'One-shot'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {section === 'email' && (
            <Card>
              <CardHeader className="border-b border-slate-100"><CardTitle>Email & Notifications</CardTitle></CardHeader>
              <CardContent className="p-6 space-y-4 max-w-xl">
                <p className="text-sm text-slate-500">SMTP configuration is read-only here and is managed via environment variables in production.</p>
                <Field label="Sender Name">
                  <Input defaultValue="Convertt HR" disabled />
                </Field>
                <Field label="From Address">
                  <Input defaultValue="hr@convertt.co" disabled />
                </Field>
                <div className="text-xs text-slate-400">Channels: Email · In-app inbox · Future: SMS</div>
                <div className="pt-3 border-t border-slate-100">
                  <a href="/dashboard/settings/email-templates" className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline">
                    Edit Email Templates <ChevronRight className="w-4 h-4" />
                  </a>
                  <p className="text-xs text-slate-500 mt-1">Subject + body templates with {'{{var}}'} substitution for interview invites, offers, rejections, confirmations.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {section === 'roles' && (
            <Card>
              <CardHeader className="border-b border-slate-100"><CardTitle>Access & Roles</CardTitle></CardHeader>
              <CardContent className="p-6">
                <p className="text-sm text-slate-500 mb-4">Read-only summary of what each role can see and do.</p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Capability</TableHead>
                        <TableHead className="text-center">HR</TableHead>
                        <TableHead className="text-center">Manager</TableHead>
                        <TableHead className="text-center">Lead</TableHead>
                        <TableHead className="text-center">Employee</TableHead>
                        <TableHead className="text-center">CEO / Executive</TableHead>
                        <TableHead className="text-center">Finance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ROLE_MATRIX.map((row) => (
                        <TableRow key={row.cap}>
                          <TableCell className="font-medium">{row.cap}</TableCell>
                          <TableCell className="text-center">{tick(row.hr)}</TableCell>
                          <TableCell className="text-center">{tick(row.mgr)}</TableCell>
                          <TableCell className="text-center">{tick(row.lead)}</TableCell>
                          <TableCell className="text-center">{tick(row.emp)}</TableCell>
                          <TableCell className="text-center">{tick(row.exec)}</TableCell>
                          <TableCell className="text-center">{tick(row.fin)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
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
        <div className="w-11 h-6 bg-slate-200 peer-checked:bg-blue-600 rounded-full peer transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
      </label>
    </div>
  )
}

function tick(v: 'full' | 'self' | 'team' | 'no') {
  if (v === 'no') return <span className="text-slate-300">—</span>
  if (v === 'full') return <span className="text-emerald-600 font-bold">✓</span>
  return <span className="text-blue-600 text-xs">{v === 'self' ? 'own' : 'team'}</span>
}

const ROLE_MATRIX = [
  { cap: 'View employee directory',     hr: 'full', mgr: 'full', lead: 'full', emp: 'full', exec: 'full', fin: 'full' },
  { cap: 'Edit employee records',       hr: 'full', mgr: 'team', lead: 'no',   emp: 'no',   exec: 'no',   fin: 'no'   },
  { cap: 'View salary',                 hr: 'full', mgr: 'no',   lead: 'no',   emp: 'self', exec: 'full', fin: 'full' },
  { cap: 'Approve leave',               hr: 'full', mgr: 'team', lead: 'team', emp: 'no',   exec: 'no',   fin: 'no'   },
  { cap: 'Run payroll',                 hr: 'full', mgr: 'no',   lead: 'no',   emp: 'no',   exec: 'no',   fin: 'full' },
  { cap: 'Hire / Recruit',              hr: 'full', mgr: 'team', lead: 'no',   emp: 'no',   exec: 'no',   fin: 'no'   },
  { cap: 'Issue letters',               hr: 'full', mgr: 'no',   lead: 'no',   emp: 'no',   exec: 'no',   fin: 'no'   },
  { cap: 'Workforce analytics',         hr: 'full', mgr: 'team', lead: 'team', emp: 'no',   exec: 'full', fin: 'no'   },
  { cap: 'Initiate exit clearance',     hr: 'full', mgr: 'no',   lead: 'no',   emp: 'no',   exec: 'no',   fin: 'no'   },
] as const
