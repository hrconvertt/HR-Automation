'use client'

/**
 * "Delete Employee" — three-mode removal control on the profile header.
 *
 *   Move to Trash (default, for mistakes)
 *     A record created in error. Goes to Trash, out of the directory, with the
 *     login disabled. Recoverable, and NOT marked Terminated — a mistake is not
 *     a leaver, so it never touches the exit board or the attrition numbers.
 *
 *   Archive (for real departures)
 *     status=TERMINATED, exitDate=now, login off. Keeps all history. This is
 *     the one for somebody who actually left.
 *
 *   Permanently Delete (destructive)
 *     Hard cascade: removes the User + Payslips + CompensationHistory +
 *     everything else. Only for demo data. HR must type the full name.
 *
 * All modes are HR-only and blocked in preview-as (server-side + hidden here).
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

type Mode = 'trash' | 'archive' | 'hard'

export default function DeleteEmployeeButton({ employeeId, employeeName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('trash')
  const [typedName, setTypedName] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setMode('trash')
    setTypedName('')
    setReason('')
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
      headers: mode === 'trash' ? { 'Content-Type': 'application/json' } : undefined,
      body: mode === 'trash' ? JSON.stringify({ reason }) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(data?.error ?? 'Failed to remove.')
      return
    }
    // Back to the People list — the record is trashed, archived, or gone.
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
            <DialogTitle>Remove {employeeName}?</DialogTitle>
            <p className="text-sm text-slate-600 mt-1">
              Choose how you want to remove this employee from the system.
            </p>
          </DialogHeader>

          {/* Mode picker */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setMode('trash')}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                mode === 'trash'
                  ? 'border-slate-200 bg-slate-50/50 ring-2 ring-slate-100'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <Trash2 className="w-4 h-4 text-slate-700" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    Move to Trash
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-700 bg-slate-100 rounded px-1.5 py-0.5 font-semibold">
                      For mistakes
                    </span>
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    A record added by mistake. Hides it from the directory and
                    disables login, but keeps everything so you can{' '}
                    <strong>restore it</strong> later. Does <strong>not</strong> mark
                    the person Terminated, so it never shows up as a departure.
                  </p>
                </div>
              </div>
            </button>

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
                      Real departure
                    </span>
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Marks status as <strong>Terminated</strong>, sets exit
                    date to today, and disables login. Keeps all payslips,
                    compensation history, performance reviews, and leave
                    records intact. Use this for someone who actually left.
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

          {/* Trash: an optional note on why, for whoever finds it later. */}
          {mode === 'trash' && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3 space-y-2">
              <p className="text-xs font-medium text-slate-700">
                Why is this being removed? <span className="text-slate-400">(optional)</span>
              </p>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. duplicate record, test entry, wrong candidate"
              />
            </div>
          )}

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
                ? (mode === 'trash' ? 'Moving…' : mode === 'archive' ? 'Archiving…' : 'Deleting…')
                : (mode === 'trash' ? 'Move to Trash' : mode === 'archive' ? 'Archive Employee' : 'Permanently Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
