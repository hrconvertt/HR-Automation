'use client'

/**
 * "Rehire" header action on ex-employee profiles (HR-only, gated server-side).
 * Opens a dialog collecting the new joining details, then POSTs
 * /api/employees/[id]/rehire. Salary input is optional and HR-only — this
 * component is only ever rendered for HR admins.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'
import { UserPlus } from 'lucide-react'

interface Options {
  departments: { id: string; name: string }[]
  managers: { id: string; fullName: string; designation: string }[]
}

export default function RehireButton({
  employeeId,
  employeeName,
  currentDesignation,
  currentDepartmentId,
}: {
  employeeId: string
  employeeName: string
  currentDesignation: string
  currentDepartmentId: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<Options | null>(null)
  const [joiningDate, setJoiningDate] = useState('')
  const [designation, setDesignation] = useState(currentDesignation)
  const [departmentId, setDepartmentId] = useState(currentDepartmentId ?? '')
  const [managerId, setManagerId] = useState('')
  const [monthlySalary, setMonthlySalary] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setJoiningDate(new Date().toISOString().slice(0, 10))
    setDesignation(currentDesignation)
    setDepartmentId(currentDepartmentId ?? '')
    setManagerId('')
    setMonthlySalary('')
    // Departments + active-manager picker data (HR-only endpoint).
    fetch('/api/job-changes/options', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOptions({ departments: d.departments ?? [], managers: d.managers ?? [] }))
      .catch(() => setOptions({ departments: [], managers: [] }))
  }, [open, currentDesignation, currentDepartmentId])

  const canSubmit = !!joiningDate && designation.trim().length > 0

  async function submit() {
    if (!canSubmit || saving) return
    setSaving(true)
    try {
      const salaryNum = monthlySalary.trim() ? Number(monthlySalary) : null
      const res = await fetch(`/api/employees/${employeeId}/rehire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          joiningDate,
          designation: designation.trim(),
          departmentId: departmentId || undefined,
          managerId: managerId || undefined,
          monthlySalary: salaryNum != null && Number.isFinite(salaryNum) && salaryNum > 0 ? salaryNum : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: 'Rehire failed', description: data.error ?? 'Unknown error', variant: 'destructive' })
        return
      }
      toast({ title: 'Employee rehired', description: `${employeeName} is active again.` })
      setOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900'

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="w-3.5 h-3.5" /> Rehire
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Rehire {employeeName}</DialogTitle>
            <DialogDescription>
              Reactivates the employee with a new joining date. The exit date is cleared and a role-history entry is recorded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">New joining date</label>
              <input type="date" className={inputCls} value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Designation</label>
              <input className={inputCls} value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Software Engineer" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Department <span className="text-slate-400">(optional)</span></label>
              <select className={inputCls} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">Keep current department</option>
                {(options?.departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Reporting manager <span className="text-slate-400">(optional)</span></label>
              <select className={inputCls} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">Keep current manager</option>
                {(options?.managers ?? [])
                  .filter((m) => m.id !== employeeId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>{m.fullName} — {m.designation}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Monthly gross salary <span className="text-slate-400">(optional, PKR)</span>
              </label>
              <input
                type="number"
                min={0}
                className={inputCls}
                value={monthlySalary}
                onChange={(e) => setMonthlySalary(e.target.value)}
                placeholder="Leave blank to set compensation later"
              />
              <p className="text-xs text-slate-400 mt-1">
                If set, the salary record and compensation history are updated as a rehire offer.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={!canSubmit || saving}>
              {saving ? 'Rehiring…' : 'Rehire employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
