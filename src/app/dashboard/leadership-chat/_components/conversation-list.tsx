'use client'

import { getInitials } from '@/lib/utils'

export type Conversation = {
  partnerId: string
  partner: { id: string; fullName: string; designation: string | null; photoUrl: string | null } | null
  lastMessage: string
  lastSentAt: string
  lastSenderId: string
  unreadCount: number
}

interface Props {
  conversations: Conversation[]
  activePartnerId: string | null
  loading: boolean
  onSelect: (partnerId: string) => void
}

function relativeTime(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function ConversationList({ conversations, activePartnerId, loading, onSelect }: Props) {
  if (loading) {
    return <div className="p-4 text-xs text-slate-400">Loading…</div>
  }
  if (conversations.length === 0) {
    return (
      <div className="p-4 text-xs text-slate-400">
        No conversations yet. Click <span className="font-semibold">New chat</span> to start one.
      </div>
    )
  }
  return (
    <ul className="flex-1 overflow-y-auto">
      {conversations.map((c) => {
        const active = c.partnerId === activePartnerId
        const name = c.partner?.fullName ?? 'Unknown'
        return (
          <li key={c.partnerId}>
            <button
              onClick={() => onSelect(c.partnerId)}
              className={`w-full text-left px-3 py-2.5 border-b border-slate-200 transition-colors ${
                active ? 'bg-white' : 'hover:bg-white/60'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-full bg-slate-700 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
                  {getInitials(name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">{name}</p>
                    <span className="ml-auto text-[10px] text-slate-400">
                      {relativeTime(c.lastSentAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {c.lastMessage}
                  </p>
                  {c.unreadCount > 0 && (
                    <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-900 text-white">
                      {c.unreadCount} unread
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
