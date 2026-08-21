'use client'

/**
 * The Events / Promotions / Promotion Events tab bar.
 *
 * These were three separate sidebar items; they are one section now, so the
 * three pages share this bar and the sidebar carries a single entry. Each page
 * keeps its own route and its own server data — the bar just links between them
 * and highlights where you are.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, TrendingUp, PartyPopper } from 'lucide-react'

const TABS = [
  { href: '/dashboard/culture/events', label: 'Events', icon: CalendarDays },
  { href: '/dashboard/culture/promotions', label: 'Promotions', icon: TrendingUp },
  { href: '/dashboard/culture/promotion-events', label: 'Promotion Events', icon: PartyPopper },
]

export function CultureTabs() {
  const pathname = usePathname()
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + '/')
        const Icon = t.icon
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {t.label}
          </Link>
        )
      })}
    </div>
  )
}
