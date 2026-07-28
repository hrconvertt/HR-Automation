'use client'

/**
 * "Delete Employee" — two-mode destructive control on the profile header.
 *
 *   Archive (default, recommended)
 *     Soft-delete: status=TERMINATED, terminationType=INVOLUNTARY,
 *     exitDate=now, User.isActive=false. All historical data (payslips,
 *     comp history, reviews, attendance) is preserved. This is what HR
 *     should use for real departures.
 *
 *   Permanently Delete (destructive)
 *     Hard cascade: removes the User + Payslips + CompensationHistory +
 *     Performance reviews + Leaves + Attendance + everything else. Only
 *     appropriate for demo data or data entry mistakes. HR must type the
 *     employee's full name to confirm.
 *
 * Both modes are HR-only and blocked when the HR admin is using preview-as
 * (handled server-side and by hiding the button on the page).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, AlertTriangle, Archive } from 'lucide-react'

interface Props {
  employeeId: string
  employeeName: string
}

type Mode = 'archive' | 'hard'

export default function DeleteEmployeeButton({ employeeId, employeeName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('archive')
  const [typedName, setTypedName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setMode('archive')
    setTypedName('')
    setError('')
    setBusy(false)
  }

  async function handleConfirm() {
    setError('')
    if (mode === 'hard' && typedName.trim() !== employeeName.trim()) {
      setError(`Please type "${employeeName}" exactly to confirm permanent deletion.`)
      return
    }
    setBusy(true)
    const res = await fetch(`/api/employees/${employeeId}?mode=${mode}`, {
      method: 'DELETE',
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(data?.error ?? 'Failed to delete.')
      return
    }
    // Navigate back to the People list — record either archived or gone.
    setOpen(false)
    reset()
    router.push('/dashboard/employees')
    router.refresh()
  }

  const hardNameMatches = typedName.trim() === employeeName.trim()

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => { reset(); setOpen(true) }}
        className="text-slate-700 border-slate-100 hover:bg-slate-50 hover:text-slate-900"
      >
        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
        Delete Employee
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete {employeeName}?</DialogTitle>
            <p className="text-sm text-slate-600 mt-1">
              Choose how you want to remove this employee from the system.
            </p>
          </DialogHeader>

          {/* Mode picker */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setMode('archive')}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                mode === 'archive'
                  ? 'border-slate-200 bg-slate-50/50 ring-2 ring-slate-100'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <Archive className="w-4 h-4 text-slate-700" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    Archive Employee
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-700 bg-slate-100 rounded px-1.5 py-0.5 font-semibold">
                      Recommended
                    </span>
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Marks status as <strong>Terminated</strong>, sets exit
                    date to today, and disables login. Keeps all payslips,
                    compensation history, performance reviews, and leave
                    records intact. Use this for real departures.
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode('hard')}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                mode === 'hard'
                  ? 'border-slate-200 bg-slate-50/50 ring-2 ring-slate-100'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <AlertTriangle className="w-4 h-4 text-slate-700" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    Permanently Delete
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    <strong className="text-slate-700">Destructive.</strong>{' '}
                    Cascade-deletes the user account, all payslips,
                    compensation history, performance reviews, leave
                    requests, and attendance logs. Use only for demo data
                    or data-entry mistakes.
                  </p>
                </div>
              </div>
            </button>
          </div>

          {/* Hard-delete confirmation: type full name */}
          {mode === 'hard' && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3 space-y-2">
              <p className="text-xs text-slate-900">
                To confirm permanent deletion, type{' '}
                <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-100">
                  {employeeName}
                </strong>{' '}
                below:
              </p>
              <Input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={employeeName}
                autoFocus
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-md p-2">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={busy || (mode === 'hard' && !hardNameMatches)}
              className={
                mode === 'hard'
                  ? 'bg-slate-700 hover:bg-slate-700 text-white'
                  : 'bg-slate-700 hover:bg-slate-700 text-white'
              }
            >
              {busy
                ? (mode === 'archive' ? 'Archiving…' : 'Deleting…')
                : (mode === 'archive' ? 'Archive Employee' : 'Permanently Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
