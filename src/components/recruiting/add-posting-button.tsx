'use client'

/**
 * Record a job post that went up outside the system.
 *
 * Publishing a JD opens its careers-page row automatically, but a role gets
 * advertised over and over — the QA Engineer went up five separate times — and
 * each of those is its own line with its own dates and its own bill. Editing
 * the first one to describe the second just loses the first.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Loader2 } from 'lucide-react'
import {
  POSTING_PLATFORMS, POSTING_CURRENCIES, POSTING_STATUSES, PLATFORM_LABELS,
} from '@/lib/job-posting'

export interface RoleOption { id: string; title: string; status: string }

const BLANK = {
  requisitionId: '', platform: 'LINKEDIN', status: 'ACTIVE', currency: 'AED',
  postedAt: '', closedAt: '', budget: '', cost: '', notes: '',
}

export function AddPostingButton({ roles }: { roles: RoleOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ ...BLANK })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function set<K extends keyof typeof BLANK>(k: K, v: string) {
    setF((prev) => ({ ...prev, [k]: v }))
  }

  async function save() {
    setBusy(true); setErr(null)
    const res = await fetch('/api/recruiting/postings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(f),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error ?? 'Could not add it.')
      return
    }
    setF({ ...BLANK })
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="w-3.5 h-3.5 mr-1.5" /> Add a post
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle>Add a job post</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Field label="Role" hint="Which requisition this advert was for.">
              <select
                value={f.requisitionId}
                onChange={(e) => set('requisitionId', e.target.value)}
                className={input}
              >
                <option value="">Pick a role…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.status === 'OPEN' ? r.title : `${r.title} (${r.status.toLowerCase()})`}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Platform">
                <select value={f.platform} onChange={(e) => set('platform', e.target.value)} className={input}>
                  {POSTING_PLATFORMS.map((p) => (
                    <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select value={f.status} onChange={(e) => set('status', e.target.value)} className={input}>
                  {POSTING_STATUSES.map((s) => (
                    <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Posted on">
                <input type="datetime-local" value={f.postedAt}
                  onChange={(e) => set('postedAt', e.target.value)} className={input} />
              </Field>
              <Field label="Closed on" hint="Blank while it is still running.">
                <input type="datetime-local" value={f.closedAt}
                  onChange={(e) => set('closedAt', e.target.value)} className={input} />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Budget" hint="Per day. 0 is free.">
                <input type="number" min="0" step="0.01" value={f.budget}
                  onChange={(e) => set('budget', e.target.value)} placeholder="not set" className={input} />
              </Field>
              <Field label="Paid" hint="Blank while running.">
                <input type="number" min="0" step="0.01" value={f.cost}
                  onChange={(e) => set('cost', e.target.value)} placeholder="not set" className={input} />
              </Field>
              <Field label="Currency">
                <select value={f.currency} onChange={(e) => set('currency', e.target.value)} className={input}>
                  {POSTING_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Note">
              <input value={f.notes} onChange={(e) => set('notes', e.target.value)}
                placeholder="Anything worth remembering" className={input} />
            </Field>

            {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</p>}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy || !f.requisitionId}>
              {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Add post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const input = 'w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white '
  + 'focus:outline-none focus:ring-2 focus:ring-slate-100'

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
