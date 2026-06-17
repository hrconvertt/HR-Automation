'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Bell, CheckCheck } from 'lucide-react'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  link: string | null
  createdAt: string
}

const POLL_INTERVAL_MS = 30_000

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function NotificationsBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=10')
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications ?? [])
      setUnreadCount(data.unreadCount ?? 0)
    } catch {
      // swallow — don't disturb the UI
    }
  }, [])

  useEffect(() => {
    fetchData()
    const t = setInterval(fetchData, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [fetchData])

  // Refetch when dropdown opens
  useEffect(() => {
    if (open) fetchData()
  }, [open, fetchData])

  async function markOneRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' })
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    setUnreadCount(0)
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="relative p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 rounded-full bg-slate-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="w-[360px] max-w-[95vw] bg-white border border-gray-200 rounded-xl shadow-xl py-1 z-50 max-h-[480px] overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <p className="text-sm font-semibold text-gray-900">Notifications</p>
              {unreadCount > 0 && (
                <p className="text-xs text-gray-500">{unreadCount} unread</p>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-medium text-slate-700 hover:text-slate-700 inline-flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">You&apos;re all caught up.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <DropdownMenu.Item key={n.id} asChild>
                  {n.link ? (
                    <Link
                      href={n.link}
                      onClick={() => markOneRead(n.id)}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-l-2 cursor-pointer outline-none ${
                        n.isRead ? 'border-transparent' : 'border-slate-500 bg-slate-50/40'
                      }`}
                    >
                      <NotificationContent n={n} />
                    </Link>
                  ) : (
                    <div
                      onClick={() => markOneRead(n.id)}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-l-2 cursor-pointer outline-none ${
                        n.isRead ? 'border-transparent' : 'border-slate-500 bg-slate-50/40'
                      }`}
                    >
                      <NotificationContent n={n} />
                    </div>
                  )}
                </DropdownMenu.Item>
              ))
            )}
          </div>

          <div className="border-t border-gray-100 px-4 py-2 text-center">
            <p className="text-[11px] text-gray-400">Notifications refresh automatically every 30 seconds</p>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function NotificationContent({ n }: { n: Notification }) {
  return (
    <>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${n.isRead ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>{n.title}</p>
        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.message}</p>
        <p className="text-[11px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
      </div>
      {!n.isRead && (
        <span className="w-2 h-2 rounded-full bg-slate-500 flex-shrink-0 mt-2" />
      )}
    </>
  )
}
