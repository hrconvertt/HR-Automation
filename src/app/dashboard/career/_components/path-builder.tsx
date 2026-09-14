'use client'

/**
 * Career Path Builder — Workday's: the current role on top, three next moves
 * at a time underneath, each with how many of your interests (or skills) it
 * uses and how many openings there are. Add one and it becomes Move 1, with
 * the moves from there below it. The path so far runs down the right; save it
 * and it becomes a plan you can work towards.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import type { Move } from '@/lib/queries/career'

const PER_PAGE = 3

export function PathBuilder({ currentRole }: { currentRole: string }) {
  const router = useRouter()
  const [basis, setBasis] = useState<'INTERESTS' | 'SKILLS'>('INTERESTS')
  const [steps, setSteps] = useState<string[]>([])
  const [moves, setMoves] = useState<Move[] | null>(null)
  const [page, setPage] = useState(0)
  const [name, setName] = useState('Career Development')
  const [saving, setSaving] = useState(false)

  const from = steps.length ? steps[steps.length - 1] : currentRole
  const exclude = [currentRole, ...steps].join('|')

  useEffect(() => {
    let alive = true
    fetch(`/api/career/moves?from=${encodeURIComponent(from)}&basis=${basis}&exclude=${encodeURIComponent(exclude)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (alive) { setMoves((d as { moves?: Move[] }).moves ?? []); setPage(0) } })
    return () => { alive = false }
  }, [from, basis, exclude])

  async function save() {
    if (steps.length === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/career/paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, basis, steps }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toastError('Could not save the path', (d as { error?: string }).error); return }
      toastSuccess('Career path saved')
      router.push(`/dashboard/career/paths/${(d as { path: { id: string } }).path.id}`)
    } finally { setSaving(false) }
  }

  const shown = (moves ?? []).slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)
  const pages = Math.ceil((moves?.length ?? 0) / PER_PAGE)
  const unit = basis === 'INTERESTS' ? 'skill interests' : 'skills'

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-5">
        <label className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <span className="text-xs font-semibold text-slate-700">Show next moves based on</span>
          <select value={basis} onChange={(e) => setBasis(e.target.value as 'INTERESTS' | 'SKILLS')}
            className="border border-slate-300 rounded px-2 py-1 text-sm bg-white">
            <option value="INTERESTS">Skill interests</option>
            <option value="SKILLS">Skills I have</option>
          </select>
        </label>

        <div className="flex flex-col items-center">
          <div className="bg-white border-2 border-slate-900 rounded-xl px-5 py-4 w-72 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800 bg-sky-50 inline-block px-1.5 rounded">
              {steps.length ? `Move ${steps.length}` : 'Current role'}
            </p>
            <p className="text-base font-semibold text-slate-900 mt-1">{from}</p>
            {steps.length > 0 && (
              <button type="button" onClick={() => setSteps(steps.slice(0, -1))}
                className="mt-2 text-sm font-medium text-slate-900 underline underline-offset-2">
                Remove from career path
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 my-2">Next moves</p>
        </div>

        {moves === null ? (
          <p className="text-sm text-slate-400 text-center">Loading…</p>
        ) : moves.length === 0 ? (
          <p className="text-sm text-slate-500 text-center">No further roles to suggest from here.</p>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous moves"
              className="w-9 h-9 rounded-full bg-white border border-slate-300 disabled:opacity-30 flex-shrink-0">‹</button>
            <div className="grid gap-3 md:grid-cols-3 flex-1">
              {shown.map((m) => (
                <div key={m.title} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col">
                  <p className="text-sm font-semibold text-slate-900 underline underline-offset-2">{m.title}</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    <li>Matches {m.matches} of your {unit}</li>
                    <li><strong>{m.openings}</strong> current {m.openings === 1 ? 'opening' : 'openings'} for this role</li>
                    {m.fit != null && <li>You hold {m.fit}% of what it asks for</li>}
                    {m.holders > 0 && <li>{m.holders} {m.holders === 1 ? 'person holds' : 'people hold'} it now</li>}
                  </ul>
                  <button type="button" onClick={() => setSteps([...steps, m.title])}
                    className="mt-auto pt-3 text-left text-sm font-medium text-slate-900 underline underline-offset-2">
                    Add to career path
                  </button>
                </div>
              ))}
            </div>
            <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="More moves"
              className="w-9 h-9 rounded-full bg-white border border-slate-300 disabled:opacity-30 flex-shrink-0">›</button>
          </div>
        )}
        {pages > 1 && <p className="text-center text-xs text-slate-500">Page {page + 1} of {pages}</p>}
      </div>

      <aside className="bg-white border border-slate-200 rounded-xl p-4 h-fit space-y-3">
        <ol className="space-y-2">
          <li className="text-xs">
            <p className="text-slate-500">Current role</p>
            <p className="font-medium text-slate-900 border border-slate-300 rounded px-2 py-1">{currentRole}</p>
          </li>
          {steps.map((s, i) => (
            <li key={`${s}-${i}`} className="text-xs">
              <p className="text-slate-500">Move {i + 1}</p>
              <p className="font-medium text-slate-900 border border-slate-300 rounded px-2 py-1">{s}</p>
            </li>
          ))}
          <li className="text-xs">
            <p className="text-slate-500">Next move</p>
            <p className="border border-dashed border-slate-300 rounded px-2 py-1 text-slate-400">Pick one on the left</p>
          </li>
        </ol>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600 mb-1">Name this path</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={save} disabled={saving || steps.length === 0}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40">
            {saving ? 'Saving…' : 'Save career path'}
          </button>
          <button type="button" onClick={() => router.push('/dashboard/career')}
            className="text-sm px-4 py-2 rounded-lg border border-slate-300">Cancel</button>
        </div>
      </aside>
    </div>
  )
}
