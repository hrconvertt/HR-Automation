'use client'

/** The small labelled actions on Career Hub cards. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'

function useCall() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function call(url: string, init: RequestInit, ok: string, fail: string) {
    setBusy(true)
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toastError(fail, (d as { error?: string }).error); return false }
      toastSuccess(ok)
      router.refresh()
      return true
    } finally { setBusy(false) }
  }
  return { busy, call }
}

const link = 'text-sm font-medium text-slate-900 underline underline-offset-2 hover:text-black disabled:opacity-40'

export function DismissSuggestion({ id }: { id: string }) {
  const { busy, call } = useCall()
  return (
    <button type="button" disabled={busy} className={link}
      onClick={() => call(`/api/career/suggestions/${id}`, { method: 'PATCH', body: JSON.stringify({ dismissed: true }) },
        'Removed from your suggestions', 'Could not remove it')}>
      Dismiss
    </button>
  )
}

export function MentorDecision({ id }: { id: string }) {
  const { busy, call } = useCall()
  return (
    <div className="flex gap-4">
      <button type="button" disabled={busy} className={link}
        onClick={() => call(`/api/talent/mentorships/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }) },
          'Mentoring marked as started', 'Could not update it')}>
        We have started
      </button>
      <button type="button" disabled={busy} className={link}
        onClick={() => call(`/api/talent/mentorships/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'ENDED' }) },
          'Suggestion declined', 'Could not update it')}>
        Decline
      </button>
    </div>
  )
}

export function FlexInterestButton({ teamId, status, open }: { teamId: string; status: string | null; open: boolean }) {
  const { busy, call } = useCall()
  if (status === 'MEMBER') return <span className="text-sm text-emerald-800 font-medium">You are on this team</span>
  if (status === 'DECLINED') return <span className="text-sm text-slate-500">Not this time</span>
  if (status === 'INTERESTED') {
    return (
      <button type="button" disabled={busy} className={link}
        onClick={() => call(`/api/career/flex-teams/${teamId}/members`, { method: 'DELETE' }, 'Interest withdrawn', 'Could not withdraw')}>
        Withdraw interest
      </button>
    )
  }
  if (!open) return <span className="text-sm text-slate-500">Not taking people</span>
  return (
    <button type="button" disabled={busy} className={link}
      onClick={() => call(`/api/career/flex-teams/${teamId}/members`, { method: 'POST' }, 'Interest sent — the host has been told', 'Could not send it')}>
      Express interest
    </button>
  )
}

/** Close a skill gap from a career path: plan it, or mark it as something you want. */
export function GapActions({ employeeId, skillId, skillName, planned, wanted }: {
  employeeId: string; skillId: string; skillName: string; planned: boolean; wanted: boolean
}) {
  const { busy, call } = useCall()
  return (
    <div className="flex gap-4 flex-wrap">
      {planned ? <span className="text-xs text-slate-500">On your development plan</span> : (
        <button type="button" disabled={busy} className={link}
          onClick={() => call('/api/talent/development-items', {
            method: 'POST', body: JSON.stringify({ employeeId, title: `Build ${skillName}`, skillId }),
          }, `${skillName} added to your development plan`, 'Could not add it')}>
          Add as development item
        </button>
      )}
      {wanted ? <span className="text-xs text-slate-500">In your skill interests</span> : (
        <button type="button" disabled={busy} className={link}
          onClick={() => call('/api/talent/interests', {
            method: 'POST', body: JSON.stringify({ employeeId, skillName }),
          }, `${skillName} added to your interests`, 'Could not add it')}>
          Add to interests
        </button>
      )}
    </div>
  )
}

export function DeletePath({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button type="button" disabled={busy}
      className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40"
      onClick={async () => {
        if (!confirm('Delete this career path?')) return
        setBusy(true)
        try {
          const res = await fetch(`/api/career/paths/${id}`, { method: 'DELETE' })
          if (!res.ok) { toastError('Could not delete it'); return }
          toastSuccess('Career path deleted')
          router.push('/dashboard/career')
        } finally { setBusy(false) }
      }}>
      Delete path
    </button>
  )
}
