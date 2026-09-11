'use client'

/**
 * A course, taken — shaped after Workday's course player.
 *
 * The lessons run down a sidebar with a tick against each one done; the open
 * lesson fills the page. A lesson is one of three kinds:
 *   Reading — text on the page.
 *   Video   — a YouTube, Vimeo or Google Drive link played in place, or a
 *             direct .mp4 in a plain player.
 *   File    — a linked document. Opening it marks the lesson done, the way
 *             Workday's "Review file to mark this lesson as complete" works.
 * The quiz, if there is one, is the last step and opens once every lesson is
 * ticked. Passing it completes the course; with no quiz, ticking the last
 * lesson does.
 *
 * What Workday has that this does not: questions inside the video at a
 * timestamp. That needs a player that can pause itself on cue, and an embedded
 * YouTube frame cannot be driven that way from here. The quiz at the end is the
 * assessment.
 *
 * HR sees "Build content" and edits the same course in place.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Check, Lock, ListChecks, FileText, BookOpen, Star, Bookmark,
  ExternalLink, ChevronRight, Loader2, Pencil, Plus, Trash2, Save,
  CheckCircle2, XCircle, RotateCcw, CalendarClock, PlayCircle, ArrowUp, ArrowDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toastSuccess, toastError } from '@/components/ui/toaster'
import { CourseCover } from '../../_components/course-cover'
import {
  PROGRAM_TYPE_LABELS, LESSON_KINDS, videoEmbed, isDirectVideo,
  type Lesson, type LessonKind, type QuizQuestion, type ProgramType,
} from '@/lib/learning'

export interface PlayerProgram {
  id: string
  title: string
  type: string
  description: string | null
  provider: string | null
  duration: number | null
  passingScore: number
  lessons: Lesson[]
  quiz: QuizQuestion[]
}

export interface PlayerRecord {
  status: string
  score: number | null
  completed: number[]
  required: boolean
  dueDate: string | null
}

export interface PlayerRating {
  mine: number | null
  average: number | null
  count: number
}

const KIND_LABEL: Record<LessonKind, string> = { TEXT: 'Reading', VIDEO: 'Video', FILE: 'File' }
const KIND_ICON: Record<LessonKind, typeof BookOpen> = { TEXT: BookOpen, VIDEO: PlayCircle, FILE: FileText }

const kindOf = (l: Lesson): LessonKind => l.kind ?? 'TEXT'
const typeLabel = (t: string) => PROGRAM_TYPE_LABELS[t as ProgramType] ?? t
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'

function lengthLabel(h: number | null): string {
  if (h == null || h <= 0) return 'Self-paced'
  if (h < 1) return `${Math.round(h * 60)} minutes`
  const r = Math.round(h * 10) / 10
  return `${r} hour${r === 1 ? '' : 's'}`
}

/** "report-v2.pdf" out of a link, for the file card. */
function fileName(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '')
    return last && last.includes('.') ? last : 'Document'
  } catch {
    return 'Document'
  }
}

