'use client'

/**
 * Development & Interests — what they can do, what they want to do, and the
 * plan in between.
 *
 * Skills are the same records the Skills page keeps; a manager records their
 * report's here. Interests are separate on purpose: "wants Shopify" is not
 * "knows Shopify", and mentors are matched on the difference.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { SKILL_LEVELS, DEV_STATUSES, DEV_STATUS_LABEL, type DevStatus } from '@/lib/talent-labels'
import type { TalentProfile } from '@/lib/queries/team-insights'
import { inputCls, readError } from './format'

export function GrowthEditor({ employeeId, firstName, canEdit, skills, interests, development, knownSkills }: {
  employeeId: string
  firstName: string
  canEdit: boolean
  skills: TalentProfile['skills']
  interests: TalentProfile['interests']
  development: TalentProfile['development']
  knownSkills: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [skillForm, setSkillForm] = useState({ name: '', level: 3 })
  const [interest, setInterest] = useState('')
  const [dev, setDev] = useState({ title: '', skillId: '', dueDate: '', detail: '' })

  async function call(url: string, init: RequestInit, ok: string, fail: string): Promise<boolean> {
    setBusy(true)
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      if (!res.ok) { toastError(fail, await readError(res)); return false }
      toastSuccess(ok)
      router.refresh()
      return true
    } finally { setBusy(false) }
  }

  // Development items can be tied to anything they hold or want.
  const skillChoices = [
    ...interests.map((i) => ({ id: i.skillId, name: `${i.name} (interest)` })),
    ...skills.filter((s) => !interests.some((i) => i.skillId === s.skillId))
      .map((s) => ({ id: s.skillId, name: s.name })),
  ]

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {/* Skill interests */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-900">Skill interests · {interests.length}</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          What {firstName} wants to grow into. Mentor suggestions are matched against these.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {interests.length === 0 && <p className="text-xs text-slate-400">None recorded.</p>}
          {interests.map((i) => (
            <span key={i.id} className="inline-flex items-center gap-2 text-[12px] px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-800">
              {i.name}
              {canEdit && (
                <button type="button" disabled={busy}
                  onClick={() => call(`/api/talent/interests?id=${i.id}`, { method: 'DELETE' },
                    `${i.name} removed from interests`, 'Could not remove it')}
                  className="text-[11px] text-slate-500 underline hover:text-slate-900">
                  Remove
                </button>
              )}
            </span>
          ))}
        </div>
        {canEdit && (
          <div className="flex gap-2 mt-3">
            <input className={inputCls} value={interest} onChange={(e) => setInterest(e.target.value)}
              list="talent-known-skills" placeholder="e.g. People management, Shopify" />
            <button type="button" disabled={busy || !interest.trim()}
              onClick={async () => {
                if (await call('/api/talent/interests', {
                  method: 'POST', body: JSON.stringify({ employeeId, skillName: interest }),
                }, 'Interest added', 'Could not add the interest')) setInterest('')
              }}
              className="text-sm font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white whitespace-nowrap disabled:opacity-40">
              Add interest
            </button>
          </div>
        )}
      </section>

      {/* Skills held */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-900">Skills · {skills.length}</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          What {firstName} can do now, and how deep it goes. The same records as the Skills page.
        </p>
        {skills.length === 0 ? (
          <p className="text-xs text-slate-400 mt-3">None recorded.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {skills.map((s) => (
              <li key={s.id} className="py-1.5 flex items-center justify-between gap-2">
                <span className="text-sm text-slate-900 truncate">{s.name}</span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  {canEdit ? (
                    <select
                      value={s.level}
                      disabled={busy}
                      onChange={(e) => call('/api/skills', {
                        method: 'POST',
                        body: JSON.stringify({ employeeId, skillName: s.name, level: Number(e.target.value) }),
                      }, `${s.name} level updated`, 'Could not update the level')}
                      className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white"
                      aria-label={`Level for ${s.name}`}
                    >
                      {SKILL_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-600">{SKILL_LEVELS.find((l) => l.value === s.level)?.label}</span>
                  )}
                  {canEdit && (
                    <button type="button" disabled={busy}
                      onClick={() => call(`/api/skills?id=${s.id}`, { method: 'DELETE' },
                        `${s.name} removed`, 'Could not remove the skill')}
                      className="text-[11px] text-slate-500 underline hover:text-slate-900">
                      Remove
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="flex gap-2 mt-3">
            <input className={inputCls} value={skillForm.name}
              onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })}
              list="talent-known-skills" placeholder="Skill name" />
            <select className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
              value={skillForm.level} onChange={(e) => setSkillForm({ ...skillForm, level: Number(e.target.value) })}
              aria-label="Level">
              {SKILL_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <button type="button" disabled={busy || !skillForm.name.trim()}
              onClick={async () => {
                if (await call('/api/skills', {
                  method: 'POST',
                  body: JSON.stringify({ employeeId, skillName: skillForm.name, level: skillForm.level }),
                }, 'Skill recorded', 'Could not record the skill')) setSkillForm({ name: '', level: 3 })
              }}
              className="text-sm font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white whitespace-nowrap disabled:opacity-40">
              Add skill
            </button>
          </div>
        )}
      </section>

      {/* Development items */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 xl:col-span-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Development items · {development.filter((d) => d.status !== 'COMPLETED').length} open
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Concrete steps — a course, a stretch task, a week shadowing someone — with a date to hold them to.
        </p>

        {canEdit && (
          <div className="grid gap-2 md:grid-cols-[2fr_1.2fr_1fr_auto] mt-3 items-end">
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">What</span>
              <input className={inputCls} value={dev.title} onChange={(e) => setDev({ ...dev, title: e.target.value })}
                placeholder="e.g. Run the next client onboarding call" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Builds skill</span>
              <select className={inputCls} value={dev.skillId} onChange={(e) => setDev({ ...dev, skillId: e.target.value })}>
                <option value="">— none —</option>
                {skillChoices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Due</span>
              <input type="date" className={inputCls} value={dev.dueDate}
                onChange={(e) => setDev({ ...dev, dueDate: e.target.value })} />
            </label>
            <button type="button" disabled={busy || !dev.title.trim()}
              onClick={async () => {
                if (await call('/api/talent/development-items', {
                  method: 'POST',
                  body: JSON.stringify({ employeeId, ...dev }),
                }, 'Development item added', 'Could not add it')) setDev({ title: '', skillId: '', dueDate: '', detail: '' })
              }}
              className="text-sm font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white whitespace-nowrap disabled:opacity-40">
              Add development item
            </button>
          </div>
        )}

        {development.length === 0 ? (
          <p className="text-xs text-slate-400 mt-3">Nothing planned yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {development.map((d) => (
              <li key={d.id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className={`text-sm ${d.status === 'COMPLETED' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                    {d.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    {d.skillName ? `${d.skillName} · ` : ''}
                    {d.dueLabel ? `Due ${d.dueLabel}` : 'No due date'}
                    {d.overdue && <span className="ml-1.5 text-amber-800 font-medium">Overdue</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {canEdit ? (
                    <select
                      value={d.status}
                      disabled={busy}
                      onChange={(e) => call(`/api/talent/development-items/${d.id}`, {
                        method: 'PATCH', body: JSON.stringify({ status: e.target.value }),
                      }, `Marked ${DEV_STATUS_LABEL[e.target.value as DevStatus].toLowerCase()}`, 'Could not update it')}
                      className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white"
                      aria-label={`Status of ${d.title}`}
                    >
                      {DEV_STATUSES.map((s) => <option key={s} value={s}>{DEV_STATUS_LABEL[s]}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-600">{d.statusLabel}</span>
                  )}
                  {canEdit && (
                    <button type="button" disabled={busy}
                      onClick={() => call(`/api/talent/development-items/${d.id}`, { method: 'DELETE' },
                        'Development item deleted', 'Could not delete it')}
                      className="text-[11px] text-slate-500 underline hover:text-slate-900">
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <datalist id="talent-known-skills">
        {knownSkills.map((s) => <option key={s.id} value={s.name} />)}
      </datalist>
    </div>
  )
}
