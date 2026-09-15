'use client'

/**
 * A position's own screening columns — the questions its sheet asked in the
 * middle of the row ("Figma/Adobe", "Knows CRO?", "Shopify Liquid"). They sit
 * between Education and Verdict for every candidate on this requisition.
 *
 * Renaming keeps what was already typed under the old name. Removing a column
 * only hides it; the values stay on each candidate's record.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { safeFetch } from '@/lib/safe-fetch'

interface Row { id: number; from: string | null; label: string }

export function ScreeningColumnsDialog({ open, onOpenChange, requisitionId, columns }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  requisitionId: string
  columns: string[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>(() => columns.map((label, id) => ({ id, from: label, label })))
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const update = (id: number, label: string) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, label } : r)))
  const remove = (id: number) => setRows((rs) => rs.filter((r) => r.id !== id))
  const move = (i: number, by: number) =>
    setRows((rs) => {
      const next = [...rs]
      const [r] = next.splice(i, 1)
      next.splice(i + by, 0, r)
      return next
    })

  function add() {
    const label = draft.replace(/\s+/g, ' ').trim()
    if (!label) return
    if (rows.some((r) => r.label.trim().toLowerCase() === label.toLowerCase())) {
      setError(`There is already a column called "${label}".`)
      return
    }
    setError('')
    setRows((rs) => [...rs, { id: Date.now(), from: null, label }])
    setDraft('')
  }

  async function save() {
    setError('')
    const labels = rows.map((r) => r.label.replace(/\s+/g, ' ').trim())
    if (labels.some((l) => !l)) { setError('Every column needs a name, or remove it.'); return }
    const lower = labels.map((l) => l.toLowerCase())
    if (new Set(lower).size !== lower.length) { setError('Two columns have the same name.'); return }

    setBusy(true)
    const r = await safeFetch(`/api/recruiting/requisitions/${requisitionId}/post`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        screeningColumns: labels,
        screeningRenames: rows
          .map((row, i) => ({ from: row.from, to: labels[i] }))
          .filter((x) => x.from && x.from !== x.to),
      }),
    })
    setBusy(false)
    if (!r.ok) { setError(r.error ?? 'Could not save the columns.'); return }
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Screening columns for this position</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500">
          The questions this role is screened on. They sit between Education and Verdict for every candidate here.
          Renaming keeps the values already typed; removing a column hides it without deleting anything.
        </p>

        {rows.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">No screening columns yet.</p>
        ) : (
          <ol className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="w-5 text-xs text-slate-400 tabular-nums">{i + 1}.</span>
                <Input
                  value={r.label}
                  onChange={(e) => update(r.id, e.target.value)}
                  aria-label={`Column ${i + 1} name`}
                  className="flex-1 min-w-[200px] h-9"
                />
                <span className="flex items-center gap-2 text-xs">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                    className="text-slate-500 hover:text-slate-900 disabled:text-slate-300">Move up</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1}
                    className="text-slate-500 hover:text-slate-900 disabled:text-slate-300">Move down</button>
                  <button type="button" onClick={() => remove(r.id)} className="text-slate-500 hover:text-red-700">Remove</button>
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder="e.g. Figma / Adobe XD"
            aria-label="New column name"
            className="flex-1 h-9"
          />
          <Button type="button" variant="outline" size="sm" onClick={add} disabled={!draft.trim() || rows.length >= 40}>
            Add column
          </Button>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save columns'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
