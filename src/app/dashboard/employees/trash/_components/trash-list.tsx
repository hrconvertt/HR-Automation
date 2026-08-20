'use client'

/**
 * The trash: restore a mistaken record, or remove it for good.
 *
 * Restore is one click — it was a mistake to delete, undoing it should not be a
 * ceremony. Permanent deletion is the one that asks for the typed name, because
 * that one cannot be undone.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { ArrowLeft, RotateCcw, Trash2, AlertTriangle, Loader2 } from 'lucide-react'

interface Row {
  id: string
  fullName: string
  employeeCode: string
  designation: string | null
  department: string | null
  deletedAt: string
  deleteReason: string | null
  preDeleteStatus: string | null
  deletedBy: string | null
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

export function TrashList({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [purge, setPurge] = useState<Row | null>(null)
  const [typed, setTyped] = useState('')

  async function restore(r: Row) {
    setBusy(r.id); setErr(null)
    const res = await fetch(`/api/employees/${r.id}/restore`, { method: 'POST' })
    setBusy(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error ?? 'Could not restore.')
      return
    }
    router.refresh()
  }

  async function deleteForever() {
    if (!purge) return
    if (typed.trim() !== purge.fullName.trim()) return
    setBusy(purge.id); setErr(null)
    const res = await fetch(`/api/employees/${purge.id}?mode=hard`, { method: 'DELETE' })
    setBusy(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error ?? 'Could not delete.')
      return
    }
    setPurge(null); setTyped('')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/dashboard/employees"
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900 text-sm mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> Back to People
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Trash</h1>
        <p className="text-sm text-slate-500 mt-1">
          Records removed as mistakes. Restore puts them back exactly as they were.
          Permanent deletion cannot be undone.
        </p>
      </div>

      {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-900">{rows.length}</span>{' '}
            {rows.length === 1 ? 'record' : 'records'} in the trash
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-12">
            <Trash2 className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">The trash is empty.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {rows.map((r) => (
              <div key={r.id} className="px-4 py-3 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{r.fullName}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    <span className="font-mono">{r.employeeCode}</span>
                    {r.designation && ` · ${r.designation}`}
                    {r.department && ` · ${r.department}`}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Removed {when(r.deletedAt)}
                    {r.deletedBy && ` by ${r.deletedBy}`}
                    {r.preDeleteStatus && ` · was ${r.preDeleteStatus.toLowerCase()}`}
                  </p>
                  {r.deleteReason && (
                    <p className="text-[11px] text-slate-600 mt-1 italic">&ldquo;{r.deleteReason}&rdquo;</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" disabled={busy === r.id}
                    onClick={() => restore(r)}>
                    {busy === r.id
                      ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
                    Restore
                  </Button>
                  <Button size="sm" variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    onClick={() => { setPurge(r); setTyped('') }}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete forever
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!purge} onOpenChange={(o) => { if (!o) { setPurge(null); setTyped('') } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              Delete {purge?.fullName} forever?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            This cascade-deletes the login and every record that referenced them —
            payslips, compensation history, attendance, everything. It cannot be undone.
          </p>
          {purge && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3 space-y-2">
              <p className="text-xs text-slate-900">
                Type{' '}
                <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-100">
                  {purge.fullName}
                </strong>{' '}
                to confirm:
              </p>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)}
                placeholder={purge.fullName} autoFocus />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPurge(null); setTyped('') }}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={!purge || typed.trim() !== purge.fullName.trim() || busy === purge?.id}
              onClick={deleteForever}
            >
              {busy === purge?.id && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
