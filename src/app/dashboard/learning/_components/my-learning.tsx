'use client'

/**
 * My Learning — the catalogue as a person sees it, rather than as HR runs it.
 *
 * Shaped after Workday's My Learning: shelves of course cards with cover art,
 * a type and a length, "View course", and a menu of things to do with a card.
 * Four views share it — My Learning, Discover, My Transcript and My Library.
 *
 * What is deliberately not here:
 *   "Based on your skills to develop" — Workday drives that row from a skills
 *     profile. Nobody here has one yet (zero skills on record), so a row with
 *     that title would be recommending on nothing. The shelves are by type
 *     until there is something real to recommend from.
 *   Learning paths and Career Hub plans — Workday products with nothing behind
 *     them in this system. Their menu items would have been buttons that did
 *     nothing.
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Eye, MoreVertical, Bookmark, BookmarkMinus, PlayCircle, Link2, ChevronLeft,
  ChevronRight, Search, type LucideIcon,
} from 'lucide-react'
import { toastSuccess, toastError } from '@/components/ui/toaster'
import { CourseCover } from './course-cover'
import {
  PROGRAM_TYPES, PROGRAM_TYPE_LABELS, RECORD_STATUS_LABELS, RECORD_STATUS_TONE,
  type ProgramType, type RecordStatus,
} from '@/lib/learning'

export type LearningView = 'my' | 'discover' | 'transcript' | 'library'

export interface CourseCard {
  id: string
  title: string
  type: string
  description: string | null
  duration: number | null
  provider: string | null
  /** Whether the program has lessons or a quiz yet — none of them does today. */
  hasContent: boolean
  myStatus: RecordStatus | null
  myScore: number | null
  saved: boolean
}

export interface TranscriptRow {
  id: string
  programId: string
  title: string
  type: string
  status: string
  score: number | null
  startDate: string
  endDate: string | null
}

const typeLabel = (t: string) => PROGRAM_TYPE_LABELS[t as ProgramType] ?? t

function lengthLabel(h: number | null): string {
  if (h == null || h <= 0) return 'Self-paced'
  if (h < 1) return `${Math.round(h * 60)} minutes`
  const r = Math.round(h * 10) / 10
  return `${r} hour${r === 1 ? '' : 's'}`
}

const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '—'

