'use client'

/** Distribute — who gets the journey: chosen people, a department, all managers, or everyone. */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toastError, toastSuccess } from '@/components/ui/toaster'

type Target = 'PEOPLE' | 'DEPARTMENT' | 'MANAGERS' | 'EVERYONE'

export function DistributeButton({ journeyId, published, people, departments, managerCount }: {
  journeyId: string
  published: boolean
  people: { id: string; fullName: string; department: string | null; has: boolean }[]
  departments: { id: string; name: string }[]
  managerCount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<Target>('PEOPLE')
  const [picked, setPicked] = useState<string[]>([])
  const [dept, setDept] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return people.filter((p) => !term || p.fullName.toLowerCase().includes(term) || (p.department ?? '').toLowerCase().includes(term))
  }, [people, q])

  async function send() {
    setBusy(true)
    try {
      const res = await fetch(`/api/experience/journeys/${journeyId}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, employeeIds: picked, departmentId: dept }),
      })
      const d = await res.json().catch(() => ({})) as { error?: string; assigned?: number; already?: number }
      if (!res.ok) { toastError('Could not distribute it', d.error); return }
      toastSuccess(`Sent to ${d.assigned} ${d.assigned === 1 ? 'person' : 'people'}${d.already ? ` · ${d.already} already had it` : ''}`)
      setOpen(false)
      setPicked([])
      router.refresh()
    } finally { setBusy(false) }
  }

  const ready = target === 'PEOPLE' ? picked.length > 0 : target === 'DEPARTMENT' ? !!dept : true

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={!published}
        title={published ? undefined : 'Publish the journey first'}
        className="text-sm font-semibold px-5 py-2 rounded-full border border-slate-400 bg-white hover:bg-slate-50 disabled:opacity-40">
        Distribute
      </button>
      {!published && <span className="text-xs text-slate-500">Publish it to distribute</span>}
      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Distribute journey</DialogTitle>
            <DialogDescription>Each person gets a notification that takes them straight into it. Anyone who already has it is left alone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <fieldset className="grid grid-cols-2 gap-2">
              {([
                ['PEOPLE', 'Chosen people'],
                ['DEPARTMENT', 'A department'],
                ['MANAGERS', `All managers (${managerCount})`],
                ['EVERYONE', `Everyone (${people.length})`],
              ] as [Target, string][]).map(([v, label]) => (
                <label key={v} className={`text-sm px-3 py-2 rounded-lg border cursor-pointer ${target === v ? 'border-slate-900 bg-slate-50 font-medium' : 'border-slate-200'}`}>
                  <input type="radio" name="target" className="sr-only" checked={target === v} onChange={() => setTarget(v)} />
                  {label}
                </label>
              ))}
            </fieldset>

            {target === 'PEOPLE' && (
              <div>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or department"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                <ul className="mt-2 max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {shown.map((p) => (
                    <li key={p.id}>
                      <label className="flex items-center gap-2 px-3 py-2 text-sm">
                        <input type="checkbox" className="accent-slate-900" disabled={p.has} checked={p.has || picked.includes(p.id)}
                          onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
                        <span className="flex-1">{p.fullName} <span className="text-xs text-slate-500">{p.department ?? ''}</span></span>
                        {p.has && <span className="text-[11px] text-slate-500">already has it</span>}
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-slate-500 mt-1">{picked.length} selected</p>
              </div>
            )}
            {target === 'DEPARTMENT' && (
              <select value={dept} onChange={(e) => setDept(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Select a department…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={send} disabled={busy || !ready}>{busy ? 'Sending…' : 'Distribute'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
