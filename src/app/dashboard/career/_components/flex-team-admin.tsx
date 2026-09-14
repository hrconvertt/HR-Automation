'use client'

/** The host's controls on a flex team: people who asked to join, status, delete. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { FLEX_STATUSES, FLEX_STATUS_LABEL } from '@/lib/talent-labels'

export function FlexMemberActions({ teamId, memberId, status, name }: {
  teamId: string; memberId: string; status: string; name: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function set(next: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/career/flex-teams/${teamId}/members`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId, status: next }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toastError('Could not update it', (d as { error?: string }).error); return }
      toastSuccess(next === 'MEMBER' ? `${name} is on the team` : `${name} declined`)
      router.refresh()
    } finally { setBusy(false) }
  }
  return (
    <div className="flex gap-3">
      {status !== 'MEMBER' && (
        <button type="button" disabled={busy} onClick={() => set('MEMBER')}
          className="text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-900 text-white disabled:opacity-40">Accept onto team</button>
      )}
      {status !== 'DECLINED' && (
        <button type="button" disabled={busy} onClick={() => set('DECLINED')}
          className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40">
          {status === 'MEMBER' ? 'Remove from team' : 'Decline'}
        </button>
      )}
    </div>
  )
}

export function FlexOwnerControls({ teamId, status }: { teamId: string; status: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex gap-2 flex-wrap items-center">
      <label className="text-xs text-slate-600 flex items-center gap-2">
        Status
        <select value={status} disabled={busy}
          onChange={async (e) => {
            setBusy(true)
            try {
              const res = await fetch(`/api/career/flex-teams/${teamId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: e.target.value }),
              })
              if (!res.ok) { toastError('Could not change the status'); return }
              toastSuccess('Status updated')
              router.refresh()
            } finally { setBusy(false) }
          }}
          className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white">
          {FLEX_STATUSES.map((s) => <option key={s} value={s}>{FLEX_STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      <button type="button" disabled={busy}
        onClick={async () => {
          if (!confirm('Delete this flex team and everyone on it?')) return
          setBusy(true)
          try {
            const res = await fetch(`/api/career/flex-teams/${teamId}`, { method: 'DELETE' })
            if (!res.ok) { toastError('Could not delete it'); return }
            toastSuccess('Flex team deleted')
            router.push('/dashboard/career/flex-teams')
          } finally { setBusy(false) }
        }}
        className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40">Delete flex team</button>
    </div>
  )
}
