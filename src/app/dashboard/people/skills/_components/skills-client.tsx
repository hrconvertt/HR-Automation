'use client'

/**
 * Skills — who can cover what.
 *
 * Not a marketplace, a gig board or a competency framework. The question is
 * "who can cover Shopify while Rayyan is at the university", and that needs
 * names against a capability and a sense of how deep it goes.
 *
 * Depth matters more than presence: four people who are "aware" of a thing is
 * not cover, and the single-point-of-failure list at the top is the reason to
 * keep this at all.
 */
import { useState, useEffect, useCallback } from 'react'
import { Loader2, Plus, Trash2, AlertTriangle, Search } from 'lucide-react'

const LEVELS = [
  { value: 1, label: 'Aware', tone: 'bg-slate-100 text-slate-600 border-slate-200' },
  { value: 2, label: 'Working', tone: 'bg-sky-50 text-sky-800 border-sky-200' },
  { value: 3, label: 'Strong', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { value: 4, label: 'Can teach it', tone: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
]
const levelOf = (n: number) => LEVELS.find((l) => l.value === n) ?? LEVELS[0]

interface Holder {
  id: string
  level: number
  employee: { id: string; fullName: string; designation: string | null; status: string }
}
interface SkillRow {
  id: string
  name: string
  category: string | null
  holders: Holder[]
}
interface Person { id: string; fullName: string; designation: string | null }

export function SkillsClient({ people, canEdit }: { people: Person[]; canEdit: boolean }) {
  const [skills, setSkills] = useState<SkillRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ employeeId: '', skillName: '', category: '', level: 3 })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/skills')
      const d = await res.json()
      setSkills(d.skills ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function add() {
    if (!form.employeeId || !form.skillName.trim()) { setErr('Pick a person and name the skill.'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'Could not save.'); return }
      setForm({ employeeId: '', skillName: '', category: '', level: 3 })
      setAdding(false)
      await load()
    } finally { setSaving(false) }
  }

  async function remove(id: string) {
    setSaving(true)
    try {
      await fetch(`/api/skills?id=${id}`, { method: 'DELETE' })
      await load()
    } finally { setSaving(false) }
  }

  if (loading) {
    return <p className="text-sm text-slate-400 flex items-center gap-2">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
    </p>
  }

  const term = q.trim().toLowerCase()
  const shown = term
    ? skills.filter((s) =>
      s.name.toLowerCase().includes(term)
      || s.category?.toLowerCase().includes(term)
      || s.holders.some((h) => h.employee.fullName.toLowerCase().includes(term)))
    : skills

  // One person at Strong or above, or nobody at all — that is the list worth
  // looking at, and the reason this page exists.
  const thin = skills.filter((s) => s.holders.filter((h) => h.level >= 3).length <= 1)

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a skill, a category, or a person…"
            className="w-full text-sm rounded-lg border border-slate-200 pl-9 pr-3 py-1.5"
          />
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg bg-slate-900 text-white"
          >
            <Plus className="w-3.5 h-3.5" /> Record a skill
          </button>
        )}
      </div>

      {adding && canEdit && (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Person</span>
            <select
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-1.5 bg-white"
            >
              <option value="">— pick —</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Skill</span>
            <input
              value={form.skillName}
              onChange={(e) => setForm({ ...form, skillName: e.target.value })}
              placeholder="Shopify, Payroll, Meta Ads…"
              list="known-skills"
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-1.5"
            />
            <datalist id="known-skills">
              {skills.map((s) => <option key={s.id} value={s.name} />)}
            </datalist>
          </label>
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Category</span>
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="optional"
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-1.5"
            />
          </label>
          <div className="flex gap-2">
            <label className="block flex-1">
              <span className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Level</span>
              <select
                value={form.level}
                onChange={(e) => setForm({ ...form, level: Number(e.target.value) })}
                className="w-full text-sm rounded-lg border border-slate-200 px-3 py-1.5 bg-white"
              >
                {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={add}
              disabled={saving}
              className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-40 self-end"
            >
              Add
            </button>
          </div>
          {err && <p className="md:col-span-4 text-xs text-red-700">{err}</p>}
        </div>
      )}

      {thin.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Thin cover · {thin.length}
          </p>
          <p className="text-[11px] text-amber-800 mt-0.5">
            One person or nobody at Strong or above. If they are on leave, this is what waits.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {thin.map((s) => (
              <span key={s.id} className="text-[12px] px-2 py-1 rounded-md border border-amber-300 bg-white text-amber-900">
                {s.name}
                <span className="text-amber-600">
                  {' · '}{s.holders.filter((h) => h.level >= 3).map((h) => h.employee.fullName.split(' ')[0]).join(', ') || 'nobody'}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center text-sm text-slate-400">
          {skills.length === 0 ? 'No skills recorded yet.' : 'Nothing matches that.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {shown.map((s) => (
            <div key={s.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">{s.name}</h3>
                <p className="text-[11px] text-slate-400">
                  {s.category ?? 'uncategorised'} · {s.holders.length} {s.holders.length === 1 ? 'person' : 'people'}
                </p>
              </div>
              {s.holders.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-slate-400">Nobody recorded.</p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {s.holders.map((h) => {
                    const l = levelOf(h.level)
                    return (
                      <li key={h.id} className="px-4 py-2 flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block text-[13px] text-slate-900 truncate">{h.employee.fullName}</span>
                          <span className="block text-[11px] text-slate-400 truncate">{h.employee.designation ?? '—'}</span>
                        </span>
                        <span className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${l.tone}`}>
                            {l.label}
                          </span>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => remove(h.id)}
                              disabled={saving}
                              className="text-slate-300 hover:text-red-700 disabled:opacity-40"
                              title="Remove"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
