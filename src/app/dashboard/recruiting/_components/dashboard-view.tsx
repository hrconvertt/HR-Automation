/**
 * Recruiting's landing view — the pipeline ring, then the queues.
 *
 * Two things in Workday's version are deliberately absent. The banner of
 * article cards across the top is Workday's content-delivery feature and there
 * is no content library here to fill it, so it would be three empty frames.
 * "+ Add Card" personalises which cards a recruiter sees; there is nothing
 * behind it yet, and a button that does nothing is worse than no button.
 */
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { ClipboardList, UserSearch, Filter, Users, Briefcase } from 'lucide-react'
import { StageDonut, STAGE_COLORS, RING_STAGES } from './stage-donut'
import type { RecruitingDashboard, TaskItem } from '@/lib/queries/recruiting-dashboard'

export function RecruitingDashboardView({ data }: { data: RecruitingDashboard }) {
  const { total, inPipeline, stages, openRequisitions, feedbackDue, toScreen, knockedOut } = data
  const ring = stages.filter((s) => RING_STAGES.includes(s.key))
  const rejected = stages.find((s) => s.key === 'REJECTED')

  return (
    <div className="space-y-4">
      {/* Candidate pipeline. Named for what it counts: Workday's card is "My
          Candidates" because Workday assigns candidates to a recruiter, and
          nothing here does. */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">Candidate Pipeline</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Briefcase className="w-3.5 h-3.5" />
            {openRequisitions} open {openRequisitions === 1 ? 'requisition' : 'requisitions'}
          </span>
        </div>

        <div className="flex items-center gap-6 flex-wrap lg:flex-nowrap">
          <StageDonut stages={stages} inPipeline={inPipeline} />

          {/* The comparison happens here, in numbers, not on the arcs. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-1 gap-y-4 min-w-0">
            {ring.map((s) => {
              const zero = s.count === 0
              return (
                <Link
                  key={s.key}
                  href="/dashboard/recruiting?tab=pipeline"
                  className="lg:flex-1 px-4 lg:border-l border-slate-100 first:lg:border-l-0 min-w-0 group"
                >
                  <p
                    className={`text-2xl font-semibold leading-none ${zero ? 'text-slate-300' : 'text-slate-900 group-hover:underline'}`}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {s.count}
                  </p>
                  <p className={`text-xs mt-1.5 truncate ${zero ? 'text-slate-300' : 'text-slate-600'}`}>
                    {s.label}
                  </p>
                  <span
                    className="block w-2 h-2 rounded-full mt-2"
                    style={{ background: zero ? '#e2e8f0' : STAGE_COLORS[s.key] }}
                  />
                </Link>
              )
            })}

            {/* Outside the ring, and shown as such: a rejected candidate has
                left the pipeline, so they are not part of what it divides. */}
            {rejected && (
              <Link
                href="/dashboard/recruiting?tab=pipeline"
                className="lg:flex-1 px-4 lg:border-l-2 border-l border-slate-200 min-w-0 group"
              >
                <p
                  className={`text-2xl font-semibold leading-none ${rejected.count === 0 ? 'text-slate-300' : 'text-slate-500 group-hover:underline'}`}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {rejected.count}
                </p>
                <p className={`text-xs mt-1.5 truncate ${rejected.count === 0 ? 'text-slate-300' : 'text-slate-500'}`}>
                  Rejected
                </p>
                <span
                  className="block w-2 h-2 rounded-full mt-2"
                  style={{ background: rejected.count === 0 ? '#e2e8f0' : STAGE_COLORS.REJECTED }}
                />
              </Link>
            )}
          </div>
        </div>

        <p className="text-[11px] text-slate-400 mt-4">
          The ring counts the {inPipeline} {inPipeline === 1 ? 'candidate' : 'candidates'} still in play.
          {' '}{total} on record in total.
        </p>
      </Card>

      {/* The three queues that are waiting on a person. */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TaskCard
          icon={<ClipboardList className="w-4 h-4" />}
          title="Interview Feedback Due"
          items={feedbackDue}
          unit="interview"
          href="/dashboard/recruiting?tab=schedule"
          empty="Every interview that has happened has a result."
        />
        <TaskCard
          icon={<UserSearch className="w-4 h-4" />}
          title="Waiting to be Screened"
          items={toScreen}
          unit="candidate"
          href="/dashboard/recruiting?tab=pipeline"
          empty="Nobody is sitting unread."
        />
        <TaskCard
          icon={<Filter className="w-4 h-4" />}
          title="Knocked Out"
          items={knockedOut}
          unit="candidate"
          href="/dashboard/recruiting?tab=knockouts"
          empty="Nobody has been filtered out."
        />
      </div>
    </div>
  )
}

function TaskCard({ icon, title, items, unit, href, empty }: {
  icon: React.ReactNode
  title: string
  items: TaskItem[]
  unit: string
  href: string
  empty: string
}) {
  const shown = items.slice(0, 4)
  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 truncate">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {items.length} {unit}{items.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="px-5 py-6 text-xs text-slate-400 flex-1">{empty}</p>
      ) : (
        <div className="divide-y divide-slate-100 flex-1">
          {shown.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className="flex items-start justify-between gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{t.title}</p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{t.sub}</p>
              </div>
              {t.meta && (
                <span className="text-[11px] text-slate-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                  {t.meta}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {items.length > shown.length && (
        <Link
          href={href}
          className="px-5 py-2.5 border-t border-slate-100 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          See all {items.length}
        </Link>
      )}
    </Card>
  )
}