export function CoursePlayer({ isHR, linked, program, record, rating: initialRating, saved: initialSaved }: {
  isHR: boolean
  /** False when the sign-in has no employee record: the course reads, but nothing is saved. */
  linked: boolean
  program: PlayerProgram
  record: PlayerRecord | null
  rating: PlayerRating
  saved: boolean
}) {
  const router = useRouter()
  const [building, setBuilding] = useState(false)
  const [completed, setCompleted] = useState<number[]>(record?.completed ?? [])
  const [status, setStatus] = useState<string | null>(record?.status ?? null)
  const [score, setScore] = useState<number | null>(record?.score ?? null)
  const [rating, setRating] = useState<PlayerRating>(initialRating)
  const [saved, setSaved] = useState(initialSaved)
  const [busy, setBusy] = useState(false)

  const { lessons, quiz } = program
  const quizIndex = lessons.length
  const hasQuiz = quiz.length > 0
  const lessonsDone = lessons.every((_, i) => completed.includes(i))
  const quizDone = status === 'COMPLETED' && hasQuiz

  // Open on the first lesson not yet done — or the quiz, once they all are.
  const [active, setActive] = useState<number>(() => {
    const first = lessons.findIndex((_, i) => !(record?.completed ?? []).includes(i))
    if (first >= 0) return first
    return hasQuiz ? quizIndex : 0
  })

  const steps = lessons.length + (hasQuiz ? 1 : 0)
  const doneSteps = completed.length + (quizDone ? 1 : 0)
  const pct = steps ? Math.round((doneSteps / steps) * 100) : 0
  const totalMinutes = lessons.reduce((s, l) => s + (l.minutes ?? 0), 0)
  const empty = lessons.length === 0 && quiz.length === 0

  async function markDone(i: number, done: boolean) {
    if (!linked) {
      toastError('Progress is not saved', 'Your sign-in is not linked to an employee record.')
      return
    }
    setBusy(true)
    const res = await fetch(`/api/learning/programs/${program.id}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson: i, done }),
    })
    setBusy(false)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      toastError('Progress not saved', d.error ?? null)
      return
    }
    setCompleted(d.completed)
    if (d.status === 'COMPLETED' && status !== 'COMPLETED') toastSuccess('Course complete', program.title)
    setStatus(d.status)
    router.refresh()
  }

  async function rate(stars: number) {
    if (!linked) return
    const res = await fetch(`/api/learning/programs/${program.id}/rating`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stars }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      toastError('Rating not saved', d.error ?? null)
      return
    }
    setRating({ mine: d.mine, average: d.average, count: d.count })
    toastSuccess('Thanks for rating it', `${stars} star${stars === 1 ? '' : 's'}`)
  }

  async function toggleSave() {
    if (!linked) return
    const next = !saved
    const res = await fetch('/api/learning/me/saves', {
      method: next ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programId: program.id }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toastError(next ? 'Not saved' : 'Not removed', d.error ?? null)
      return
    }
    setSaved(next)
    toastSuccess(next ? 'Saved for later' : 'Removed from your library', program.title)
  }

  return (
    <div className="space-y-5 min-w-0">
      {/* The course, at a glance. */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-start gap-4 p-5">
          <Link
            href="/dashboard/learning?tab=my"
            aria-label="Back to My Learning"
            className="mt-1 w-8 h-8 inline-flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <CourseCover
            id={program.id}
            title={program.title}
            type={program.type}
            className="hidden sm:block w-44 h-[100px] rounded-lg flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">{typeLabel(program.type)} · Course</p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-0.5">{program.title}</h1>
            <p className="text-xs text-slate-500 mt-1">
              {lessons.length} lesson{lessons.length === 1 ? '' : 's'}
              {' · '}
              {totalMinutes > 0 ? `${totalMinutes} minutes` : lengthLabel(program.duration)}
              {hasQuiz ? ` · pass mark ${program.passingScore}%` : ''}
              {program.provider ? ` · ${program.provider}` : ''}
            </p>
            {record?.required && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200">
                <CalendarClock className="w-3.5 h-3.5" />
                Required{record.dueDate ? ` · due ${day(record.dueDate)}` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <Stars rating={rating} disabled={!linked} onRate={rate} />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSave}
                disabled={!linked}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${
                  saved ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Bookmark className={`w-3.5 h-3.5 ${saved ? 'fill-current' : ''}`} />
                {saved ? 'Saved' : 'Save'}
              </button>
              {isHR && (
                <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setBuilding((b) => !b)}>
                  <Pencil className="w-3.5 h-3.5" /> {building ? 'Back to course' : 'Build content'}
                </Button>
              )}
            </div>
          </div>
        </div>
        {!building && steps > 0 && (
          <div className="px-5 pb-4">
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
              <span>{doneSteps} of {steps} done</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      {!linked && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          Your sign-in is not linked to an employee record, so progress, ratings and saves are not kept.
        </p>
      )}

      {building ? (
        <BuildMode program={program} onDone={() => setBuilding(false)} />
      ) : empty ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm text-slate-600 mt-3">This course has no lessons yet.</p>
          {isHR
            ? (
              <Button size="sm" className="mt-4 gap-1.5" onClick={() => setBuilding(true)}>
                <Pencil className="w-3.5 h-3.5" /> Build content
              </Button>
            )
            : <p className="text-xs text-slate-400 mt-1">HR is still putting it together.</p>}
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          <main className="flex-1 min-w-0 space-y-4 order-2 lg:order-1">
            {active < quizIndex ? (
              <LessonPane
                lesson={lessons[active]}
                index={active}
                count={lessons.length}
                done={completed.includes(active)}
                busy={busy}
                linked={linked}
                hasNext={active + 1 < lessons.length || hasQuiz}
                nextIsQuiz={active + 1 === lessons.length && hasQuiz}
                nextLocked={active + 1 === lessons.length && hasQuiz && !lessons.every((_, i) => i === active || completed.includes(i))}
                onMark={(d) => markDone(active, d)}
                onNext={() => setActive(active + 1)}
              />
            ) : (
              <QuizPane
                program={program}
                locked={!lessonsDone}
                priorStatus={status}
                priorScore={score}
                onResult={(st, sc) => { setStatus(st); setScore(sc) }}
              />
            )}
          </main>

          {/* The contents, with a tick against everything done. */}
          <aside className="w-full lg:w-80 flex-shrink-0 rounded-2xl border border-slate-200 bg-white overflow-hidden lg:sticky lg:top-4 order-1 lg:order-2">
            <p className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-100">
              Contents · {doneSteps}/{steps}
            </p>
            <ol className="max-h-[28rem] overflow-y-auto">
              {lessons.map((l, i) => {
                const Icon = KIND_ICON[kindOf(l)]
                return (
                  <StepRow
                    key={i}
                    on={active === i}
                    done={completed.includes(i)}
                    title={`Lesson ${i + 1} - ${l.title || 'Untitled'}`}
                    meta={
                      <>
                        <Icon className="w-3 h-3" /> {KIND_LABEL[kindOf(l)]}
                        {l.minutes ? ` · ${l.minutes} minute${l.minutes === 1 ? '' : 's'}` : ''}
                      </>
                    }
                    onClick={() => setActive(i)}
                  />
                )
              })}
              {hasQuiz && (
                <StepRow
                  on={active === quizIndex}
                  done={quizDone}
                  locked={!lessonsDone}
                  title="Quiz"
                  meta={
                    <>
                      <ListChecks className="w-3 h-3" /> {quiz.length} question{quiz.length === 1 ? '' : 's'} · pass {program.passingScore}%
                    </>
                  }
                  onClick={() => setActive(quizIndex)}
                />
              )}
            </ol>
          </aside>
        </div>
      )}
    </div>
  )
}

/* ── Rating ──────────────────────────────────────────────────────────────── */

function Stars({ rating, disabled, onRate }: { rating: PlayerRating; disabled: boolean; onRate: (n: number) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? rating.mine ?? 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex" role="radiogroup" aria-label="Rate this course" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating.mine === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            disabled={disabled}
            onMouseEnter={() => setHover(n)}
            onClick={() => onRate(n)}
            className="p-0.5 disabled:cursor-default"
          >
            <Star className={`w-4 h-4 ${n <= shown ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
          </button>
        ))}
      </div>
      <span className="text-[11px] text-slate-500 whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {rating.average != null
          ? `${rating.average.toFixed(1)} · ${rating.count} rating${rating.count === 1 ? '' : 's'}`
          : 'Not rated yet'}
      </span>
    </div>
  )
}

