'use client'

/**
 * Learning Admin — shaped after Workday's Learning Admin dashboard.
 *
 * Three of its tabs, the ones this data can honestly fill:
 *   Usage       every course that has learners, as one bar split into not
 *               started, in progress and completed
 *   Compliance  required learning by course — sent, done, overdue — and who
 *               is overdue, by name
 *   Engagement  ratings, saves, and how many learning paths a course is in
 * Workday's Performance, Content Providers and Costs tabs are left out: there
 * is no assessment history beyond the last quiz score, only six of the
 * 37 courses name a provider, and the cost column is empty. Tabs over that would be
 * near-blank screens. The provider is a filter in Manage Learning Content
 * instead, where a handful is still useful.
 *
 * The bars are one hue stepped light to dark, because not started → in
 * progress → completed is an order, not three unrelated categories. The
 * legend is always shown, each segment carries its count on hover, and a
 * percentage is printed inside any segment wide enough to hold it.
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  PlusCircle, Pencil, Users, Award, Send, Star, Bookmark, ListOrdered, ArrowUpRight,
} from 'lucide-react'
import { PROGRAM_TYPE_LABELS, type ProgramType } from '@/lib/learning'
import type { LearningAdminData, CourseUsage } from '@/lib/queries/learning-admin'

type Tab = 'usage' | 'compliance' | 'engagement'

/** Sequential, light to dark. Ink is chosen per step so the label stays readable. */
const SEGMENTS: { key: keyof Pick<CourseUsage, 'notStarted' | 'inProgress' | 'completed'>; label: string; color: string; ink: string }[] = [
  { key: 'notStarted', label: 'Not started', color: '#bfdbfe', ink: '#1e3a8a' },
  { key: 'inProgress', label: 'In progress', color: '#60a5fa', ink: '#0f172a' },
  { key: 'completed', label: 'Completed', color: '#1d4ed8', ink: '#ffffff' },
]

