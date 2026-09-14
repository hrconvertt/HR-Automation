'use client'

/**
 * Job profiles — what each role asks for. Pick a role, then add the skills
 * it needs and how deep. The skill-gap chart, the Path Builder's next moves
 * and Compare Candidates all read from this.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { SKILL_LEVELS } from '@/lib/talent-labels'

export interface RoleRow {
  title: string
  holders: number
  skills: { id: string; name: string; level: number }[]
}

async function readError(res: Response) {
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Something went wrong.'
}

export function JobProfilesEditor({ roles, knownSkills, canEdit }: {
  roles: RoleRow[]
  knownSkills: string[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [role, setRole] = useState(roles.find((r) => r.skills.length === 0)?.title ?? roles[0]?.title ?? '')
  const [newRole, setNewRole] = useState('')
  const [skill, setSkill] = useState('')
  const [level, setLevel] = useState(3)
  const [busy, setBusy] = useState(false)

  const current = roles.find((r) => r.title === role)
  const title = newRole.trim() || role

  async function call(url: string, init: RequestInit, ok: string) {
    setBusy(true)
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      if (!res.ok) { toastError('Could not save the job profile', await readError(res)); return false }
      toastSuccess(ok)
      router.refresh()
      return true
    } finally { setBusy(false) }
  }

  const defined = roles.filter((r) => r.skills.length > 0).length

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Job profiles · {defined} of {roles.length} roles defined</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            The skills each role asks for. Anyone in a role with no profile is left out of the gap chart rather than guessed at.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="block text-xs font-medium text-slate-600 mb-1">Role</span>
          <select value={role} onChange={(e) => { setRole(e.target.value); setNewRole('') }}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white">
            {roles.map((r) => (
              <option key={r.title} value={r.title}>
                {r.title} · {r.holders} {r.holders === 1 ? 'person' : 'people'}{r.skills.length ? ` · ${r.skills.length} skills` : ' · no profile'}
              </option>
            ))}
          </select>
        </label>
        {canEdit && (
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Or a role nobody holds yet</span>
            <input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="e.g. Head of Growth"
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
          </label>
        )}
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">{title || 'Pick a role'} asks for</p>
        {newRole.trim() || !current || current.skills.length === 0 ? (
          <p className="text-xs text-slate-400">No skills on this profile yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {current.skills.map((s) => (
              <li key={s.id} className="py-1.5 flex items-center justify-between gap-2">
                <span className="text-sm text-slate-900">{s.name}</span>
                <span className="flex items-center gap-2">
                  {canEdit ? (
                    <select value={s.level} disabled={busy} aria-label={`Level for ${s.name}`}
                      onChange={(e) => call('/api/talent/role-skills', {
                        method: 'POST', body: JSON.stringify({ roleTitle: current.title, skillName: s.name, level: Number(e.target.value) }),
                      }, `${s.name} updated`)}
                      className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white">
                      {SKILL_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-600">{SKILL_LEVELS.find((l) => l.value === s.level)?.label}</span>
                  )}
                  {canEdit && (
                    <button type="button" disabled={busy}
                      onClick={() => call(`/api/talent/role-skills?id=${s.id}`, { method: 'DELETE' }, `${s.name} removed`)}
                      className="text-[11px] text-slate-500 underline hover:text-slate-900">Remove</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit && title && (
        <div className="flex gap-2 flex-wrap items-end border-t border-slate-100 pt-3">
          <label className="block flex-1 min-w-[180px]">
            <span className="block text-xs font-medium text-slate-600 mb-1">Skill</span>
            <input value={skill} onChange={(e) => setSkill(e.target.value)} list="profile-known-skills"
              placeholder="e.g. Shopify" className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Required level</span>
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
              {SKILL_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
          <button type="button" disabled={busy || !skill.trim()}
            onClick={async () => {
              if (await call('/api/talent/role-skills', {
                method: 'POST', body: JSON.stringify({ roleTitle: title, skillName: skill, level }),
              }, `Added to ${title}`)) { setSkill(''); if (newRole.trim()) { setRole(newRole.trim()); setNewRole('') } }
            }}
            className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-40">
            Add requirement
          </button>
          <datalist id="profile-known-skills">
            {knownSkills.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
      )}
    </div>
  )
}
