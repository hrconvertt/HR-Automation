'use client'

import { useEffect, useMemo, useState } from 'react'
import { getInitials } from '@/lib/utils'

interface Partner {
  id: string
  fullName: string
  designation: string | null
  photoUrl: string | null
}

interface Props {
  existingPartnerIds: string[]
  onClose: () => void
  onPick: (partnerId: string) => void
}

export default function NewChatDialog({ existingPartnerIds, onClose, onPick }: Props) {
  const [partners, setPartners] = useState<Partner[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/leadership-chat/eligible-partners', { cache: 'no-store' })
        const data = await res.json()
        setPartners(data.partners ?? [])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return partners
    return partners.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        (p.designation && p.designation.toLowerCase().includes(q)),
    )
  }, [partners, query])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Start a new conversation</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm">
            Close
          </button>
        </div>
        <div className="px-4 py-3 border-b border-slate-200">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or title…"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-4 text-xs text-slate-400">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-xs text-slate-400">No matches.</p>
          ) : (
            <ul>
              {filtered.map((p) => {
                const isExisting = existingPartnerIds.includes(p.id)
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => onPick(p.id)}
                      className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 border-b border-slate-100"
                    >
                      <div className="w-9 h-9 rounded-full bg-slate-700 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
                        {getInitials(p.fullName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{p.fullName}</p>
                        <p className="text-xs text-slate-500 truncate">{p.designation ?? '—'}</p>
                      </div>
                      {isExisting && (
                        <span className="text-[10px] text-slate-400">existing</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