const typeLabel = (t: string) => PROGRAM_TYPE_LABELS[t as ProgramType] ?? t
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export function LearningAdmin({ data }: { data: LearningAdminData }) {
  const [tab, setTab] = useState<Tab>('usage')
  const { totals } = data
  const completionRate = totals.enrolments ? Math.round((totals.completions / totals.enrolments) * 100) : 0

  return (
    <div className="space-y-5 min-w-0">
      <div
        className="rounded-2xl text-white px-6 py-6"
        style={{ background: 'linear-gradient(115deg, #0f172a 0%, #1e3a8a 100%)' }}
      >
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Learning Admin</h1>
        <p className="text-sm text-slate-300 mt-1">How the catalogue is being used, and who owes what.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Tile label="Courses" value={totals.courses} sub={`${totals.withContent} with lessons`} />
        <Tile label="Enrolments" value={totals.enrolments} />
        <Tile label="Completions" value={totals.completions} sub={totals.enrolments ? `${completionRate}% of enrolments` : undefined} />
        <Tile label="Required, open" value={totals.requiredOpen} />
        <Tile label="Overdue" value={totals.overdue} alarm={totals.overdue > 0} />
        <Tile label="Rated courses" value={data.engagement.filter((e) => e.ratings > 0).length} />
      </div>

      <div className="flex items-center gap-6 border-b border-slate-200">
        {([['usage', 'Usage'], ['compliance', 'Compliance'], ['engagement', 'Engagement']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`text-sm py-2.5 -mb-px border-b-2 transition-colors ${
              tab === key ? 'border-blue-700 text-slate-900 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] items-start">
        <div className="min-w-0 space-y-5">
          {tab === 'usage' && (
            <Panel title="Learning content by progress">
              <ProgressBars rows={data.usage} />
            </Panel>
          )}

          {tab === 'compliance' && (
            <>
              <Panel title="Required learning by course">
                {data.compliance.length === 0 ? (
                  <Empty>No required learning has been sent yet. Open any course and press Assign.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <thead className="text-slate-500">
                        <tr className="border-b border-slate-100">
                          {['Course', 'Sent to', 'Completed', 'Completion', 'Overdue', 'Last sent'].map((h, i) => (
                            <th key={h} className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${i === 0 || i === 5 ? 'text-left' : 'text-right'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.compliance.map((c) => {
                          const pct = c.assigned ? Math.round((c.completed / c.assigned) * 100) : 0
                          return (
                            <tr key={c.programId} className="border-b border-slate-50">
                              <td className="px-3 py-2.5">
                                <Link href={`/dashboard/learning/programs/${c.programId}`} className="font-medium text-slate-900 hover:underline">{c.title}</Link>
                              </td>
                              <td className="px-3 py-2.5 text-right text-slate-700">{c.assigned}</td>
                              <td className="px-3 py-2.5 text-right text-slate-700">{c.completed}</td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="inline-flex items-center gap-2">
                                  <span className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                    <span className="block h-full rounded-full bg-blue-700" style={{ width: `${pct}%` }} />
                                  </span>
                                  <span className="text-slate-700 w-9 text-right">{pct}%</span>
                                </span>
                              </td>
                              <td className={`px-3 py-2.5 text-right ${c.overdue ? 'text-red-700 font-semibold' : 'text-slate-400'}`}>{c.overdue}</td>
                              <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{c.lastSent ? day(c.lastSent) : '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel title={`Overdue${data.overdue.length ? ` · ${data.overdue.length}` : ''}`}>
                {data.overdue.length === 0 ? (
                  <Empty>Nobody is past a deadline.</Empty>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.overdue.map((o) => (
                      <li key={o.recordId} className="flex items-center gap-3 py-2.5 text-sm">
                        <Link href={`/dashboard/employees/${o.employeeId}`} className="font-medium text-blue-700 hover:underline w-48 truncate">{o.employeeName}</Link>
                        <Link href={`/dashboard/learning/programs/${o.programId}`} className="flex-1 min-w-0 truncate text-slate-700 hover:underline">{o.title}</Link>
                        <span className="text-xs font-semibold text-red-700 whitespace-nowrap">Was due {day(o.dueDate)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          )}

          {tab === 'engagement' && (
            <Panel title="Ratings, saves and learning paths">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <thead className="text-slate-500">
                    <tr className="border-b border-slate-100">
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Course</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Type</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide"><Star className="w-3 h-3 inline -mt-0.5" /> Rating</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide"><Bookmark className="w-3 h-3 inline -mt-0.5" /> Saves</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide"><ListOrdered className="w-3 h-3 inline -mt-0.5" /> In paths</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.engagement.map((e) => (
                      <tr key={e.programId} className="border-b border-slate-50">
                        <td className="px-3 py-2.5">
                          <Link href={`/dashboard/learning/programs/${e.programId}`} className="font-medium text-slate-900 hover:underline">{e.title}</Link>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{typeLabel(e.type)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700">
                          {e.ratingAvg != null ? `${e.ratingAvg.toFixed(1)} (${e.ratings})` : <span className="text-slate-300">—</span>}
                        </td>
                        <td className={`px-3 py-2.5 text-right ${e.saves ? 'text-slate-700' : 'text-slate-300'}`}>{e.saves}</td>
                        <td className={`px-3 py-2.5 text-right ${e.inPaths ? 'text-slate-700' : 'text-slate-300'}`}>{e.inPaths}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>

        {/* The actions, the way Workday keeps them down the right. */}
        <aside className="space-y-4">
          <SideGroup title="Create content">
            <SideLink href="/dashboard/learning?tab=programs" icon={PlusCircle}>New course</SideLink>
          </SideGroup>
          <SideGroup title="Edit content">
            <SideLink href="/dashboard/learning?tab=content" icon={Pencil}>Manage learning content</SideLink>
          </SideGroup>
          <SideGroup title="Management">
            <SideLink href="/dashboard/learning?tab=records" icon={Users}>Enrolments</SideLink>
            <SideLink href="/dashboard/learning?tab=certs" icon={Award}>Certifications</SideLink>
          </SideGroup>
          <SideGroup title="Required learning">
            <p className="px-4 pb-1 text-xs text-slate-500 leading-relaxed">
              Open any course and press <span className="inline-flex items-center gap-1 font-medium text-slate-700"><Send className="w-3 h-3" /> Assign</span> to
              send it to everyone, a department, or people you pick — with a deadline.
            </p>
            <SideLink href="/dashboard/learning?tab=content" icon={ArrowUpRight}>Choose a course</SideLink>
          </SideGroup>
        </aside>
      </div>
    </div>
  )
}

function ProgressBars({ rows }: { rows: CourseUsage[] }) {
  if (rows.length === 0) {
    return <Empty>Nobody has been on a course yet. This fills in as people enrol, start and finish.</Empty>
  }
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {SEGMENTS.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3">
            <Link
              href={`/dashboard/learning/programs/${r.id}`}
              title={r.title}
              className="w-44 sm:w-56 flex-shrink-0 text-xs text-slate-700 truncate hover:underline"
            >
              {r.title}
            </Link>
            <div className="flex-1 min-w-0 flex h-5 gap-[2px]">
              {SEGMENTS.map((s) => {
                const n = r[s.key]
                if (!n) return null
                const pct = (n / r.total) * 100
                return (
                  <div
                    key={s.key}
                    className="h-full flex items-center justify-center first:rounded-l-[4px] last:rounded-r-[4px]"
                    style={{ width: `${pct}%`, background: s.color, minWidth: 4 }}
                    title={`${r.title} · ${s.label}: ${n} of ${r.total}`}
                  >
                    {pct >= 14 && (
                      <span className="text-[10px] font-semibold" style={{ color: s.ink, fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round(pct)}%
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <span className="w-8 text-right text-xs text-slate-500" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.total}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-slate-400 mt-3">
        The number on the right is how many people have been on each course. Hover a segment for its count.
      </p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900 mb-4">{title}</h2>
      {children}
    </section>
  )
}

function Tile({ label, value, sub, alarm }: { label: string; value: number; sub?: string; alarm?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className={`text-2xl font-semibold ${alarm ? 'text-red-700' : 'text-slate-900'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400 py-8 text-center">{children}</p>
}

function SideGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white py-3">
      <p className="px-4 pb-2 text-xs font-semibold text-slate-900">{title}</p>
      {children}
    </div>
  )
}

function SideLink({ href, icon: Icon, children }: {
  href: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode
}) {
  return (
    <Link href={href} className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900">
      <Icon className="w-4 h-4 text-slate-400" />
      {children}
    </Link>
  )
}