export function MyLearning({ view, courses: initial, transcript, linked, firstName, topic }: {
  view: LearningView
  courses: CourseCard[]
  transcript: TranscriptRow[]
  /** False when the sign-in has no employee record — browsing only. */
  linked: boolean
  firstName: string | null
  /** Discover opens filtered to this type when a shelf's "View more" sent you. */
  topic: string | null
}) {
  const router = useRouter()
  const [courses, setCourses] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)

  async function toggleSave(c: CourseCard) {
    if (!linked) return
    const next = !c.saved
    setBusy(c.id)
    const res = await fetch('/api/learning/me/saves', {
      method: next ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programId: c.id }),
    })
    setBusy(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toastError(next ? 'Not saved' : 'Not removed', d.error ?? null)
      return
    }
    setCourses((cs) => cs.map((x) => (x.id === c.id ? { ...x, saved: next } : x)))
    toastSuccess(next ? 'Saved for later' : 'Removed from your library', c.title)
  }

  async function start(c: CourseCard) {
    if (!linked || c.myStatus) return
    setBusy(c.id)
    const res = await fetch('/api/learning/me/enrol', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programId: c.id }),
    })
    setBusy(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toastError('Could not start the course', d.error ?? null)
      return
    }
    setCourses((cs) => cs.map((x) => (x.id === c.id ? { ...x, myStatus: 'ENROLLED' } : x)))
    toastSuccess('You are on the course', c.title)
    router.refresh()
  }

  async function copyLink(c: CourseCard) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/dashboard/learning/programs/${c.id}`)
      toastSuccess('Link copied', c.title)
    } catch {
      toastError('Could not copy the link', 'Your browser blocked the clipboard.')
    }
  }

  const actions = { linked, busy, onSave: toggleSave, onStart: start, onCopy: copyLink }

  return (
    <div className="space-y-8 min-w-0">
      {!linked && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          Your sign-in is not linked to an employee record, so saving and starting courses are off.
          You can still browse everything.
        </p>
      )}

      {view === 'my' && <MyView courses={courses} firstName={firstName} actions={actions} />}
      {view === 'discover' && <DiscoverView courses={courses} topic={topic} actions={actions} />}
      {view === 'library' && <LibraryView courses={courses} actions={actions} />}
      {view === 'transcript' && <TranscriptView rows={transcript} courses={courses} />}
    </div>
  )
}

interface Actions {
  linked: boolean
  busy: string | null
  onSave: (c: CourseCard) => void
  onStart: (c: CourseCard) => void
  onCopy: (c: CourseCard) => void
}

/* ── My Learning ─────────────────────────────────────────────────────────── */

function MyView({ courses, firstName, actions }: {
  courses: CourseCard[]; firstName: string | null; actions: Actions
}) {
  const inProgress = courses.filter((c) => c.myStatus && c.myStatus !== 'COMPLETED')
  const completed = courses.filter((c) => c.myStatus === 'COMPLETED')
  const saved = courses.filter((c) => c.saved)
  const hoursDone = completed.reduce((s, c) => s + (c.duration ?? 0), 0)

  const shelves: { key: string; title: string; items: CourseCard[]; more?: string }[] = [
    { key: 'continue', title: 'Continue learning', items: inProgress, more: '/dashboard/learning?tab=transcript' },
    { key: 'saved', title: 'Saved for later', items: saved, more: '/dashboard/learning?tab=library' },
    {
      key: 'required', title: 'Required for everyone',
      items: courses.filter((c) => c.type === 'COMPLIANCE' && c.myStatus !== 'COMPLETED'),
      more: '/dashboard/learning?tab=discover&topic=COMPLIANCE',
    },
    { key: 'onboarding', title: 'Start here', items: courses.filter((c) => c.type === 'ONBOARDING'), more: '/dashboard/learning?tab=discover&topic=ONBOARDING' },
    { key: 'tech', title: 'Build your technical skills', items: courses.filter((c) => c.type === 'TECHNICAL'), more: '/dashboard/learning?tab=discover&topic=TECHNICAL' },
    { key: 'soft', title: 'Work better with people', items: courses.filter((c) => c.type === 'SOFT_SKILLS'), more: '/dashboard/learning?tab=discover&topic=SOFT_SKILLS' },
    { key: 'external', title: 'From outside Convertt', items: courses.filter((c) => c.type === 'EXTERNAL'), more: '/dashboard/learning?tab=discover&topic=EXTERNAL' },
  ].filter((s) => s.items.length > 0)

  return (
    <>
      {/* The welcome, with the four numbers a learner actually wants. */}
      <div
        className="relative overflow-hidden rounded-2xl text-white px-6 py-7 sm:px-8"
        style={{ background: 'linear-gradient(115deg, #0f172a 0%, #1e293b 45%, #1e3a8a 100%)' }}
      >
        <div className="absolute -right-10 -top-16 w-64 h-64 rounded-full bg-white/5" aria-hidden="true" />
        <div className="absolute right-24 -bottom-20 w-48 h-48 rounded-full bg-blue-400/10" aria-hidden="true" />
        <h1 className="relative text-2xl sm:text-3xl font-bold tracking-tight">My Learning</h1>
        <p className="relative text-sm text-slate-300 mt-1.5">
          {firstName ? `${firstName}, ` : ''}
          {inProgress.length
            ? `you have ${inProgress.length} course${inProgress.length === 1 ? '' : 's'} on the go — pick up where you left off.`
            : 'nothing on the go yet — pick something below to start.'}
        </p>
        <div className="relative flex flex-wrap gap-2 mt-5">
          <Stat value={inProgress.length} label="In progress" />
          <Stat value={completed.length} label="Completed" />
          <Stat value={saved.length} label="Saved" />
          <Stat value={Math.round(hoursDone * 10) / 10} label="Hours completed" />
        </div>
      </div>

      {shelves.length === 0 ? (
        <p className="text-sm text-slate-500">No courses in the catalogue yet.</p>
      ) : shelves.map((s) => (
        <Shelf key={s.key} title={s.title} more={s.more}>
          {s.items.map((c) => (
            <Card key={c.id} c={c} actions={actions} className="w-[260px] sm:w-[280px] shrink-0 snap-start" />
          ))}
        </Shelf>
      ))}
    </>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full bg-white/10 border border-white/15 px-3.5 py-1.5">
      <span className="text-base font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span className="text-xs text-slate-300">{label}</span>
    </span>
  )
}

function Shelf({ title, more, children }: { title: string; more?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const scroll = (dir: 1 | -1) =>
    ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' })

  return (
    <section className="min-w-0">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-lg sm:text-xl font-semibold text-slate-900">{title}</h2>
        {more && (
          <Link
            href={more}
            className="text-xs font-medium px-3.5 py-1.5 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            View more
          </Link>
        )}
        <div className="ml-auto hidden sm:flex gap-1.5">
          <ArrowButton label={`Scroll ${title} left`} onClick={() => scroll(-1)}><ChevronLeft className="w-4 h-4" /></ArrowButton>
          <ArrowButton label={`Scroll ${title} right`} onClick={() => scroll(1)}><ChevronRight className="w-4 h-4" /></ArrowButton>
        </div>
      </div>
      {/* Scrolls inside itself, so the page never scrolls sideways. */}
      <div
        ref={ref}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </section>
  )
}

function ArrowButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
    >
      {children}
    </button>
  )
}

/* ── The card ────────────────────────────────────────────────────────────── */

function Card({ c, actions, className = '' }: { c: CourseCard; actions: Actions; className?: string }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const href = `/dashboard/learning/programs/${c.id}`

  // Close on a click elsewhere or on Escape. The state changes happen in the
  // listeners, not down the effect body.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const act = (fn: (c: CourseCard) => void) => () => { setOpen(false); fn(c) }

  return (
    <article className={`rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col ${className}`}>
      <Link href={href} tabIndex={-1} className="block">
        <CourseCover id={c.id} title={c.title} type={c.type} className="h-40 rounded-t-xl" />
      </Link>

      <div className="px-4 pt-3.5 pb-3 flex-1 flex flex-col">
        <Link href={href} className="font-semibold text-[15px] text-slate-900 leading-snug line-clamp-2 hover:underline">
          {c.title}
        </Link>
        <p className="text-xs text-slate-500 mt-1.5">
          {typeLabel(c.type)} · {lengthLabel(c.duration)}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {c.myStatus && (
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${RECORD_STATUS_TONE[c.myStatus]}`}>
              {RECORD_STATUS_LABELS[c.myStatus]}{c.myScore != null ? ` · ${Math.round(c.myScore)}%` : ''}
            </span>
          )}
          {c.saved && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-blue-50 text-blue-800 border-blue-200">
              <Bookmark className="w-3 h-3" /> Saved
            </span>
          )}
          {!c.hasContent && (
            <span className="text-[11px] text-slate-400">Lessons not added yet</span>
          )}
        </div>
      </div>

      <div ref={menuRef} className="relative flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
        <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
          View course <Eye className="w-4 h-4" />
        </Link>
        <button
          type="button"
          aria-label={`More for ${c.title}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {/* Opens upward, so it stays inside the shelf's scroll box. */}
        {open && (
          <div role="menu" className="absolute right-2 bottom-12 z-20 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-sm">
            <MenuItem
              icon={c.saved ? BookmarkMinus : Bookmark}
              label={c.saved ? 'Remove from My Library' : 'Add to Saved for Later'}
              disabled={!actions.linked || actions.busy === c.id}
              onClick={act(actions.onSave)}
            />
            <MenuItem
              icon={PlayCircle}
              label={c.myStatus ? `Already ${RECORD_STATUS_LABELS[c.myStatus].toLowerCase()}` : 'Start this course'}
              disabled={!actions.linked || !!c.myStatus || actions.busy === c.id}
              onClick={act(actions.onStart)}
            />
            <MenuItem icon={Link2} label="Copy link" onClick={act(actions.onCopy)} />
          </div>
        )}
      </div>
    </article>
  )
}

function MenuItem({ icon: Icon, label, onClick, disabled }: {
  icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-transparent"
    >
      <Icon className="w-4 h-4 text-slate-400" />
      {label}
    </button>
  )
}

/* ── Discover ────────────────────────────────────────────────────────────── */

function DiscoverView({ courses, topic, actions }: { courses: CourseCard[]; topic: string | null; actions: Actions }) {
  const [sel, setSel] = useState<string>(topic ?? 'ALL')
  const [q, setQ] = useState('')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return courses.filter((c) => {
      if (sel !== 'ALL' && c.type !== sel) return false
      if (!needle) return true
      return [c.title, c.description, c.provider].filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
  }, [courses, sel, q])

  const count = (t: string) => courses.filter((c) => c.type === t).length

  return (
    <>
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Discover</h1>
        <p className="text-sm text-slate-500 mt-1">Every course Convertt offers, by topic.</p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip on={sel === 'ALL'} onClick={() => setSel('ALL')} label="All" n={courses.length} />
          {PROGRAM_TYPES.filter((t) => count(t) > 0).map((t) => (
            <Chip key={t} on={sel === t} onClick={() => setSel(t)} label={typeLabel(t)} n={count(t)} />
          ))}
        </div>
        <label className="relative sm:ml-auto sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search courses"
            aria-label="Search courses"
            className="w-full text-sm pl-9 pr-3 py-2 rounded-full border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">No course matches that.</p>
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
          {shown.map((c) => <Card key={c.id} c={c} actions={actions} />)}
        </div>
      )}
    </>
  )
}

function Chip({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
        on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
      <span className={on ? 'text-slate-300' : 'text-slate-400'}>{n}</span>
    </button>
  )
}

/* ── My Library ──────────────────────────────────────────────────────────── */

function LibraryView({ courses, actions }: { courses: CourseCard[]; actions: Actions }) {
  const saved = courses.filter((c) => c.saved)
  return (
    <>
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">My Library</h1>
        <p className="text-sm text-slate-500 mt-1">Everything you saved for later.</p>
      </div>
      {saved.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <Bookmark className="w-6 h-6 text-slate-300 mx-auto" />
          <p className="text-sm text-slate-600 mt-3">Nothing saved yet.</p>
          <p className="text-xs text-slate-400 mt-1">
            Use the ⋮ menu on any course and choose <span className="font-medium">Add to Saved for Later</span>.
          </p>
          <Link
            href="/dashboard/learning?tab=discover"
            className="inline-block mt-4 text-xs font-medium px-3.5 py-1.5 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Browse the catalogue
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
          {saved.map((c) => <Card key={c.id} c={c} actions={actions} />)}
        </div>
      )}
    </>
  )
}

/* ── My Transcript ───────────────────────────────────────────────────────── */

function TranscriptView({ rows, courses }: { rows: TranscriptRow[]; courses: CourseCard[] }) {
  const hoursOf = new Map(courses.map((c) => [c.id, c.duration ?? 0]))
  const done = rows.filter((r) => r.status === 'COMPLETED')
  const hours = done.reduce((s, r) => s + (hoursOf.get(r.programId) ?? 0), 0)

  return (
    <>
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">My Transcript</h1>
        <p className="text-sm text-slate-500 mt-1">Every course you have been on, and how it went.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Courses" value={rows.length} />
        <Tile label="Completed" value={done.length} />
        <Tile label="In progress" value={rows.filter((r) => r.status === 'ENROLLED' || r.status === 'IN_PROGRESS').length} />
        <Tile label="Hours completed" value={Math.round(hours * 10) / 10} />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">
          You have not been on a course yet.{' '}
          <Link href="/dashboard/learning?tab=discover" className="text-blue-700 hover:underline">Find one</Link>.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {['Course', 'Type', 'Status', 'Score', 'Started', 'Finished'].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide ${i === 3 ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/learning/programs/${r.programId}`} className="font-medium text-slate-900 hover:underline">
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{typeLabel(r.type)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${RECORD_STATUS_TONE[r.status as RecordStatus] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {RECORD_STATUS_LABELS[r.status as RecordStatus] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{r.score != null ? `${Math.round(r.score)}%` : '—'}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{day(r.startDate)}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{day(r.endDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-2xl font-semibold text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}