/* ── The contents list ───────────────────────────────────────────────────── */

function StepRow({ on, done, locked, title, meta, onClick }: {
  on: boolean; done: boolean; locked?: boolean; title: string; meta: React.ReactNode; onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={on ? 'step' : undefined}
        className={`w-full flex items-start gap-3 px-4 py-3 text-left border-l-2 transition-colors ${
          on ? 'border-blue-600 bg-blue-50/70' : 'border-transparent hover:bg-slate-50'
        }`}
      >
        <span
          className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
            done ? 'bg-blue-600 text-white' : locked ? 'bg-slate-100 text-slate-400' : 'border-2 border-slate-300'
          }`}
        >
          {done ? <Check className="w-3.5 h-3.5" /> : locked ? <Lock className="w-3 h-3" /> : null}
        </span>
        <span className="min-w-0">
          <span className={`block text-sm truncate ${on ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}`}>
            {title}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">{meta}</span>
        </span>
      </button>
    </li>
  )
}

/* ── A lesson ────────────────────────────────────────────────────────────── */

function LessonPane({
  lesson, index, count, done, busy, linked, hasNext, nextIsQuiz, nextLocked, onMark, onNext,
}: {
  lesson: Lesson; index: number; count: number; done: boolean; busy: boolean; linked: boolean
  hasNext: boolean; nextIsQuiz: boolean; nextLocked: boolean
  onMark: (done: boolean) => void; onNext: () => void
}) {
  const kind = kindOf(lesson)
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Lesson {index + 1} of {count}</p>
        <h2 className="text-lg sm:text-xl font-semibold text-slate-900 mt-0.5">{lesson.title || 'Untitled lesson'}</h2>
        <div className="mt-4">
          {kind === 'VIDEO' && <VideoBody lesson={lesson} />}
          {kind === 'FILE' && <FileBody lesson={lesson} done={done} onOpen={() => { if (!done) onMark(true) }} />}
          {kind === 'TEXT' && (
            <div className="text-[15px] leading-relaxed text-slate-700 whitespace-pre-wrap">
              {lesson.body || 'Nothing written for this lesson yet.'}
            </div>
          )}
        </div>
      </div>

      {kind !== 'TEXT' && lesson.body && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-slate-900">About lesson</h3>
          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed mt-2">{lesson.body}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {done ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="w-4 h-4" /> Completed
            </span>
            <button
              type="button"
              onClick={() => onMark(false)}
              disabled={busy || !linked}
              className="text-xs text-slate-500 hover:text-slate-900 disabled:opacity-50"
            >
              Undo
            </button>
          </div>
        ) : (
          <Button onClick={() => onMark(true)} disabled={busy || !linked} className="gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Mark as complete
          </Button>
        )}
        {hasNext && (
          <Button variant="outline" onClick={onNext} className="gap-1.5" title={nextLocked ? 'Finish every lesson to open the quiz' : undefined}>
            {nextIsQuiz ? 'Go to the quiz' : 'Next lesson'} <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </>
  )
}

function VideoBody({ lesson }: { lesson: Lesson }) {
  if (!lesson.url) return <p className="text-sm text-slate-400">No video linked to this lesson yet.</p>
  const embed = videoEmbed(lesson.url)
  if (embed) {
    return (
      <div className="aspect-video rounded-xl overflow-hidden bg-slate-900">
        <iframe
          src={embed}
          title={lesson.title || 'Lesson video'}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }
  if (isDirectVideo(lesson.url)) {
    return <video src={lesson.url} controls className="w-full rounded-xl bg-black" />
  }
  return (
    <a
      href={lesson.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 hover:bg-slate-50"
    >
      <PlayCircle className="w-8 h-8 text-blue-600" />
      <span className="text-sm font-medium text-slate-900">Watch the video</span>
      <ExternalLink className="w-4 h-4 text-slate-400 ml-auto" />
    </a>
  )
}

function FileBody({ lesson, done, onOpen }: { lesson: Lesson; done: boolean; onOpen: () => void }) {
  if (!lesson.url) return <p className="text-sm text-slate-400">No file linked to this lesson yet.</p>
  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
        {done
          ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Reviewed</>
          : 'Open the file to mark this lesson as complete.'}
      </p>
      <div className="mt-4 w-64 rounded-xl border border-slate-200 overflow-hidden">
        <div className="relative h-32 bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
          <span className="absolute left-10 top-6 w-14 h-14 rounded-full bg-amber-200/70" aria-hidden="true" />
          <span className="relative w-16 h-20 rounded-md bg-white shadow-sm border border-slate-200 flex flex-col gap-1.5 justify-center px-3">
            {[0, 1, 2, 3, 4].map((i) => <span key={i} className="h-1 rounded bg-blue-500/80" />)}
          </span>
        </div>
        <div className="px-3 py-3 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-800 truncate" title={fileName(lesson.url)}>{fileName(lesson.url)}</p>
          <a
            href={lesson.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onOpen}
            className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700"
          >
            Open file <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  )
}

/* ── The quiz ────────────────────────────────────────────────────────────── */

function QuizPane({ program, locked, priorStatus, priorScore, onResult }: {
  program: PlayerProgram
  locked: boolean
  priorStatus: string | null
  priorScore: number | null
  onResult: (status: string, score: number) => void
}) {
  const router = useRouter()
  const [answers, setAnswers] = useState<number[]>(() => program.quiz.map(() => -1))
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ pct: number; correct: number; total: number; passed: boolean } | null>(null)
  const [err, setErr] = useState('')

  if (locked) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <Lock className="w-7 h-7 text-slate-300 mx-auto" />
        <p className="text-sm text-slate-600 mt-3">The quiz opens once every lesson is complete.</p>
      </div>
    )
  }

  async function submit() {
    if (answers.some((a) => a < 0)) { setErr('Answer every question before submitting.'); return }
    setErr('')
    setSubmitting(true)
    try {
      const res = await fetch(`/api/learning/programs/${program.id}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? 'Could not submit.'); return }
      setResult({ pct: data.pct, correct: data.correct, total: data.total, passed: data.passed })
      onResult(data.status, data.pct)
      if (data.passed) toastSuccess('Passed — course complete', program.title)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div className={`rounded-2xl border p-8 text-center ${result.passed ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
        {result.passed
          ? <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
          : <XCircle className="w-10 h-10 text-rose-500 mx-auto" />}
        <p className="text-3xl font-bold text-slate-900 mt-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{result.pct}%</p>
        <p className="text-sm text-slate-600">{result.correct} of {result.total} correct · pass mark {program.passingScore}%</p>
        <p className={`text-sm font-semibold mt-1 ${result.passed ? 'text-emerald-700' : 'text-rose-600'}`}>
          {result.passed ? 'Passed — the course is complete' : 'Not passed — you can try again'}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 gap-1.5"
          onClick={() => { setResult(null); setAnswers(program.quiz.map(() => -1)) }}
        >
          <RotateCcw className="w-3.5 h-3.5" /> Retake the quiz
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Final step</p>
        <h2 className="text-lg sm:text-xl font-semibold text-slate-900 mt-0.5">Quiz</h2>
        <p className="text-sm text-slate-500 mt-1">
          {program.quiz.length} question{program.quiz.length === 1 ? '' : 's'} · select the best answer · pass mark {program.passingScore}%
        </p>
        {(priorStatus === 'COMPLETED' || priorStatus === 'FAILED') && priorScore != null && (
          <p className={`mt-3 text-xs rounded-lg border px-3 py-2 ${priorStatus === 'COMPLETED' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            Last attempt: {Math.round(priorScore)}% — {priorStatus === 'COMPLETED' ? 'passed' : 'not passed'}. You can take it again.
          </p>
        )}
      </div>

      {program.quiz.map((q, qi) => (
        <div key={qi} className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-[11px] text-slate-400">{qi + 1} of {program.quiz.length}</p>
          <p className="text-sm font-medium text-slate-900 mt-0.5">{q.question}</p>
          <div className="space-y-2 mt-3" role="radiogroup" aria-label={q.question}>
            {q.options.map((opt, oi) => (
              <label
                key={oi}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                  answers[qi] === oi ? 'border-blue-600 bg-blue-50/60' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name={`q-${qi}`}
                  checked={answers[qi] === oi}
                  onChange={() => setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)))}
                  className="accent-blue-600"
                />
                <span className="text-slate-700">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{err}</p>}
      <Button onClick={submit} disabled={submitting} className="gap-2 w-full sm:w-auto">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
        Submit
      </Button>
    </div>
  )
}

