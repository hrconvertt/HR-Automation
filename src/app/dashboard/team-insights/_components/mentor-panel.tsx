'use client'

/**
 * Suggested mentors, and the mentoring already under way.
 *
 * A mentor here is a colleague who holds one of the report's wanted skills at
 * Strong or "Can teach it". Suggesting one sends both people a note with the
 * manager's message — Workday's "share with a message" — and it stays
 * Suggested until someone marks it started.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { MENTORSHIP_STATUS_LABEL, skillLevelLabel, type MentorshipStatus } from '@/lib/talent-labels'
import type { MentorSuggestion, TalentProfile } from '@/lib/queries/team-insights'
import { getInitials } from '@/lib/utils'
import { inputCls, readError } from './format'

export function MentorPanel({ menteeId, firstName, suggestions, mentorships, canManage, hasInterests, viewerIsParty }: {
  menteeId: string
  firstName: string
  suggestions: MentorSuggestion[]
  mentorships: TalentProfile['mentorships']
  canManage: boolean
  hasInterests: boolean
  /** The viewer is the mentee, so they may mark their own mentoring started or ended. */
  viewerIsParty: boolean
}) {
  const router = useRouter()
  const [picked, setPicked] = useState<MentorSuggestion | null>(null)
  const [skillId, setSkillId] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  function open(s: MentorSuggestion) {
    setPicked(s)
    setSkillId(s.matched[0]?.skillId ?? '')
    const skill = s.matched[0]?.name ?? 'this'
    setMessage(`Hi ${firstName}, I think ${s.fullName.split(' ')[0]} could help you grow in ${skill}. Worth a conversation?`)
  }

  async function send() {
    if (!picked) return
    setBusy(true)
    try {
      const res = await fetch('/api/talent/mentorships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menteeId, mentorId: picked.id, skillId: skillId || undefined, message }),
      })
      if (!res.ok) { toastError('Could not send the suggestion', await readError(res)); return }
      toastSuccess(`${picked.fullName} suggested as a mentor — both have been told`)
      setPicked(null)
      router.refresh()
    } finally { setBusy(false) }
  }

  async function setStatus(id: string, status: MentorshipStatus) {
    setBusy(true)
    try {
      const res = await fetch(`/api/talent/mentorships/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) { toastError('Could not update the mentoring', await readError(res)); return }
      toastSuccess(status === 'ACTIVE' ? 'Mentoring marked as started' : 'Mentoring ended')
      router.refresh()
    } finally { setBusy(false) }
  }

  const current = mentorships.filter((m) => m.status !== 'ENDED')

  return (
    <div className="space-y-4">
      {current.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {current.map((m) => (
            <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm text-slate-900">
                  {m.role === 'MENTEE' ? 'Mentored by ' : 'Mentoring '}
                  <span className="font-medium">{m.other.fullName}</span>
                  {m.skillName && <span className="text-slate-500"> · {m.skillName}</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {MENTORSHIP_STATUS_LABEL[m.status as MentorshipStatus] ?? m.status} since {m.sinceLabel}
                </p>
              </div>
              {(canManage || viewerIsParty) && (
                <div className="flex gap-2">
                  {m.status === 'PROPOSED' && (
                    <button type="button" disabled={busy} onClick={() => setStatus(m.id, 'ACTIVE')}
                      className="text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-900 text-white disabled:opacity-40">
                      Mark as started
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => setStatus(m.id, 'ENDED')}
                    className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40">
                    End mentoring
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!hasInterests ? (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-5">
          Add a skill interest under Development &amp; Interests and colleagues who can teach it will be suggested here.
        </p>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-5">
          Nobody is recorded at Strong or above in {firstName}&apos;s wanted skills yet. Recording colleagues&apos;
          skills on the Skills page is what fills this in.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {suggestions.map((s) => (
            <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-semibold">
                  {getInitials(s.fullName)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{s.fullName}</p>
                  <p className="text-xs text-slate-500 truncate">{s.designation ?? '—'}</p>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-slate-600">
                {s.department && <li>{s.department}</li>}
                <li>In the company for {s.yearsInCompany < 1 ? 'under a year' : `${s.yearsInCompany}+ year${s.yearsInCompany === 1 ? '' : 's'}`}</li>
                <li>
                  Can help with:{' '}
                  <span className="text-slate-900">
                    {s.matched.map((m) => `${m.name} (${skillLevelLabel(m.level)})`).join(', ')}
                  </span>
                </li>
              </ul>
              {s.knowsAbout.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="text-xs text-slate-500 mr-1">Knows about:</span>
                  {s.knowsAbout.map((k) => (
                    <span key={k} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{k}</span>
                  ))}
                  {s.moreCount > 0 && <span className="text-[11px] text-slate-500">+{s.moreCount} more</span>}
                </div>
              )}
              {canManage && (
                <div className="mt-auto pt-3">
                  <button type="button" onClick={() => open(s)}
                    className="text-sm font-medium text-slate-900 underline underline-offset-2 hover:text-black">
                    Suggest as mentor
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!picked} onOpenChange={(o) => { if (!o) setPicked(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suggest {picked?.fullName} as a mentor</DialogTitle>
            <DialogDescription>
              {firstName} and {picked?.fullName.split(' ')[0]} both get a notification with your message.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {picked && picked.matched.length > 1 && (
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 mb-1">For</span>
                <select className={inputCls} value={skillId} onChange={(e) => setSkillId(e.target.value)}>
                  {picked.matched.map((m) => <option key={m.skillId} value={m.skillId}>{m.name}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Message for {firstName}</span>
              <textarea className={`${inputCls} min-h-[100px]`} value={message} onChange={(e) => setMessage(e.target.value)} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPicked(null)} disabled={busy}>Cancel</Button>
            <Button onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send suggestion'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
