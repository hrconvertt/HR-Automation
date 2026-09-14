'use client'

/** Replying on a case, and — for HR — moving it along. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { CASE_STATUSES, CASE_TYPES, CASE_PRIORITIES } from '@/lib/help-center'

const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white'

async function send(url: string, method: string, body: object) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await res.json().catch(() => ({}))
  return { ok: res.ok, error: (d as { error?: string }).error }
}

export function ReplyBox({ caseId, agent, closed }: { caseId: string; agent: boolean; closed: boolean }) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
      <label className="block">
        <span className="block text-sm font-semibold text-slate-900 mb-1">{internal ? 'Internal note' : 'Reply'}</span>
        <textarea className={`${input} min-h-[100px]`} value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder={closed ? 'Replying reopens nothing — reopen the case first if it needs more work.' : internal ? 'Only HR sees internal notes.' : 'Write a reply'} />
      </label>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {agent ? (
          <label className="text-sm text-slate-700 flex items-center gap-2">
            <input type="checkbox" className="accent-slate-900" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
            Internal note (not shown to the employee)
          </label>
        ) : <span />}
        <button type="button" disabled={busy || !message.trim()}
          onClick={async () => {
            setBusy(true)
            try {
              const r = await send(`/api/help/cases/${caseId}/replies`, 'POST', { message, internal })
              if (!r.ok) { toastError('Could not send the reply', r.error); return }
              toastSuccess(internal ? 'Internal note added' : 'Reply sent')
              setMessage('')
              router.refresh()
            } finally { setBusy(false) }
          }}
          className="text-sm font-semibold px-5 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40">
          {busy ? 'Sending…' : internal ? 'Add internal note' : 'Send reply'}
        </button>
      </div>
    </div>
  )
}

export function RequesterControls({ caseId, status }: { caseId: string; status: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const done = ['RESOLVED', 'CLOSED'].includes(status)
  async function set(next: string, ok: string) {
    setBusy(true)
    try {
      const r = await send(`/api/help/cases/${caseId}`, 'PATCH', { status: next })
      if (!r.ok) { toastError('Could not update the case', r.error); return }
      toastSuccess(ok)
      router.refresh()
    } finally { setBusy(false) }
  }
  return done ? (
    <button type="button" disabled={busy} onClick={() => set('OPEN', 'Case reopened')}
      className="text-sm px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40">Reopen case</button>
  ) : (
    <button type="button" disabled={busy} onClick={() => set('CLOSED', 'Case closed')}
      className="text-sm px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40">Close case — I no longer need help</button>
  )
}

export function AgentPanel({ caseId, status, assignedToId, resolution, priority, type, agents }: {
  caseId: string
  status: string
  assignedToId: string | null
  resolution: string | null
  priority: string
  type: string
  agents: { userId: string; name: string }[]
}) {
  const router = useRouter()
  const [f, setF] = useState({ status, assignedToId: assignedToId ?? '', resolution: resolution ?? '', priority, type })
  const [busy, setBusy] = useState(false)
  const changed = f.status !== status || f.assignedToId !== (assignedToId ?? '') || f.resolution !== (resolution ?? '') || f.priority !== priority || f.type !== type
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-900">Work this case</p>
      <label className="block">
        <span className="block text-xs font-medium text-slate-600 mb-1">Status</span>
        <select className={input} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          {CASE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-slate-600 mb-1">Assigned to</span>
        <select className={input} value={f.assignedToId} onChange={(e) => setF({ ...f, assignedToId: e.target.value })}>
          <option value="">Nobody yet</option>
          {agents.map((a) => <option key={a.userId} value={a.userId}>{a.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-slate-600 mb-1">Case type (routes it)</span>
        <select className={input} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          {CASE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-slate-600 mb-1">Priority</span>
        <select className={input} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
          {CASE_PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-slate-600 mb-1">Resolution (sent to the employee when resolved)</span>
        <textarea className={`${input} min-h-[80px]`} value={f.resolution} onChange={(e) => setF({ ...f, resolution: e.target.value })} />
      </label>
      <button type="button" disabled={busy || !changed}
        onClick={async () => {
          setBusy(true)
          try {
            const body: Record<string, unknown> = {}
            if (f.status !== status) body.status = f.status
            if (f.assignedToId !== (assignedToId ?? '')) body.assignedToId = f.assignedToId || null
            if (f.resolution !== (resolution ?? '')) body.resolution = f.resolution
            if (f.priority !== priority) body.priority = f.priority
            if (f.type !== type) body.type = f.type
            const r = await send(`/api/help/cases/${caseId}`, 'PATCH', body)
            if (!r.ok) { toastError('Could not update the case', r.error); return }
            toastSuccess('Case updated')
            router.refresh()
          } finally { setBusy(false) }
        }}
        className="w-full text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40">
        Save changes
      </button>
    </div>
  )
}
