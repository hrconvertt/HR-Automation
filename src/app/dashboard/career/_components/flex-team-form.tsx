'use client'

/** "New flex team" — HR, managers and executives. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { FLEX_WORK_MODES } from '@/lib/talent-labels'

const input = 'w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white'

export function FlexTeamForm({ people, knownSkills }: {
  people: { id: string; fullName: string }[]
  knownSkills: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    title: '', category: '', description: '', location: '', workMode: 'REMOTE', hoursPerWeek: '1-5 hrs/wk',
    startDate: '', endDate: '', spots: '', hostId: '', skills: '',
  })

  async function create() {
    setBusy(true)
    try {
      const res = await fetch('/api/career/flex-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f,
          spots: f.spots ? Number(f.spots) : undefined,
          skills: f.skills.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toastError('Could not create the flex team', (d as { error?: string }).error); return }
      toastSuccess('Flex team created')
      setOpen(false)
      router.push(`/dashboard/career/flex-teams/${(d as { team: { id: string } }).team.id}`)
    } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white">
        New flex team
      </button>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-900">New flex team</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name"><input className={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. New Product — Sales Field Readiness" /></Field>
        <Field label="Category"><input className={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="e.g. Sales & Customer Success" /></Field>
        <Field label="Host">
          <select className={input} value={f.hostId} onChange={(e) => setF({ ...f, hostId: e.target.value })}>
            <option value="">Me</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        </Field>
        <Field label="How it is worked">
          <select className={input} value={f.workMode} onChange={(e) => setF({ ...f, workMode: e.target.value })}>
            {FLEX_WORK_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Location"><input className={input} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Leave blank if it does not matter" /></Field>
        <Field label="Availability"><input className={input} value={f.hoursPerWeek} onChange={(e) => setF({ ...f, hoursPerWeek: e.target.value })} /></Field>
        <Field label="Start date"><input type="date" className={input} value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
        <Field label="End date"><input type="date" className={input} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
        <Field label="Places (optional)"><input type="number" min={1} className={input} value={f.spots} onChange={(e) => setF({ ...f, spots: e.target.value })} /></Field>
        <Field label="Skills it uses (comma-separated)">
          <input className={input} value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} list="flex-known-skills" placeholder="Communication, Shopify" />
          <datalist id="flex-known-skills">{knownSkills.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
      </div>
      <Field label="What it is and why it matters">
        <textarea className={`${input} min-h-[80px]`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <div className="flex gap-2">
        <button type="button" onClick={create} disabled={busy || !f.title.trim()}
          className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40">
          {busy ? 'Creating…' : 'Create flex team'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm px-4 py-2 rounded-lg border border-slate-300">Cancel</button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  )
}
