'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, Send, AlertTriangle, MailCheck, Clock, Ban } from 'lucide-react'

type Send = {
  id: string
  templateId: string
  toEmail: string
  toEmployeeId: string | null
  toCandidateId: string | null
  subject: string
  body: string
  status: string
  eventName: string
  scheduledFor: string | null
  sentAt: string | null
  failedReason: string | null
  createdAt: string
  template?: { key: string; name: string | null; category: string | null } | null
}

type Status = 'DRAFT' | 'QUEUED' | 'SENT' | 'FAILED' | 'SUPPRESSED'

const TABS: Array<{ status: Status; label: string; icon: typeof Mail }> = [
  { status: 'DRAFT', label: 'Draft (HR review)', icon: Mail },
  { status: 'QUEUED', label: 'Queued', icon: Clock },
  { status: 'SENT', label: 'Sent', icon: MailCheck },
  { status: 'FAILED', label: 'Failed', icon: AlertTriangle },
  { status: 'SUPPRESSED', label: 'Suppressed', icon: Ban },
]

export default function EmailSendsClient({ counts }: { counts: Record<Status, number> }) {
  const [tab, setTab] = useState<Status>('DRAFT')
  const [rows, setRows] = useState<Send[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Send | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async (status: Status) => {
    setLoading(true)
    const r = await fetch(`/api/admin/email-queue?status=${status}`)
    const data = await r.json()
    setRows(data.sends || [])
    setLoading(false)
  }, [])

  useEffect(() => { load(tab) }, [tab, load])

  async function act(id: string, action: 'SEND' | 'RETRY' | 'SUPPRESS') {
    setActing(id)
    const r = await fetch(`/api/admin/email-queue/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setActing(null)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      alert(d.error || 'Action failed')
    }
    await load(tab)
    if (selected?.id === id) setSelected(null)
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 p-6 text-white shadow-md">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Email Sends Queue</h1>
            <p className="text-white/85 text-sm mt-1">Template-library driven email sends. Drafts wait for HR review; queued sends fire automatically.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map(({ status, label, icon: Icon }) => (
          <button
            key={status}
            onClick={() => setTab(status)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border ${tab === status ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
            <span className={`ml-1 text-[11px] font-mono ${tab === status ? 'text-white/80' : 'text-slate-500'}`}>{counts[status] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
        <Card className="p-3 max-h-[700px] overflow-y-auto">
          {loading ? (
            <p className="text-sm text-slate-500 p-4">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500 p-4">No emails in this state.</p>
          ) : (
            <ul className="space-y-1">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${selected?.id === r.id ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50 text-slate-700'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{r.subject}</span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">{r.template?.key || r.templateId.slice(0, 6)}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">→ {r.toEmail}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      event: {r.eventName} · {new Date(r.createdAt).toLocaleString('en-GB')}
                      {r.scheduledFor && ` · scheduled ${new Date(r.scheduledFor).toLocaleString('en-GB')}`}
                    </p>
                    {r.failedReason && <p className="text-[10px] text-red-600 mt-0.5 truncate">⚠ {r.failedReason}</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {selected ? (
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{selected.template?.category ?? 'Send'}</p>
                <p className="text-sm font-medium">{selected.template?.name ?? selected.template?.key ?? selected.templateId}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">To: {selected.toEmail}</p>
              </div>
              <div className="flex items-center gap-2">
                {(selected.status === 'DRAFT' || selected.status === 'QUEUED') && (
                  <Button size="sm" onClick={() => act(selected.id, 'SEND')} disabled={acting === selected.id}>
                    <Send className="w-4 h-4 mr-1.5" /> Send now
                  </Button>
                )}
                {selected.status === 'FAILED' && (
                  <Button size="sm" onClick={() => act(selected.id, 'RETRY')} disabled={acting === selected.id}>
                    <Send className="w-4 h-4 mr-1.5" /> Retry
                  </Button>
                )}
                {selected.status !== 'SENT' && selected.status !== 'SUPPRESSED' && (
                  <Button size="sm" variant="outline" onClick={() => act(selected.id, 'SUPPRESS')} disabled={acting === selected.id}>
                    Suppress
                  </Button>
                )}
              </div>
            </div>
            <div className="bg-slate-50 rounded p-3 mb-3">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Subject</p>
              <p className="text-sm">{selected.subject}</p>
            </div>
            <div className="bg-slate-50 rounded p-3">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Body</p>
              <pre className="text-sm whitespace-pre-wrap font-sans">{selected.body}</pre>
            </div>
            {selected.failedReason && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 mt-3">{selected.failedReason}</p>
            )}
          </Card>
        ) : (
          <Card className="p-5"><p className="text-sm text-slate-500">Select a send to preview.</p></Card>
        )}
      </div>
    </div>
  )
}
