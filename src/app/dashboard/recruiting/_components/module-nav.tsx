'use client'

/**
 * Recruiting module sidebar — Workday-style.
 *
 * The module's views used to be a row of horizontal tabs above the content.
 * They now live in a sidebar inside the module: each entry loads its own view
 * in the same Recruiting shell (the page reads `?tab=`), so the module header,
 * KPIs and pipeline health stay put while only the working area changes.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Inbox, Briefcase, KanbanSquare, Filter, Users, CalendarClock, FileSignature, FilePlus2,
} from 'lucide-react'

export interface ModuleNavCounts {
  requests?: number
  knockouts?: number
  pool?: number
}

const ITEMS = [
  // One entry, because it is one record. A request becomes a requisition when
  // its status flips; nothing else about it changes, and keeping two menu
  // entries meant checking two screens to know what hiring was in flight.
  { tab: 'requisitions', label: 'Requisitions', icon: Briefcase, count: 'requests' as const, hint: 'Awaiting approval first' },
  { tab: 'pipeline', label: 'Pipeline', icon: KanbanSquare, hint: 'Candidates by stage' },
  { tab: 'knockouts', label: 'Knockouts', icon: Filter, count: 'knockouts' as const, hint: 'Filtered out' },
  { tab: 'pool', label: 'Talent Pool', icon: Users, count: 'pool' as const, hint: 'Silver medalists' },
  { tab: 'schedule', label: 'My Schedule', icon: CalendarClock, hint: 'Your interviews' },
]

export function RecruitingModuleNav({ active, counts = {}, canSeeKnockouts = true }: {
  /**
   * The view currently rendered. Passed down from the page rather than read
   * with `useSearchParams`: per the Next docs, a Client Component calling
   * `useSearchParams` on a prerendered route needs a `<Suspense>` boundary or
   * the production build fails. Taking it as a prop avoids that entirely and
   * guarantees the highlight matches what the page actually renders, instead of
   * duplicating the page's default-tab logic here.
   */
  active: string
  counts?: ModuleNavCounts
  canSeeKnockouts?: boolean
}) {
  const pathname = usePathname()
  const onOffers = pathname.endsWith('/offers')
  const onNewJd = pathname.endsWith('/new-jd')

  const items = ITEMS.filter((i) => (i.tab === 'knockouts' ? canSeeKnockouts : true))

  return (
    <nav className="lg:w-56 shrink-0" aria-label="Recruiting views">
      <ul className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
        {items.map((item) => {
          const isActive = !onOffers && active === item.tab
          const count = item.count ? counts[item.count] ?? 0 : 0
          return (
            <li key={item.tab} className="shrink-0">
              <Link
                href={`/dashboard/recruiting?tab=${item.tab}`}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white font-medium'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                <item.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
                <span className="truncate">{item.label}</span>
                {count > 0 && (
                  <span className={`ml-auto text-[10px] font-bold rounded-full px-1.5 py-0.5 tabular-nums ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {count}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
        <li className="shrink-0 lg:mt-2 lg:pt-2 lg:border-t lg:border-slate-200">
          <Link
            href="/dashboard/recruiting/new-jd"
            aria-current={onNewJd ? 'page' : undefined}
            className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              onNewJd ? 'bg-slate-900 text-white font-medium' : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            <FilePlus2 className={`w-4 h-4 shrink-0 ${onNewJd ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
            <span className="truncate">New Job Description</span>
          </Link>
        </li>
        <li className="shrink-0">
          <Link
            href="/dashboard/recruiting/offers"
            aria-current={onOffers ? 'page' : undefined}
            className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              onOffers ? 'bg-slate-900 text-white font-medium' : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            <FileSignature className={`w-4 h-4 shrink-0 ${onOffers ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
            <span className="truncate">Offers</span>
          </Link>
        </li>
      </ul>
    </nav>
  )
}
