'use client'

/**
 * Step 4 · Team Members. The hiring manager and interviewers for this job.
 * Each person is told when they are added.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getInitials } from '@/lib/utils'
import { safeFetch } from '@/lib/safe-fetch'
import type { EditorMember, EditorPerson } from './types'

interface Props {
  jobId: string
  members: EditorMember[]
  requester: EditorPerson | null
  employees: EditorPerson[]
  canEdit: boolean
}

const ROLES = [
  { value: 'HIRING_MANAGER', label: 'Hiring manager' },
  { value: 'INTERVIEWER', label: 'Interviewer' },
]

const selectCls = 'h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-800 disabled:bg-slate-50'

function Avatar({ name }: { name: string }) {
  return (
    <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold flex items-center justify-center shrink-0">
      {getInitials(name)}
    </span>
  )
}

export function StepTeam({ jobId, members, requester, employees, canEdit }: Props) {
  const router = useRouter()
  const [employeeId, setEmployeeId] = useState('')
  const [role, setRole] = useState('INTERVIEWER')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const onTeam = new Set(members.map((m) => m.employeeId))
  const available = employees.filter((e) => !onTeam.has(e.id))

  async function call(init: RequestInit, query = '') {
    setError('')
    setBusy(true)
    const r = await safeFetch(`/api/recruiting/requisitions/${jobId}/members${query}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
    setBusy(false)
    if (!r.ok) { setError(r.error ?? 'Could not change the team.'); return false }
    router.refresh()
    return true
  }

  async function add() {
    if (!employeeId) { setError('Pick someone to add.'); return }
    if (await call({ method: 'POST', body: JSON.stringify({ employeeId, role }) })) {
      setEmployeeId('')
      setRole('INTERVIEWER')
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <h3 className="px-5 py-3.5 text-base font-semibold text-slate-900 border-b border-slate-100 bg-slate-50/70">Team members</h3>

        <div className="divide-y divide-slate-100">
          <div className="flex items-center gap-3 px-5 py-3">
            <span className="w-8 h-8 rounded-full bg-slate-900 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">HR</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">HR team</p>
              <p className="text-xs text-slate-500">Every HR admin works on every job.</p>
            </div>
          </div>

          {requester && (
            <div className="flex items-center gap-3 px-5 py-3">
              <Avatar name={requester.name} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{requester.name}</p>
                <p className="text-xs text-slate-500">{requester.designation}</p>
              </div>
              <span className="text-xs text-slate-500">Raised this request</span>
            </div>
          )}

          {members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <Avatar name={m.name} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{m.name}</p>
                <p className="text-xs text-slate-500">{m.designation}</p>
              </div>
              <select
                value={m.role}
                disabled={!canEdit || busy}
                aria-label={`Role for ${m.name}`}
                onChange={(e) => call({ method: 'POST', body: JSON.stringify({ employeeId: m.employeeId, role: e.target.value }) })}
                className={selectCls}
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {canEdit && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => call({ method: 'DELETE' }, `?memberId=${encodeURIComponent(m.id)}`)}
                  className="text-xs text-slate-500 hover:text-red-700"
                >
                  Remove from team
                </button>
              )}
            </div>
          ))}
        </div>

        {canEdit && (
          <div className="border-t border-slate-100 px-5 py-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Other members</p>
            <p className="text-sm text-slate-500">Add the people hiring for this job. They are told when they are added.</p>
            <div className="flex flex-wrap items-center gap-2">
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} aria-label="Team member"
                className={`${selectCls} min-w-[240px]`}>
                <option value="">Select a team member</option>
                {available.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}{e.designation ? ` — ${e.designation}` : ''}</option>
                ))}
              </select>
              <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role on the team" className={selectCls}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <Button size="sm" onClick={add} disabled={busy || !employeeId}>Add to team</Button>
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
          </div>
        )}
      </section>
    </div>
  )
}
