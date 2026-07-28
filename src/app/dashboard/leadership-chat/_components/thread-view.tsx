'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getInitials } from '@/lib/utils'

interface Message {
  id: string
  senderId: string
  recipientId: string
  body: string
  sentAt: string
  readAt: string | null
  editedAt: string | null
  deletedAt: string | null
  // Optimistic-only — set when the message is from a pending send.
  _optimistic?: boolean
}

interface Partner {
  id: string
  fullName: string
  designation: string | null
  photoUrl: string | null
}

interface Props {
  myEmployeeId: string
  myName: string
  isHr: boolean
  partnerId: string
  onMessageSent: () => void
  onMessageMutated: () => void
}

const POLL_MS = 10_000

export default function ThreadView({
  myEmployeeId,
  partnerId,
  isHr,
  onMessageSent,
  onMessageMutated,
}: Props) {
  const [partner, setPartner] = useState<Partner | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchThread = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLoading(true)
        const res = await fetch(`/api/leadership-chat/threads/${partnerId}`, { cache: 'no-store' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data?.error ?? 'Failed to load thread')
          return
        }
        const data = await res.json()
        setPartner(data.partner)
        setMessages(data.messages ?? [])
        setError(null)
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [partnerId],
  )

  useEffect(() => {
    void fetchThread()
    const id = setInterval(() => void fetchThread(true), POLL_MS)
    return () => clearInterval(id)
  }, [fetchThread])

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function handleSend() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    const tempId = `tmp_${Date.now()}`
    const optimistic: Message = {
      id: tempId,
      senderId: myEmployeeId,
      recipientId: partnerId,
      body: text,
      sentAt: new Date().toISOString(),
      readAt: null,
      editedAt: null,
      deletedAt: null,
      _optimistic: true,
    }
    setMessages((prev) => [...prev, optimistic])
    setDraft('')
    try {
      const res = await fetch(`/api/leadership-chat/threads/${partnerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? 'Failed to send')
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        return
      }
      const data = await res.json()
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...data.message } : m)),
      )
      onMessageSent()
    } finally {
      setSending(false)
    }
  }

  async function handleDelete(msgId: string) {
    if (!confirm('Delete this message?')) return
    const res = await fetch(`/api/leadership-chat/messages/${msgId}`, { method: 'DELETE' })
    if (res.ok) {
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, body: '(deleted)', deletedAt: new Date().toISOString() } : m)),
      )
      onMessageMutated()
    }
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <>
      {/* Partner header */}
      <header className="border-b border-slate-200 px-6 py-3 flex items-center gap-3 bg-white">
        {partner ? (
          <>
            <div className="w-10 h-10 rounded-full bg-slate-700 text-white text-sm font-semibold flex items-center justify-center">
              {getInitials(partner.fullName)}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{partner.fullName}</p>
              <p className="text-xs text-slate-500">{partner.designation ?? '—'}</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">Loading…</p>
        )}
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-slate-50">
        {loading && messages.length === 0 ? (
          <p className="text-xs text-slate-400">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-slate-400">No messages yet — say hi.</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === myEmployeeId
            const isDeleted = !!m.deletedAt
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] group`}>
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                      mine
                        ? 'bg-slate-900 text-white rounded-br-sm'
                        : 'bg-slate-100 text-slate-900 rounded-bl-sm'
                    } ${isDeleted ? 'italic opacity-60' : ''}`}
                  >
                    {m.body}
                  </div>
                  <div
                    className={`mt-0.5 text-[10px] text-slate-400 flex items-center gap-1.5 ${
                      mine ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <span>{formatTime(m.sentAt)}</span>
                    {m.editedAt && !isDeleted && <span>· edited</span>}
                    {mine && !m._optimistic && m.readAt && !isDeleted && <span>· Read</span>}
                    {mine && m._optimistic && <span>· sending…</span>}
                    {(mine || isHr) && !isDeleted && !m._optimistic && (
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="opacity-0 group-hover:opacity-100 hover:text-slate-700 transition-opacity"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Composer */}
      <footer className="border-t border-slate-200 px-6 py-3 bg-white">
        {error && (
          <p className="mb-2 text-xs text-red-600">{error}</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSend()
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
            rows={1}
            maxLength={5000}
            placeholder="Type a message…"
            className="flex-1 resize-none px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="px-4 py-2 text-sm font-semibold rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </form>
      </footer>
    </>
  )
}
