/**
 * A flex team as Workday draws one: a coloured banner, the name, category,
 * location and how it is worked, then View and whatever the viewer can do.
 */
import Link from 'next/link'
import type { FlexTeamCard } from '@/lib/queries/career'
import { workModeLabel, FLEX_STATUS_LABEL, type FlexStatus } from '@/lib/talent-labels'
import { FlexInterestButton } from './career-actions'

const BANNERS = [
  'from-rose-200 to-orange-100',
  'from-teal-200 to-emerald-100',
  'from-violet-300 to-fuchsia-200',
  'from-amber-200 to-yellow-100',
  'from-sky-200 to-indigo-200',
]

export function bannerFor(title: string): string {
  let h = 0
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0
  return BANNERS[h % BANNERS.length]
}

export function FlexCard({ team, basis, extra }: {
  team: FlexTeamCard
  /** What `matches` counts — interests or skills. */
  basis?: 'interests' | 'skills'
  extra?: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
      <div className={`h-20 bg-gradient-to-br ${bannerFor(team.title)}`} />
      <div className="p-4 flex flex-col flex-1">
        {team.matches > 0 && (
          <span className="self-start text-[10px] font-semibold uppercase tracking-wide text-sky-800 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 mb-1.5">
            Good match
          </span>
        )}
        <Link href={`/dashboard/career/flex-teams/${team.id}`} className="text-sm font-semibold text-slate-900 hover:underline line-clamp-2">
          {team.title}
        </Link>
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {team.matches > 0 && <li>Matches {team.matches} of your skill {basis ?? 'interests'}</li>}
          {team.category && <li>{team.category}</li>}
          <li>{team.location || 'No location specified'}</li>
          <li>{workModeLabel(team.workMode)}{team.hoursPerWeek ? ` · ${team.hoursPerWeek}` : ''}</li>
          {team.status !== 'OPEN' && <li className="text-slate-500">{FLEX_STATUS_LABEL[team.status as FlexStatus] ?? team.status}</li>}
        </ul>
        <div className="mt-auto pt-3 border-t border-slate-100 mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          <Link href={`/dashboard/career/flex-teams/${team.id}`} className="text-sm font-medium text-slate-900 underline underline-offset-2">
            View flex team
          </Link>
          <FlexInterestButton teamId={team.id} status={team.myStatus} open={team.status === 'OPEN'} />
          {extra}
        </div>
      </div>
    </div>
  )
}
