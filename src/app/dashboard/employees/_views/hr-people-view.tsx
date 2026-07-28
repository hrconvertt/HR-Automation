'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import { Search, Plus, ExternalLink, Mail } from 'lucide-react'
import { getInitials } from '@/lib/utils'

interface Department {
  id: string
  name: string
  code: string
}

interface Employee {
  id: string
  employeeCode: string
  fullName: string
  email: string
  designation: string
  employeeType: string
  status: string
  department: { name: string } | null
  // HR-only login/invite status (from GET /api/employees enrichment)
  invite?: {
    status: 'ACTIVE' | 'INVITED' | 'NONE'
    invitedAt?: string
    sentTo?: string
  }
}

const statusTone: Record<string, string> = {
  ACTIVE: 'bg-slate-50 text-slate-700 border border-slate-100',
  RESIGNED: 'bg-slate-100 text-slate-600 border border-slate-200',
  TERMINATED: 'bg-slate-50 text-slate-700 border border-slate-100',
  ON_LEAVE: 'bg-slate-50 text-slate-700 border border-slate-100',
}

// Stable, friendly avatar palette derived from the name — gives each
// employee a consistent color across reloads without storing it.
const AVATAR_PALETTE = [
  'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700',
  'bg-slate-100 text-slate-700',
]
function avatarTone(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

export function HRPeopleView({ initialEmployees }: { initialEmployees?: Employee[] }) {
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees ?? [])
  const [departments, setDepartments] = useState<Department[]>([])
  const [designationOptions, setDesignationOptions] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [loading, setLoading] = useState(!initialEmployees)
  // When the server already rendered the initial list, skip the very first
  // debounced fetch (it would re-request the same unfiltered data).
  const skipFirstFetch = useRef(!!initialEmployees)
  const [addOpen, setAddOpen] = useState(false)

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    designation: '',
    departmentId: '',
    employeeType: 'PROBATION',
    joiningDate: '',
    phone: '',
    cnic: '',
    probationMonths: 3,
  })
  // Auto-suggested employee code — refreshed when department changes.
  // HR can flip the override toggle to type a custom code, in which case
  // the server validates uniqueness.
  const [employeeCode, setEmployeeCode] = useState('')
  const [overrideCode, setOverrideCode] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)
  // Initial Compensation captured at hire-time (optional). If totalGross > 0,
  // the API splits it into Basic + Allowances per the Convertt standard split
  // (60% Basic / 25% HRA / 15% Allowances) and creates the Salary row.
  const [salary, setSalary] = useState({
    enabled: false,
    totalGross: '' as string,        // input as string so leading-zero etc. is fine
    basicPct: 60,
    housePct: 25,
    otherPct: 15,
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // After successful create, show the auto-provisioned login credentials
  // so HR can hand them to the new hire.
  const [credentials, setCredentials] = useState<null | {
    email: string
    tempPassword: string | null
    linkedExisting: boolean
    message: string
  }>(null)
  const [copied, setCopied] = useState(false)

  // ─── Login invites (self-set password links) ───
  const [invitingId, setInvitingId] = useState<string | null>(null)
  const [inviteNotice, setInviteNotice] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSending, setBulkSending] = useState(false)

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (filterDept && filterDept !== 'all') params.set('departmentId', filterDept)
    if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus)
    if (filterType && filterType !== 'all') params.set('employeeType', filterType)
    const res = await fetch(`/api/employees?${params}`)
    const data = await res.json()
    setEmployees(data.employees ?? [])
    setLoading(false)
  }, [search, filterDept, filterStatus, filterType])

  useEffect(() => {
    fetch('/api/employees/departments')
      .then((r) => r.json())
      .then((d) => setDepartments(d.departments ?? []))
    // Pull canonical designations for the combobox suggestions
    fetch('/api/employees/designations')
      .then((r) => r.json())
      .then((d) => setDesignationOptions(d.designations ?? []))
      .catch(() => {})
  }, [])

  // Refresh the auto-suggested employee code whenever the department
  // changes (or the dialog opens). HR can still flip the override toggle.
  useEffect(() => {
    if (!addOpen || overrideCode) return
    setCodeLoading(true)
    const url = form.departmentId
      ? `/api/employees/next-code?dept=${encodeURIComponent(form.departmentId)}`
      : `/api/employees/next-code?code=GEN`
    fetch(url)
      .then((r) => r.json())
      .then((d) => { if (d?.next) setEmployeeCode(d.next) })
      .catch(() => {})
      .finally(() => setCodeLoading(false))
  }, [form.departmentId, addOpen, overrideCode])

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false
      return
    }
    const t = setTimeout(fetchEmployees, 300)
    return () => clearTimeout(t)
  }, [fetchEmployees])

  async function handleAdd() {
    setFormError('')

    // Build the payload — include salary block only if HR opted in and
    // provided a numeric Total Gross.
    const grossNum = Number(salary.totalGross)
    const payload: Record<string, unknown> = { ...form }
    // Only send probationMonths for non-permanent hires
    if (form.employeeType === 'PERMANENT') {
      delete (payload as Record<string, unknown>).probationMonths
    }
    // Include code override only when HR explicitly chose to type one.
    if (overrideCode && employeeCode.trim()) {
      payload.employeeCodeOverride = employeeCode.trim().toUpperCase()
    }
    if (salary.enabled && Number.isFinite(grossNum) && grossNum > 0) {
      const sum = salary.basicPct + salary.housePct + salary.otherPct
      if (sum !== 100) { setFormError('Salary split must total 100%'); return }
      payload.salary = {
        totalGross: grossNum,
        splitPct: {
          basic: salary.basicPct / 100,
          houseRent: salary.housePct / 100,
          otherAllowance: salary.otherPct / 100,
        },
      }
    }

    setSaving(true)
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setFormError(data.error || 'Failed to add employee')
      return
    }
    setAddOpen(false)
    setSalary({ enabled: false, totalGross: '', basicPct: 60, housePct: 25, otherPct: 15 })
    setEmployeeCode('')
    setOverrideCode(false)
    setForm({
      fullName: '',
      email: '',
      designation: '',
      departmentId: '',
      employeeType: 'PROBATION',
      joiningDate: '',
      phone: '',
      cnic: '',
      probationMonths: 3,
    })
    // Surface auto-provisioned login credentials (Step 3a).
    if (data?.login) {
      setCredentials({
        email: data.login.email,
        tempPassword: data.login.tempPassword ?? null,
        linkedExisting: !!data.login.linkedExisting,
        message: data.login.message ?? '',
      })
      setCopied(false)
    }
    fetchEmployees()
  }

  const uninvitedCount = employees.filter(
    (e) => e.status === 'ACTIVE' && e.invite?.status === 'NONE',
  ).length

  async function sendInvite(emp: Employee) {
    setInvitingId(emp.id)
    setInviteNotice('')
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: emp.id }),
      })
      const data = await res.json().catch(() => ({}))
      setInviteNotice(
        res.ok
          ? `Login invite sent to ${data.sentTo ?? emp.email}.`
          : data.error ?? 'Failed to send invite.',
      )
      if (res.ok) fetchEmployees()
    } catch {
      setInviteNotice('Network error — invite not sent.')
    } finally {
      setInvitingId(null)
    }
  }

  async function sendBulkInvites() {
    setBulkSending(true)
    setInviteNotice('')
    try {
      const res = await fetch('/api/invites/bulk', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setInviteNotice(
          data.total === 0
            ? 'Everyone already has a login or a pending invite.'
            : `Invites sent: ${data.sent} of ${data.total}${data.failed ? ` (${data.failed} failed)` : ''}.`,
        )
        fetchEmployees()
      } else {
        setInviteNotice(data.error ?? 'Bulk invite failed.')
      }
    } catch {
      setInviteNotice('Network error — bulk invite failed.')
    } finally {
      setBulkSending(false)
      setBulkOpen(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* One unified panel — module title already says "People",
          so the card header is just the filter strip + Add button.
          Workday/BambooHR data-table pattern. */}
      <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
        {/* Toolbar: filters on the left, count + primary action on the right */}
        <div className="px-4 py-3 border-b border-slate-100 bg-white flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by name, code, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
          <Select value={filterDept} onValueChange={setFilterDept}>
            <SelectTrigger className="w-40 bg-white">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="RESIGNED">Resigned</SelectItem>
              <SelectItem value="TERMINATED">Terminated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-36 bg-white">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="PERMANENT">Permanent</SelectItem>
              <SelectItem value="PROBATION">Probation</SelectItem>
              <SelectItem value="INTERNSHIP">Internship</SelectItem>
            </SelectContent>
          </Select>

          {/* Right cluster: count + actions */}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {employees.length} {employees.length === 1 ? 'record' : 'records'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkOpen(true)}
              disabled={bulkSending}
            >
              <Mail className="w-4 h-4 mr-1.5" />
              Invite all uninvited
            </Button>
            <Button onClick={() => setAddOpen(true)} size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              Add Employee
            </Button>
          </div>
        </div>
        {inviteNotice && (
          <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 text-xs text-slate-700 flex items-center justify-between gap-3">
            <span>{inviteNotice}</span>
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600"
              onClick={() => setInviteNotice('')}
            >
              Dismiss
            </button>
          </div>
        )}
        {/* Card grid — BambooHR-style people view */}
        <div className="p-4 bg-slate-50/50">
          {loading ? (
            <div className="text-center py-10 text-slate-400 text-sm">Loading…</div>
          ) : employees.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">No employees match these filters.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {employees.map((emp) => (
                <Link
                  key={emp.id}
                  href={`/dashboard/employees/${emp.id}`}
                  className="group bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-200 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${avatarTone(emp.fullName)}`}>
                      {getInitials(emp.fullName)}
                    </div>
                    {/* Body */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-slate-900 text-sm leading-tight truncate group-hover:text-slate-700">
                          {emp.fullName}
                        </p>
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${statusTone[emp.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {emp.status === 'ACTIVE' ? 'Active' : emp.status === 'TERMINATED' ? 'Ended' : emp.status === 'RESIGNED' ? 'Resigned' : emp.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 truncate">{emp.designation}</p>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className="text-[11px] text-slate-500">
                          {emp.department?.name ?? 'No department'}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                          {emp.employeeType === 'PERMANENT' ? 'Permanent' : emp.employeeType === 'PROBATION' ? 'Probation' : emp.employeeType === 'INTERNSHIP' ? 'Intern' : emp.employeeType === 'TRAINING' ? 'Training' : emp.employeeType}
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-slate-400 mt-2">{emp.employeeCode}</p>
                      {/* Login/invite status + action (HR only — API enriches) */}
                      {emp.invite && (
                        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100">
                          <span className="text-[10px] text-slate-500">
                            {emp.invite.status === 'ACTIVE'
                              ? 'Login: Active'
                              : emp.invite.status === 'INVITED'
                                ? `Invited ${emp.invite.invitedAt ? new Date(emp.invite.invitedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''} (pending)`
                                : 'Never invited'}
                          </span>
                          {emp.invite.status !== 'ACTIVE' && (
                            <button
                              type="button"
                              className="text-[10px] font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-2 disabled:opacity-50"
                              disabled={invitingId === emp.id}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                sendInvite(emp)
                              }}
                            >
                              {invitingId === emp.id
                                ? 'Sending…'
                                : emp.invite.status === 'INVITED'
                                  ? 'Resend invite'
                                  : 'Send login invite'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Bulk invite confirmation */}
      <Dialog open={bulkOpen} onOpenChange={(o) => !bulkSending && setBulkOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite all uninvited</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              This sends a one-time <b>set-your-password</b> link to every active
              employee who has an email address and no login yet.
            </p>
            <p className="text-xs text-slate-500">
              In the current list: <b>{uninvitedCount}</b>{' '}
              {uninvitedCount === 1 ? 'employee has' : 'employees have'} never been
              invited. Links expire in 7 days. Employees without any email are
              skipped.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkSending}>
              Cancel
            </Button>
            <Button onClick={sendBulkInvites} disabled={bulkSending}>
              {bulkSending ? 'Sending…' : 'Send invites'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Employee Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Full Name *
                </label>
                <Input
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="Ahmed Khan"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="ahmed@convertt.co"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+923001234567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CNIC</label>
                <Input
                  value={form.cnic}
                  onChange={(e) => setForm({ ...form, cnic: e.target.value })}
                  placeholder="42101-1234567-9"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Designation *
                </label>
                {/* Combobox: type to add new OR pick from existing designations.
                    Uses a native <datalist> for accessibility + zero extra deps. */}
                <Input
                  list="designation-options"
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  placeholder="Pick existing or type a new one…"
                />
                <datalist id="designation-options">
                  {designationOptions.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
                <p className="text-[11px] text-slate-500 mt-1">
                  Suggestions from current employees. Type to create a new designation.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                <Select
                  value={form.departmentId}
                  onValueChange={(v) => setForm({ ...form, departmentId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type *</label>
                <Select
                  value={form.employeeType}
                  onValueChange={(v) => setForm({ ...form, employeeType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERMANENT">Permanent</SelectItem>
                    <SelectItem value="PROBATION">Probation</SelectItem>
                    <SelectItem value="INTERNSHIP">Internship</SelectItem>
                    <SelectItem value="TRAINING">Training</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Employee Code
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    value={employeeCode}
                    readOnly={!overrideCode}
                    onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                    placeholder={codeLoading ? 'Generating…' : 'CON-DEPT-NNN'}
                    className={overrideCode ? '' : 'bg-slate-50 text-slate-700 font-mono'}
                  />
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overrideCode}
                      onChange={(e) => setOverrideCode(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-slate-700 focus:ring-2 focus:ring-slate-100"
                    />
                    Override
                  </label>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {overrideCode
                    ? 'Custom code — must be unique across all employees.'
                    : 'Auto-generated from the selected department. Changes when you pick a different one.'}
                </p>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Joining Date *
                </label>
                <Input
                  type="date"
                  value={form.joiningDate}
                  onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
                />
              </div>
              {form.employeeType !== 'PERMANENT' && (
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Probation Duration (months)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={form.probationMonths}
                    onChange={(e) => setForm({ ...form, probationMonths: Math.max(1, Math.min(12, Number(e.target.value) || 3)) })}
                  />
                  {form.joiningDate && (
                    <p className="mt-1 text-xs text-slate-500">
                      Probation ends:{' '}
                      <span className="font-semibold text-slate-700">
                        {(() => {
                          const d = new Date(form.joiningDate)
                          d.setMonth(d.getMonth() + (form.probationMonths || 3))
                          return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
                        })()}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Initial Compensation — optional. If set, the API creates the
                Salary record + an audit-trail CompensationHistory row, so
                AutoPilot starts paying this person immediately. */}
            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={salary.enabled}
                  onChange={(e) => setSalary({ ...salary, enabled: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-slate-700 focus:ring-2 focus:ring-slate-100"
                />
                <span>
                  <span className="text-sm font-semibold text-slate-900">Set initial compensation now</span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Skips the separate trip to the Compensation tab. Payroll AutoPilot picks this up next run.
                  </span>
                </span>
              </label>

              {salary.enabled && (
                <div className="mt-3 space-y-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Total Monthly Gross (PKR)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">PKR</span>
                      <Input
                        type="number"
                        min={0}
                        step={1000}
                        value={salary.totalGross}
                        onChange={(e) => setSalary({ ...salary, totalGross: e.target.value })}
                        placeholder="50000"
                        className="pl-12"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <SplitPct label="Basic %"   value={salary.basicPct}  onChange={(v) => setSalary({ ...salary, basicPct: v })} />
                    <SplitPct label="House %"   value={salary.housePct}  onChange={(v) => setSalary({ ...salary, housePct: v })} />
                    <SplitPct label="Other %"   value={salary.otherPct}  onChange={(v) => setSalary({ ...salary, otherPct: v })} />
                  </div>
                  {salary.totalGross && Number(salary.totalGross) > 0 && (
                    <div className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
                      <span>Basic: <span className="font-semibold text-slate-900">PKR {Math.round(Number(salary.totalGross) * salary.basicPct / 100).toLocaleString()}</span></span>
                      <span>House Rent: <span className="font-semibold text-slate-900">PKR {Math.round(Number(salary.totalGross) * salary.housePct / 100).toLocaleString()}</span></span>
                      <span>Other Allowance: <span className="font-semibold text-slate-900">PKR {Math.round(Number(salary.totalGross) * salary.otherPct / 100).toLocaleString()}</span></span>
                    </div>
                  )}
                  {salary.basicPct + salary.housePct + salary.otherPct !== 100 && (
                    <p className="text-xs text-slate-700">Split must total 100% (currently {salary.basicPct + salary.housePct + salary.otherPct}%).</p>
                  )}
                </div>
              )}
            </div>

            {formError && (
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? 'Saving…' : 'Add Employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-provisioned login credentials — shown once after employee create */}
      <Dialog open={!!credentials} onOpenChange={(o) => !o && setCredentials(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Login Credentials</DialogTitle>
          </DialogHeader>
          {credentials && (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <p className="text-sm text-slate-900 font-medium">Account ready</p>
                <p className="text-xs text-slate-900 mt-1">{credentials.message}</p>
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Login Email</p>
                  <p className="text-sm font-mono bg-slate-50 border border-slate-200 rounded px-3 py-2 mt-1">
                    {credentials.email}
                  </p>
                </div>
                {credentials.tempPassword ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Temporary Password</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="flex-1 text-sm font-mono bg-slate-50 border border-slate-100 rounded px-3 py-2 select-all">
                        {credentials.tempPassword}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          if (!credentials.tempPassword) return
                          try {
                            await navigator.clipboard.writeText(credentials.tempPassword)
                            setCopied(true)
                            setTimeout(() => setCopied(false), 2000)
                          } catch {
                            // self-heal: clipboard blocked — user can still read it
                          }
                        }}
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Employee will be forced to change this on first login.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <p className="text-xs text-slate-900">
                      This email already had an account. It has been linked — they use their existing password.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCredentials(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Small percentage input used in the salary split editor. Clamps to 0–100. */
function SplitPct({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-slate-600 uppercase tracking-wider">{label}</label>
      <div className="relative mt-0.5">
        <Input
          type="number"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          className="pr-7 text-sm h-9"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
      </div>
    </div>
  )
}
