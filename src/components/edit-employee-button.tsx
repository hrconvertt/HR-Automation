'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Pencil } from 'lucide-react'

interface Department { id: string; name: string; code: string }
interface ManagerOption { id: string; fullName: string; designation: string; employeeCode: string }

interface EditEmployeeButtonProps {
  employeeId: string
  initialData: {
    fullName: string
    email: string
    phone: string | null
    cnic: string | null
    dob: string | null
    gender: string | null
    address: string | null
    temporaryAddress: string | null
    workLocationAddress: string | null
    emergencyContact: string | null
    emergencyPhone: string | null
    designation: string
    departmentId: string | null
    reportingManagerId: string | null
    employeeType: string
    status: string
    workLocation: string | null
    timings: string | null
    workDays: string
    confirmationDate: string | null
    exitDate: string | null
    // Bank — HR-only, hidden from Manager via the API
    bankName?: string | null
    bankAccount?: string | null
    bankBranch?: string | null
    // Statutory / Tax IDs — HR + self only
    eobiNumber?: string | null
    ntn?: string | null
    sessiNumber?: string | null
    // Directory visibility (HR-only toggle)
    hideFromDirectory?: boolean | null
  }
}

export default function EditEmployeeButton({ employeeId, initialData }: EditEmployeeButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [managers, setManagers] = useState<ManagerOption[]>([])
  const [form, setForm] = useState({ ...initialData })

  useEffect(() => {
    fetch('/api/employees/departments')
      .then((r) => r.json())
      .then((d) => setDepartments(d.departments ?? []))
    // Leadership-only manager pool — designation contains lead/head/manager
    // /director/chief/CXO/VP/president/partner OR the user has HR_ADMIN role.
    fetch('/api/employees?limit=200&status=ACTIVE&managersOnly=1')
      .then((r) => r.json())
      .then((d) => {
        const all = (d.employees ?? d.items ?? []) as ManagerOption[]
        setManagers(all.filter((e) => e.id !== employeeId))
      })
  }, [employeeId])

  // Widened from string-only so checkboxes (e.g. hideFromDirectory) and
  // other primitive types can flow through the same helper.
  function f(field: string, value: string | boolean | null) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setError('')
    setSaving(true)
    const res = await fetch(`/api/employees/${employeeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Failed to save'); return }
    setOpen(false)
    router.refresh()
  }

  const WORK_DAYS_OPTIONS = [
    { value: 'Mon,Tue,Wed,Thu,Fri', label: 'Mon – Fri' },
    { value: 'Mon,Tue,Wed,Thu,Fri,Sat', label: 'Mon – Sat' },
    { value: 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', label: 'Mon – Sun' },
  ]

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="w-3.5 h-3.5" />
        Edit Profile
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Employee Profile</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Personal */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Personal Information</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <Input value={form.fullName} onChange={(e) => f('fullName', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <Input value={form.phone ?? ''} onChange={(e) => f('phone', e.target.value)} placeholder="+923001234567" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CNIC</label>
                  <Input value={form.cnic ?? ''} onChange={(e) => f('cnic', e.target.value)} placeholder="42101-1234567-9" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                  <Input type="date" value={form.dob ? form.dob.split('T')[0] : ''} onChange={(e) => f('dob', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                  <Select value={form.gender ?? ''} onValueChange={(v) => f('gender', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Permanent Address</label>
                  <Input value={form.address ?? ''} onChange={(e) => f('address', e.target.value)} placeholder="Home / family address" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temporary / Current Address</label>
                  <Input value={form.temporaryAddress ?? ''} onChange={(e) => f('temporaryAddress', e.target.value)} placeholder="If different from permanent address" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Work Location Address</label>
                  <Input value={form.workLocationAddress ?? ''} onChange={(e) => f('workLocationAddress', e.target.value)} placeholder="Office address or remote-work location" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact</label>
                  <Input value={form.emergencyContact ?? ''} onChange={(e) => f('emergencyContact', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Phone</label>
                  <Input value={form.emergencyPhone ?? ''} onChange={(e) => f('emergencyPhone', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Job */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Job Information</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Designation *</label>
                  <Input value={form.designation} onChange={(e) => f('designation', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <Select value={form.departmentId ?? ''} onValueChange={(v) => f('departmentId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reporting Manager</label>
                  <Select
                    value={form.reportingManagerId ?? '__none'}
                    onValueChange={(v) => f('reportingManagerId', v === '__none' ? '' : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="No manager" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— No manager —</SelectItem>
                      {managers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.fullName} ({m.employeeCode}) — {m.designation}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">Used for approvals, performance reviews, and team views.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee Type</label>
                  <Select value={form.employeeType} onValueChange={(v) => f('employeeType', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERMANENT">Permanent</SelectItem>
                      <SelectItem value="PROBATION">Probation</SelectItem>
                      <SelectItem value="INTERNSHIP">Internship</SelectItem>
                      <SelectItem value="TRAINING">Training</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <Select value={form.status} onValueChange={(v) => f('status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="PROBATION">Probation</SelectItem>
                      <SelectItem value="ON_LEAVE">On Leave</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                      <SelectItem value="RESIGNED">Resigned</SelectItem>
                      <SelectItem value="TERMINATED">Terminated</SelectItem>
                      <SelectItem value="LAYOFF">Laid Off</SelectItem>
                    </SelectContent>
                  </Select>
                  {['RESIGNED', 'TERMINATED', 'LAYOFF'].includes(form.status) && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      Exit clearance will be auto-created when you save.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Work Location</label>
                  <Select value={form.workLocation ?? ''} onValueChange={(v) => f('workLocation', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ONSITE">Onsite</SelectItem>
                      <SelectItem value="REMOTE">Remote</SelectItem>
                      <SelectItem value="HYBRID">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Work Schedule</label>
                  <Select value={form.workDays} onValueChange={(v) => f('workDays', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WORK_DAYS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timings</label>
                  <Input value={form.timings ?? ''} onChange={(e) => f('timings', e.target.value)} placeholder="10:00 AM – 7:00 PM" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirmation Date</label>
                  <Input type="date" value={form.confirmationDate ? form.confirmationDate.split('T')[0] : ''} onChange={(e) => f('confirmationDate', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Exit Date</label>
                  <Input type="date" value={form.exitDate ? form.exitDate.split('T')[0] : ''} onChange={(e) => f('exitDate', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Bank — HR only. Self-healing: all optional, blank tolerated, payroll PDF shows "—" when missing. */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Bank Details
                <span className="ml-2 normal-case font-normal text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">HR only · employee sees their own</span>
              </p>
              <p className="text-[11px] text-gray-500 mb-3">Used for salary disbursement. Managers do not see these fields.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                  <Input value={form.bankName ?? ''} onChange={(e) => f('bankName', e.target.value)} placeholder="e.g. HBL, UBL, Meezan" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                  <Input value={form.bankBranch ?? ''} onChange={(e) => f('bankBranch', e.target.value)} placeholder="Branch name or city" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Number / IBAN</label>
                  <Input value={form.bankAccount ?? ''} onChange={(e) => f('bankAccount', e.target.value)} placeholder="PK36SCBL0000001123456702" />
                  <p className="text-[10px] text-gray-400 mt-1">Stored against this employee. Used only for payroll runs.</p>
                </div>
              </div>
            </div>

            {/* Statutory / Tax IDs — HR + self only. Self-healing: all optional. */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Statutory & Tax IDs
                <span className="ml-2 normal-case font-normal text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">HR only · employee sees their own</span>
              </p>
              <p className="text-[11px] text-gray-500 mb-3">For EOBI / FBR / provincial filings. Managers do not see these.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">EOBI Number</label>
                  <Input value={form.eobiNumber ?? ''} onChange={(e) => f('eobiNumber', e.target.value)} placeholder="Employee EOBI registration #" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">NTN (FBR Tax #)</label>
                  <Input value={form.ntn ?? ''} onChange={(e) => f('ntn', e.target.value)} placeholder="0000000-0" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">SESSI Number <span className="text-gray-400 font-normal">(Sindh, optional)</span></label>
                  <Input value={form.sessiNumber ?? ''} onChange={(e) => f('sessiNumber', e.target.value)} placeholder="Provincial social-security number" />
                </div>
              </div>
            </div>

            {/* Directory visibility — HR-only kill switch for edge cases:
                protected leave, pre-announcement hires, etc. */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Directory Visibility
                <span className="ml-2 normal-case font-normal text-[10px] text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">HR only</span>
              </p>
              <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition">
                <input
                  type="checkbox"
                  checked={form.hideFromDirectory ?? false}
                  onChange={(e) => f('hideFromDirectory', e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-200"
                />
                <span className="text-sm text-slate-700">
                  <span className="font-medium text-slate-900">Hide from Company Directory</span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Other employees won&apos;t see this person in the directory or search results.
                    HR, the assigned manager, and the employee themselves can still see the record.
                    Use for protected leave, pre-announcement hires, or sensitive isolation cases.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2 mt-2">{error}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
