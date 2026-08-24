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
export interface Lesson { title: string; body: string }
export interface QuizQuestion { question: string; options: string[]; correct: number }

/** Coerce the JSON columns into typed arrays, tolerating null/legacy shapes. */
export function parseLessons(json: unknown): Lesson[] {
  if (!Array.isArray(json)) return []
  return json
    .filter((l): l is Lesson => !!l && typeof l === 'object')
    .map((l) => ({ title: String((l as Lesson).title ?? ''), body: String((l as Lesson).body ?? '') }))
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
