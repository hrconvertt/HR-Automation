'use client'

import { useEffect, useState, useCallback } from 'react'
import ConversationList, { type Conversation } from './conversation-list'
import ThreadView from './thread-view'
import NewChatDialog from './new-chat-dialog'

interface Props {
  myEmployeeId: string
  myName: string
  isHr: boolean
  initialPartnerId: string | null
}

export default function ChatShell({ myEmployeeId, myName, isHr, initialPartnerId }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activePartnerId, setActivePartnerId] = useState<string | null>(initialPartnerId)
  const [showNewChat, setShowNewChat] = useState(false)
  const [loadingConvos, setLoadingConvos] = useState(true)

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/leadership-chat/conversations', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setConversations(data.conversations ?? [])
    } finally {
      setLoadingConvos(false)
    }
  }, [])

  useEffect(() => {
    void refreshConversations()
    const id = setInterval(() => void refreshConversations(), 15000)
    return () => clearInterval(id)
  }, [refreshConversations])

  function handleStartChat(partnerId: string) {
    setActivePartnerId(partnerId)
    setShowNewChat(false)
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left pane — conversation list */}
      <aside className="w-72 border-r border-slate-200 flex flex-col min-h-0 bg-slate-50">
        <div className="p-3 border-b border-slate-200">
          <button
            onClick={() => setShowNewChat(true)}
            className="w-full px-3 py-2 text-xs font-semibold rounded-md bg-slate-900 text-white hover:bg-slate-800 transition-colors"
          >
            + New chat
          </button>
        </div>
        <ConversationList
          conversations={conversations}
          activePartnerId={activePartnerId}
          loading={loadingConvos}
          onSelect={(id) => setActivePartnerId(id)}
        />
      </aside>

      {/* Right pane — thread */}
      <section className="flex-1 flex flex-col min-h-0 min-w-0">
        {activePartnerId ? (
          <ThreadView
            key={activePartnerId}
            myEmployeeId={myEmployeeId}
            myName={myName}
            isHr={isHr}
            partnerId={activePartnerId}
            onMessageSent={refreshConversations}
            onMessageMutated={refreshConversations}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Select a conversation or start a new one.
          </div>
        )}
      </section>

      {showNewChat && (
        <NewChatDialog
          existingPartnerIds={conversations.map((c) => c.partnerId)}
          onClose={() => setShowNewChat(false)}
          onPick={handleStartChat}
        />
      )}
    </div>
  )
}
