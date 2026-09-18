/**
 * Evaluating candidates: the job's scorecard and the tests it sends.
 *
 * The scorecard is drawn from the job description once and kept on the job,
 * so every stage evaluation of every candidate is marked against the same
 * competencies and questions — which is what makes two people's scores
 * comparable. HR can edit it; the model only writes the first draft.
 */
import Anthropic from '@anthropic-ai/sdk'
import { jobText, type JobForColumns } from '@/lib/candidate-intake'
import { ASSESSMENT_KINDS } from '@/lib/candidate-review-labels'
export type { ScorecardCompetency } from '@/lib/candidate-review-labels'
import type { ScorecardCompetency } from '@/lib/candidate-review-labels'

export function sanitizeScorecard(input: unknown): ScorecardCompetency[] {
  return (Array.isArray(input) ? input : [])
    .map((c): ScorecardCompetency | null => {
      const o = c && typeof c === 'object' ? c as Record<string, unknown> : {}
      const competency = String(o.competency ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
      if (!competency) return null
      const questions = (Array.isArray(o.questions) ? o.questions : [])
        .map((q) => String(q ?? '').trim().slice(0, 300)).filter(Boolean).slice(0, 8)
      return { competency, questions }
    })
    .filter((c): c is ScorecardCompetency => c !== null)
    .slice(0, 10)
}

export function parseScorecard(raw: string | null | undefined): ScorecardCompetency[] {
  if (!raw) return []
  try { return sanitizeScorecard(JSON.parse(raw)) } catch { return [] }
}

function textOf(m: Anthropic.Message): string {
  return m.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
}

function objectFrom(text: string): Record<string, unknown> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('The reply had no data in it.')
  return JSON.parse(text.slice(start, end + 1))
}

/** The competencies this job should be judged on, each with the questions that test it. */
export async function draftScorecard(job: JobForColumns): Promise<ScorecardCompetency[]> {
  const client = new Anthropic()
  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 3000,
    system: 'You design structured interview scorecards for a CRO design and development agency in Lahore.',
    messages: [{
      role: 'user',
      content: `${jobText(job)}\n\n---\nWrite the scorecard for this job: 4 to 6 competencies that decide whether someone will do it well `
        + '(the hard skills it names, plus the soft skills and culture fit it needs), each with 2 to 4 interview questions that test it — '
        + 'specific to this job, answerable in a conversation, asking for examples.\n'
        + 'Return ONLY JSON: {"scorecard": [{"competency": string, "questions": string[]}]}',
    }],
  })
  return sanitizeScorecard(objectFrom(textOf(message)).scorecard)
}

/** A test to send a candidate for this job, with how it will be marked. */
export async function draftAssessment(job: JobForColumns, kind: string, note: string): Promise<{ name: string; brief: string }> {
  const client = new Anthropic()
  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 3000,
    system: 'You write short candidate assessments for a CRO design and development agency in Lahore. Plain text, no markdown headings.',
    messages: [{
      role: 'user',
      content: `${jobText(job)}\n\n---\nWrite a ${ASSESSMENT_KINDS.find((k) => k.key === kind)?.label.toLowerCase() ?? 'practical task'} for a candidate for this job`
        + `${note ? ` (HR's note: ${note})` : ''}. It should take 2 to 4 hours at most for a practical task, 30 minutes for a test. `
        + 'Give: what to do, what to hand in and by when (leave the date as "within 3 days"), and — separately — how it will be marked out of 100 '
        + 'with the criteria and their weights.\n'
        + 'Return ONLY JSON: {"name": string, "brief": string}. The brief is what we send the candidate, followed by a line "--- Marking (not sent) ---" and the marking guide.',
    }],
  })
  const o = objectFrom(textOf(message))
  return { name: String(o.name ?? 'Assessment').slice(0, 120), brief: String(o.brief ?? '').slice(0, 8000) }
}
