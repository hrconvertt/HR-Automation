'use client'

/**
 * KnockoutEditorButton — HR-only.
 * Opens a dialog to manage the knockout criteria for a single requisition.
 * Lives on the Job Requisition row alongside JD review.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Filter, Plus, X } from 'lucide-react'

type Criterion = { type: string; value: string; isHard: boolean }

const TYPES: Array<{ value: string; label: string; hint: string }> = [
  { value: 'WORK_AUTH',     label: 'Work Authorization', hint: 'e.g. PK' },
  { value: 'LOCATION',      label: 'Location',           hint: 'Lahore,Karachi,Remote-OK' },
  { value: 'SKILL',         label: 'Skill',              hint: 'e.g. Shopify Liquid' },
  { value: 'MIN_YEARS',     label: 'Minimum Years',      hint: 'e.g. 3' },
  { value: 'MIN_EDUCATION', label: 'Minimum Education',  hint: 'BACHELORS | MASTERS | PHD' },
  { value: 'LANGUAGE',      label: 'Language',           hint: 'e.g. English' },
]

interface Props {
  requisitionId: string
  title: string
  jdContent?: string | null
}

export function KnockoutEditorButton({ requisitionId, title, jdContent }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  async function load() {
    setError('')
    const res = await fetch(`/api/recruiting/requisitions/${requisitionId}/knockouts`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error || 'Failed to load'); return }
    const existing: Criterion[] = (data.criteria ?? []).map((c: { type: string; value: string; isHard: boolean }) => ({
      type: c.type, value: c.value, isHard: c.isHard,
    }))
    // Suggest a SKILL criterion based on the JD if first edit and nothing exists.
    if (existing.length === 0 && jdContent) {
      const suggested = suggestFromJd(jdContent)
      if (suggested) existing.push(suggested)
    }
    setCriteria(existing)
    setLoaded(true)
  }

  async function openDialog() {
    setOpen(true)
    if (!loaded) await load()
  }

  function update(index: number, patch: Partial<Criterion>) {
    setCriteria((cs) => cs.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }
  function remove(index: number) {
    setCriteria((cs) => cs.filter((_, i) => i !== index))
  }
  function add() {
    setCriteria((cs) => [...cs, { type: 'SKILL', value: '', isHard: true }])
  }

  async function save() {
    setSaving(true); setError('')
    const res = await fetch(`/api/recruiting/requisitions/${requisitionId}/knockouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteria }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Save failed')
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border text-slate-700 border-slate-100 bg-slate-50 hover:bg-slate-100"
        title="Knockout filters"
      >
        <Filter className="w-3 h-3" />
        Filters
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-slate-700" />
              Knockout Filters — {title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-xs text-slate-500">
              Hard filters auto-disqualify candidates at intake. Soft filters are recorded but don&apos;t block.
              No filters = everyone passes through (legacy behaviour).
            </p>

            {criteria.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No criteria yet. Add one below.</p>
            ) : (
              <div className="space-y-2">
                {criteria.map((c, i) => {
                  const hint = TYPES.find((t) => t.value === c.type)?.hint ?? ''
                  return (
                    <div key={i} className="flex items-center gap-2 p-2 border border-slate-200 rounded-md bg-white">
                      <select
                        value={c.type}
                        onChange={(e) => update(i, { type: e.target.value })}
                        className="px-2 py-1.5 rounded-md border border-slate-300 text-xs bg-white"
                      >
                        {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <Input
                        value={c.value}
                        onChange={(e) => update(i, { value: e.target.value })}
                        placeholder={hint}
                        className="flex-1 text-xs"
                      />
                      <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={c.isHard}
                          onChange={(e) => update(i, { isHard: e.target.checked })}
                        />
                        Hard
                      </label>
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        className="p-1 text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            <button
              type="button"
              onClick={add}
              className="inline-flex items-center gap-1 text-xs text-slate-700 hover:text-slate-700"
            >
              <Plus className="w-3 h-3" /> Add criterion
            </button>

            {error && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save filters'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Very rough JD heuristic — if the JD mentions a common platform/tool keyword,
// pre-populate a SKILL filter as a starting point.
function suggestFromJd(jd: string): Criterion | null {
  const t = jd.toLowerCase()
  const KEYWORDS = ['shopify', 'react', 'node', 'figma', 'python', 'django', 'next.js', 'liquid']
  for (const k of KEYWORDS) {
    if (t.includes(k)) return { type: 'SKILL', value: k.charAt(0).toUpperCase() + k.slice(1), isHard: true }
  }
  return null
}
