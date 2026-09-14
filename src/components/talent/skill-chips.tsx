'use client'

/**
 * A person's skills as chips; a chip opens its panel — Workday's skill
 * drawer: the score out of five with what it means, the self rating, the
 * ratings from others, external evidence and the breakdown, and, for anyone
 * entitled to, "Rate this skill".
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { RATING_SOURCE_LABEL, skillLevelLabel, type RatingSource } from '@/lib/talent-labels'

export interface SkillChip {
  skillId: string
  name: string
  level: number
  average: number | null
}

interface PanelData {
  skill: { id: string; name: string }
  recordedLevel: number | null
  average: number | null
  band: { label: string; blurb: string } | null
  self: { rating: number; note: string | null; updatedAt: string } | null
  others: { id: string; source: RatingSource; rating: number; note: string | null; updatedAt: string; raterName: string }[]
  breakdown: { rating: number; count: number }[]
  external: { id: string; name: string; issuedBy: string; issuedDate: string; expiryDate: string | null }[]
  canRate: boolean
  raterSource: RatingSource | null
  myRating: number | null
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function SkillChips({ employeeId, skills }: { employeeId: string; skills: SkillChip[] }) {
  const [open, setOpen] = useState<SkillChip | null>(null)
  if (skills.length === 0) return <p className="text-sm text-slate-400">No skills recorded yet.</p>
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {skills.map((s) => (
          <button
            key={s.skillId}
            type="button"
            onClick={() => setOpen(s)}
            title={`Open ${s.name}: ratings and evidence`}
            className="text-[12px] px-2.5 py-1 rounded-full border border-slate-400 text-slate-800 hover:bg-slate-50"
          >
            {s.name}
            {s.average != null && <span className="text-slate-500"> · {s.average.toFixed(1)}</span>}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">Select a skill to see its ratings.</p>
      {open && <SkillPanel key={open.skillId} employeeId={employeeId} chip={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function SkillPanel({ employeeId, chip, onClose }: { employeeId: string; chip: SkillChip; onClose: () => void }) {
  const router = useRouter()
  const [data, setData] = useState<PanelData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [rating, setRating] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [openSection, setOpenSection] = useState<'self' | 'others' | 'external' | null>('others')

  useEffect(() => {
    let alive = true
    fetch(`/api/talent/skill-ratings?employeeId=${employeeId}&skillId=${chip.skillId}`, { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!alive) return
        if (!r.ok) setError((d as { error?: string }).error ?? 'Could not load the ratings.')
        else setData(d as PanelData)
      })
    return () => { alive = false }
  }, [employeeId, chip.skillId, reload])

  async function save() {
    if (!rating) return
    setSaving(true)
    try {
      const res = await fetch('/api/talent/skill-ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, skillId: chip.skillId, rating, note }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toastError('Could not save the rating', (d as { error?: string }).error); return }
      toastSuccess(`Rating saved for ${chip.name}`)
      setRating(null)
      setNote('')
      setReload((n) => n + 1)
      router.refresh()
    } finally { setSaving(false) }
  }

  const avg = data?.average ?? null
  const R = 34
  const C = 2 * Math.PI * R
  const maxCount = Math.max(1, ...(data?.breakdown.map((b) => b.count) ?? [1]))

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside
        className="w-full max-w-md h-full bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        aria-label={`${chip.name} ratings`}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">{chip.name}</h2>
          <button type="button" onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">
            Close
          </button>
        </div>

        {error ? (
          <p className="px-5 py-6 text-sm text-slate-500">{error}</p>
        ) : !data ? (
          <p className="px-5 py-6 text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="px-5 py-4 space-y-5">
            <div className="flex items-center gap-4">
              <svg width="88" height="88" viewBox="0 0 88 88" role="img"
                aria-label={avg != null ? `${avg} out of 5` : 'Not rated yet'}>
                <circle cx="44" cy="44" r={R} fill="none" stroke="#e2e8f0" strokeWidth="8" />
                {avg != null && (
                  <circle cx="44" cy="44" r={R} fill="none" stroke="#15803d" strokeWidth="8"
                    strokeDasharray={`${(avg / 5) * C} ${C}`} transform="rotate(-90 44 44)" strokeLinecap="round" />
                )}
                <text x="44" y="42" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 20, fontWeight: 700 }}>
                  {avg != null ? avg.toFixed(1) : '—'}
                </text>
                <text x="44" y="58" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10 }}>out of 5</text>
              </svg>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-slate-900">{data.band?.label ?? 'Not rated yet'}</p>
                <p className="text-xs text-slate-600">
                  {data.band?.blurb ?? 'Nobody has rated this skill yet. The recorded level is below.'}
                </p>
                {data.recordedLevel && (
                  <p className="text-[11px] text-slate-500 mt-1">Recorded level: {skillLevelLabel(data.recordedLevel)}</p>
                )}
              </div>
            </div>

            <Section title="Self rating" open={openSection === 'self'} onToggle={() => setOpenSection(openSection === 'self' ? null : 'self')}>
              {data.self ? (
                <p className="text-sm text-slate-800">
                  {data.self.rating} out of 5 <span className="text-slate-400">· {day(data.self.updatedAt)}</span>
                  {data.self.note && <span className="block text-xs text-slate-600 mt-0.5">{data.self.note}</span>}
                </p>
              ) : <p className="text-sm text-slate-400">Not rated by them yet.</p>}
            </Section>

            <Section title={`Ratings from others · ${data.others.length}`} open={openSection === 'others'}
              onToggle={() => setOpenSection(openSection === 'others' ? null : 'others')}>
              {data.others.length === 0 ? (
                <p className="text-sm text-slate-400">No one else has rated it yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data.others.map((o) => (
                    <li key={o.id} className="text-sm text-slate-800">
                      <span className="font-medium">{o.raterName}</span>
                      <span className="text-slate-500"> · {RATING_SOURCE_LABEL[o.source]}</span>
                      <span className="float-right tabular-nums">{o.rating}/5</span>
                      {o.note && <span className="block text-xs text-slate-600">{o.note}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={`External sources · ${data.external.length}`} open={openSection === 'external'}
              onToggle={() => setOpenSection(openSection === 'external' ? null : 'external')}>
              {data.external.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No certificate on record that names this skill. Certificates are recorded under Learning → Certifications.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {data.external.map((c) => (
                    <li key={c.id} className="text-sm text-slate-800">
                      {c.name} <span className="text-slate-500">· {c.issuedBy} · {day(c.issuedDate)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Skill level breakdown</p>
              <ul className="space-y-1">
                {[...data.breakdown].reverse().map((b) => (
                  <li key={b.rating} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="w-8 tabular-nums">{b.rating}/5</span>
                    <span className="flex-1 h-2 rounded bg-slate-100 overflow-hidden">
                      <span className="block h-full bg-emerald-700" style={{ width: `${(b.count / maxCount) * 100}%` }} />
                    </span>
                    <span className="w-5 text-right tabular-nums">{b.count}</span>
                  </li>
                ))}
              </ul>
            </div>

            {data.canRate && data.raterSource && (
              <div className="border-t border-slate-100 pt-4">
                <p className="text-sm font-semibold text-slate-900">
                  Rate this skill <span className="font-normal text-slate-500">as {RATING_SOURCE_LABEL[data.raterSource].toLowerCase()}</span>
                </p>
                {data.myRating && <p className="text-xs text-slate-500">Your current rating: {data.myRating}/5. Saving replaces it.</p>}
                <div className="flex gap-1.5 mt-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setRating(n)}
                      className={`w-10 h-9 rounded-lg border text-sm font-semibold ${rating === n ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 text-slate-800 hover:bg-slate-50'}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the rating is based on (optional)"
                  className="w-full mt-2 border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[60px]" />
                <button type="button" onClick={save} disabled={!rating || saving}
                  className="mt-2 text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40">
                  {saving ? 'Saving…' : 'Save rating'}
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

function Section({ title, open, onToggle, children }: {
  title: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="border-t border-slate-100 pt-3">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full flex items-center justify-between text-sm font-semibold text-slate-900">
        {title}
        <span className="text-xs font-normal text-slate-500 underline">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}
