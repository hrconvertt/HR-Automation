'use client'

/**
 * "Add to Learning Path" and "Create Learning Path" — one dialog, two ways in.
 *
 * Adding shows your paths in a dropdown, with the ones already holding this
 * course greyed out rather than offered twice, and a "new path" option at the
 * bottom. Creating opens straight on the new-path fields: a name, an optional
 * description, and who can see it.
 */

import { useEffect, useState } from 'react'
import { Loader2, Lock, Globe, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toastSuccess, toastError } from '@/components/ui/toaster'
import {
  PATH_VISIBILITY, VISIBILITY_LABEL, VISIBILITY_HINT, type PathVisibility,
} from '@/lib/learning-path-types'

interface MyPath { id: string; title: string; visibility: string; items: number; contains: boolean }

const NEW = '__new__'
const inputCls =
  'w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400'

export function AddToPathDialog({ open, program, startNew, onClose, onDone }: {
  open: boolean
  /** The course being added; null when making an empty path from the paths page. */
  program: { id: string; title: string } | null
  /** Open on the new-path fields — the Create Learning Path menu item. */
  startNew: boolean
  onClose: () => void
  onDone?: (pathId: string) => void
}) {
  const [paths, setPaths] = useState<MyPath[] | null>(null)
  const [choice, setChoice] = useState<string>(NEW)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<PathVisibility>('PRIVATE')
  const [saving, setSaving] = useState(false)

  // Load your paths each time the dialog opens. The state lands after the
  // fetch, in the promise, not straight down the effect body.
  const programId = program?.id ?? null
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      const res = await fetch(`/api/learning/paths${programId ? `?programId=${programId}` : ''}`)
      const d = await res.json().catch(() => ({}))
      if (cancelled) return
      const list: MyPath[] = res.ok ? d.paths ?? [] : []
      const firstFree = list.find((p) => !p.contains)
      setPaths(list)
      setChoice(startNew || !programId || !firstFree ? NEW : firstFree.id)
      setTitle('')
      setDescription('')
      setVisibility('PRIVATE')
    })()
    return () => { cancelled = true }
  }, [open, programId, startNew])

  function close() {
    setPaths(null)
    onClose()
  }

  async function save() {
    setSaving(true)
    try {
      if (choice === NEW) {
        if (!title.trim()) {
          toastError('Give the path a name', null)
          return
        }
        const res = await fetch('/api/learning/paths', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description, visibility, programId }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) {
          toastError('Path not created', d.error ?? null)
          return
        }
        toastSuccess(program ? `Added to ${d.path.title}` : 'Learning path created', program?.title ?? d.path.title)
        onDone?.(d.path.id)
      } else {
        const target = paths?.find((p) => p.id === choice)
        const res = await fetch(`/api/learning/paths/${choice}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ programId }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) {
          toastError('Not added', d.error ?? null)
          return
        }
        toastSuccess(`Added to ${target?.title ?? 'your path'}`, program?.title ?? null)
        onDone?.(choice)
      }
      close()
    } finally {
      setSaving(false)
    }
  }

  const adding = !!program && !startNew

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{adding ? 'Add to Learning Path' : 'Create Learning Path'}</DialogTitle>
        </DialogHeader>
        {program && <p className="text-xs text-slate-500 -mt-2 truncate">{program.title}</p>}

        {paths === null ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-3">
            {adding && paths.length > 0 && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Learning Path</span>
                <select className={`${inputCls} mt-1`} value={choice} onChange={(e) => setChoice(e.target.value)}>
                  {paths.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.contains}>
                      {p.title}{p.contains ? ' — already in it' : ` (${p.items} item${p.items === 1 ? '' : 's'})`}
                    </option>
                  ))}
                  <option value={NEW}>+ A new path…</option>
                </select>
              </label>
            )}

            {choice === NEW && (
              <>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Name</span>
                  <input
                    className={`${inputCls} mt-1`}
                    value={title}
                    maxLength={120}
                    placeholder="e.g. New Manager Skills"
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    Description <span className="font-normal text-slate-400">(optional)</span>
                  </span>
                  <textarea
                    className={`${inputCls} mt-1 min-h-[70px]`}
                    value={description}
                    maxLength={1000}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <fieldset>
                  <legend className="text-sm font-medium text-slate-700">Who can see it</legend>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {PATH_VISIBILITY.map((v) => (
                      <label
                        key={v}
                        className={`relative rounded-lg border px-3 py-2.5 cursor-pointer ${
                          visibility === v ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input type="radio" name="new-path-visibility" checked={visibility === v} onChange={() => setVisibility(v)} className="sr-only" />
                        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                          {v === 'EVERYONE' ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          {VISIBILITY_LABEL[v]}
                        </span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">{VISIBILITY_HINT[v]}</span>
                        {visibility === v && <Check className="w-3.5 h-3.5 text-slate-900 absolute top-2.5 right-2.5" />}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || paths === null} className="gap-1.5">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
