'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Pencil } from 'lucide-react'
import {
  POSTING_PLATFORMS, POSTING_CURRENCIES, POSTING_STATUSES, PLATFORM_LABELS,
} from '@/lib/job-posting'

export interface EditablePosting {
  id: string
  role: string
  platform: string
  currency: string
  budget: number | null
  cost: number | null
  postedAt: string | null   // yyyy-mm-dd
  closedAt: string | null   // yyyy-mm-dd
  status: string
  notes: string | null
}

/**
 * Correct one advert. The row is opened automatically when a JD is published,
 * which can only know the careers page and the day — everything about where it
 * really went up and what it cost is typed here.
 *
 * Blank is allowed and means "not known", which is not the same as free. Free
 * is a zero.
 */
export function PostingEditButton({ posting }: { posting: EditablePosting }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [f, setF] = useState(posting)

  function set<K extends keyof EditablePosting>(key: K, value: EditablePosting[K]) {
    setF((prev) => ({ ...prev, [key]: value }))
  }

  async function save() {
    setError(''); setSaving(true)
    const res = await fetch(`/api/recruiting/postings/${posting.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: f.platform,
        currency: f.currency,
        status: f.status,
        budget: f.budget ?? '',
        cost: f.cost ?? '',
        postedAt: f.postedAt ?? '',
        closedAt: f.closedAt ?? '',
        notes: f.notes ?? '',
      }),
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
        onClick={() => { setF(posting); setOpen(true) }}
        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-slate-100 bg-slate-50 text-slate-700 hover:bg-slate-100"
        title="Edit this post"
      >
        <Pencil className="w-3 h-3" /> Edit
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle>Job post — {posting.role}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Platform">
                <select
                  value={f.platform}
                  onChange={(e) => set('platform', e.target.value)}
                  className={inputClass}
                >
                  {POSTING_PLATFORMS.map((p) => (
                    <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Currency">
                <select
                  value={f.currency}
                  onChange={(e) => set('currency', e.target.value)}
                  className={inputClass}
                >
                  {POSTING_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Posted on">
                <input
                  type="date"
                  value={f.postedAt ?? ''}
                  onChange={(e) => set('postedAt', e.target.value || null)}
                  className={inputClass}
                />
              </Field>
              <Field label="Closed on">
                <input
                  type="date"
                  value={f.closedAt ?? ''}
                  onChange={(e) => set('closedAt', e.target.value || null)}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Budget set" hint="Per day on LinkedIn. 0 for a free post.">
                <input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={f.budget ?? ''}
                  onChange={(e) => set('budget', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="not known"
                  className={inputClass}
                />
              </Field>
              <Field label="Amount paid" hint="Leave blank while it is still running.">
                <input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={f.cost ?? ''}
                  onChange={(e) => set('cost', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="not known"
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="Status">
              <select
                value={f.status}
                onChange={(e) => set('status', e.target.value)}
                className={inputClass}
              >
                {POSTING_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </Field>

            <Field label="Note">
              <textarea
                rows={2}
                value={f.notes ?? ''}
                onChange={(e) => set('notes', e.target.value || null)}
                placeholder="Anything worth remembering about this post…"
                className={inputClass}
              />
            </Field>

            {error && (
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const inputClass =
  'w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-slate-100'

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-[11px] text-slate-400 mt-0.5 block">{hint}</span>}
    </label>
  )
}
