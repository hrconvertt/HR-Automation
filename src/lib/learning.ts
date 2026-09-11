/**
 * Training & Development — the shared vocabulary.
 *
 * A program is a course the company offers or sends people on; a record is one
 * person enrolled on one program and how far they got; a certification is a
 * credential someone holds, with an expiry the system can watch.
 */

export const PROGRAM_TYPES = ['TECHNICAL', 'SOFT_SKILLS', 'COMPLIANCE', 'ONBOARDING', 'EXTERNAL'] as const
export type ProgramType = (typeof PROGRAM_TYPES)[number]

export const PROGRAM_TYPE_LABELS: Record<ProgramType, string> = {
  TECHNICAL: 'Technical',
  SOFT_SKILLS: 'Soft skills',
  COMPLIANCE: 'Compliance',
  ONBOARDING: 'Onboarding',
  EXTERNAL: 'External',
}

export const RECORD_STATUSES = ['ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'FAILED'] as const
export type RecordStatus = (typeof RECORD_STATUSES)[number]

export const RECORD_STATUS_LABELS: Record<RecordStatus, string> = {
  ENROLLED: 'Enrolled',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
}

export const RECORD_STATUS_TONE: Record<RecordStatus, string> = {
  ENROLLED: 'bg-slate-50 text-slate-600 border-slate-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-800 border-amber-200',
  COMPLETED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
}

/** Days from now within which a certification counts as "expiring soon". */
export const CERT_EXPIRY_WINDOW_DAYS = 60

// ── Course content ──────────────────────────────────────────────────────────
// A program teaches first (ordered lessons) then tests with MCQs.
/** TEXT is read on the page; VIDEO plays a linked video; FILE opens a linked document. */
export const LESSON_KINDS = ['TEXT', 'VIDEO', 'FILE'] as const
export type LessonKind = (typeof LESSON_KINDS)[number]
export interface Lesson {
  title: string
  body: string
  /** Absent on lessons written before kinds existed — those are TEXT. */
  kind?: LessonKind
  /** The video or document a VIDEO / FILE lesson points at. */
  url?: string
  /** How long it takes, so the lesson list can say so. */
  minutes?: number
}
export interface QuizQuestion { question: string; options: string[]; correct: number }

/** Coerce the JSON columns into typed arrays, tolerating null/legacy shapes. */
export function parseLessons(json: unknown): Lesson[] {
  if (!Array.isArray(json)) return []
  return json
    .filter((l): l is Lesson => !!l && typeof l === 'object')
    .map((l) => {
      const out: Lesson = { title: String(l.title ?? ''), body: String(l.body ?? '') }
      if ((LESSON_KINDS as readonly string[]).includes(String(l.kind))) out.kind = l.kind as LessonKind
      if (typeof l.url === 'string' && l.url.trim()) out.url = l.url.trim()
      const m = Number(l.minutes)
      if (Number.isFinite(m) && m > 0) out.minutes = Math.round(m)
      return out
    })
}
export function parseQuiz(json: unknown): QuizQuestion[] {
  if (!Array.isArray(json)) return []
  return json
    .filter((q): q is QuizQuestion => !!q && typeof q === 'object' && Array.isArray((q as QuizQuestion).options))
    .map((q) => ({
      question: String((q as QuizQuestion).question ?? ''),
      options: (q as QuizQuestion).options.map((o) => String(o)),
      correct: Number((q as QuizQuestion).correct) || 0,
    }))
}

/** Score a set of answers (index per question) against the quiz. */
export function scoreQuiz(quiz: QuizQuestion[], answers: number[]): { correct: number; total: number; pct: number } {
  const total = quiz.length
  if (total === 0) return { correct: 0, total: 0, pct: 100 }
  let correct = 0
  quiz.forEach((q, i) => { if (answers[i] === q.correct) correct++ })
  return { correct, total, pct: Math.round((correct / total) * 100) }
}

export function certExpiryState(expiry: Date | string | null | undefined):
  'none' | 'valid' | 'expiring' | 'expired' {
  if (!expiry) return 'none'
  const d = typeof expiry === 'string' ? new Date(expiry) : expiry
  if (Number.isNaN(d.getTime())) return 'none'
  const days = (d.getTime() - Date.now()) / 86_400_000
  if (days < 0) return 'expired'
  if (days <= CERT_EXPIRY_WINDOW_DAYS) return 'expiring'
  return 'valid'
}

// ── Lesson helpers ──────────────────────────────────────────────────────────

/** A lesson as it may be stored: bounded, and carrying a link only if it is http(s). */
export function sanitiseLesson(l: Lesson): Lesson {
  const out: Lesson = { title: l.title.slice(0, 200), body: l.body.slice(0, 20000) }
  if (l.kind && l.kind !== 'TEXT') out.kind = l.kind
  if (l.url && /^https?:\/\//i.test(l.url)) out.url = l.url.slice(0, 1000)
  if (l.minutes) out.minutes = Math.max(1, Math.min(600, l.minutes))
  return out
}

/**
 * The embeddable form of a video link, or null when it is not one of the hosts
 * that can be framed. youtube-nocookie keeps YouTube from setting tracking
 * cookies until the video is actually played.
 */
export function videoEmbed(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0]
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') {
        const id = u.searchParams.get('v')
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
      }
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)
      return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null
    }
    if (host === 'vimeo.com') {
      const m = u.pathname.match(/^\/(\d+)/)
      return m ? `https://player.vimeo.com/video/${m[1]}` : null
    }
    if (host === 'player.vimeo.com') return url
    if (host === 'drive.google.com') {
      const m = u.pathname.match(/\/file\/d\/([\w-]+)/)
      return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null
    }
    return null
  } catch {
    return null
  }
}

/** A file served directly (.mp4 / .webm / .ogg) plays in a plain <video>. */
export function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|#|$)/i.test(url)
}

/** The lessons a learner has done: whole numbers, in range, each once, in order. */
export function parseCompleted(json: unknown, lessonCount: number): number[] {
  if (!Array.isArray(json)) return []
  const seen = new Set<number>()
  for (const v of json) {
    const n = Number(v)
    if (Number.isInteger(n) && n >= 0 && n < lessonCount) seen.add(n)
  }
  return [...seen].sort((a, b) => a - b)
}