/* ── HR: build the course ────────────────────────────────────────────────── */

const inputCls =
  'w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400'

function BuildMode({ program, onDone }: { program: PlayerProgram; onDone: () => void }) {
  const router = useRouter()
  const [lessons, setLessons] = useState<Lesson[]>(program.lessons)
  const [quiz, setQuiz] = useState<QuizQuestion[]>(program.quiz)
  const [passingScore, setPassingScore] = useState(program.passingScore)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const upd = (i: number, patch: Partial<Lesson>) =>
    setLessons((prev) => prev.map((x, xi) => (xi === i ? { ...x, ...patch } : x)))
  const move = (i: number, dir: -1 | 1) =>
    setLessons((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  async function save() {
    setErr('')
    setSaving(true)
    try {
      const res = await fetch(`/api/learning/programs/${program.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessons, quiz, passingScore }),
      })
      if (!res.ok) {
        setErr((await res.json().catch(() => ({}))).error ?? 'Could not save.')
        return
      }
      toastSuccess('Course saved', program.title)
      router.refresh()
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Lessons</h2>
            <p className="text-xs text-slate-500 mt-0.5">A reading, a video link, or a file to open. Learners go through them in this order.</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0" onClick={() => setLessons((l) => [...l, { title: '', body: '', kind: 'TEXT' }])}>
            <Plus className="w-3.5 h-3.5" /> Add lesson
          </Button>
        </div>
        {lessons.length === 0 && <p className="text-sm text-slate-400">No lessons yet.</p>}
        {lessons.map((l, i) => {
          const kind = kindOf(l)
          return (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-400">Lesson {i + 1}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button type="button" aria-label="Move down" disabled={i === lessons.length - 1} onClick={() => move(i, 1)} className="p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30">
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button type="button" aria-label="Remove lesson" onClick={() => setLessons((prev) => prev.filter((_, x) => x !== i))} className="p-1 text-slate-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[150px_1fr_110px]">
                <select
                  className={inputCls}
                  value={kind}
                  aria-label="Lesson kind"
                  onChange={(e) => upd(i, { kind: e.target.value as LessonKind })}
                >
                  {LESSON_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
                <input className={inputCls} placeholder="Lesson title" value={l.title} onChange={(e) => upd(i, { title: e.target.value })} />
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  placeholder="Minutes"
                  aria-label="Minutes"
                  value={l.minutes ?? ''}
                  onChange={(e) => upd(i, { minutes: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
              {kind !== 'TEXT' && (
                <input
                  className={inputCls}
                  placeholder={kind === 'VIDEO'
                    ? 'YouTube, Vimeo or Google Drive link — or a direct .mp4'
                    : 'Link to the PDF or document (Google Drive, OneDrive, a website…)'}
                  value={l.url ?? ''}
                  onChange={(e) => upd(i, { url: e.target.value })}
                />
              )}
              <textarea
                className={`${inputCls} ${kind === 'TEXT' ? 'min-h-[140px]' : 'min-h-[70px]'}`}
                placeholder={kind === 'TEXT'
                  ? 'The lesson itself — explain the topic here.'
                  : 'About this lesson (optional) — shown under the video or file.'}
                value={l.body}
                onChange={(e) => upd(i, { body: e.target.value })}
              />
            </div>
          )
        })}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Quiz</h2>
            <p className="text-xs text-slate-500 mt-0.5">Opens after the last lesson. Passing it completes the course.</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0" onClick={() => setQuiz((q) => [...q, { question: '', options: ['', '', '', ''], correct: 0 }])}>
            <Plus className="w-3.5 h-3.5" /> Add question
          </Button>
        </div>
        {quiz.length === 0 && <p className="text-sm text-slate-400">No questions — the course completes when the last lesson is ticked.</p>}
        {quiz.map((q, qi) => (
          <div key={qi} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400">Question {qi + 1}</span>
              <button type="button" aria-label="Remove question" className="ml-auto p-1 text-slate-400 hover:text-red-600" onClick={() => setQuiz((prev) => prev.filter((_, x) => x !== qi))}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <input className={inputCls} placeholder="Question" value={q.question}
              onChange={(e) => setQuiz((prev) => prev.map((x, xi) => (xi === qi ? { ...x, question: e.target.value } : x)))} />
            <p className="text-[11px] text-slate-400">Tick the correct answer.</p>
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input type="radio" name={`correct-${qi}`} checked={q.correct === oi} aria-label={`Option ${oi + 1} is correct`}
                  onChange={() => setQuiz((prev) => prev.map((x, xi) => (xi === qi ? { ...x, correct: oi } : x)))}
                  className="accent-emerald-600" />
                <input className={inputCls} placeholder={`Option ${oi + 1}`} value={opt}
                  onChange={(e) => setQuiz((prev) => prev.map((x, xi) => (xi === qi
                    ? { ...x, options: x.options.map((o, ox) => (ox === oi ? e.target.value : o)) } : x)))} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="pass-mark">Pass mark (%)</label>
          <input id="pass-mark" type="number" min={0} max={100} className={`${inputCls} w-28`}
            value={passingScore} onChange={(e) => setPassingScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
        </div>
        <div className="flex items-center gap-2">
          {err && <span className="text-xs text-red-600">{err}</span>}
          <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save course
          </Button>
        </div>
      </div>
    </div>
  )
}
