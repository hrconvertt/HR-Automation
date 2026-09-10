/**
 * What Recruiting looks like right now — the numbers behind the module's
 * landing view.
 *
 * Modelled on Workday's recruiting home: one part-to-whole card for the
 * pipeline, then the queues of work that are actually waiting on somebody.
 * Workday's card is titled "My Candidates" and counts the ones assigned to the
 * signed-in recruiter. Nothing in this schema assigns a candidate to a
 * recruiter, so the card counts every candidate and is named for what it is.
 *
 * Its nine stages are Workday's own configuration (Review, Screen, Assessment,
 * Interview, Reference Check, Employment Agreement, Offer, Background Check,
 * Hire). This pipeline has six, and they are the six the board already draws.
 * Inventing the other three would put empty columns on screen for steps
 * Convertt does not run.
 *
 * Five of those six are what the ring divides — see stage-donut for why
 * Rejected is counted beside it rather than drawn in it.
 */
import { prisma } from '@/lib/prisma'

/** The stages a candidate moves through, in the order the board draws them. */
export const STAGES = [
  { key: 'APPLIED', label: 'Applied' },
  { key: 'SCREENING', label: 'Screening' },
  { key: 'INTERVIEW', label: 'Interview' },
  { key: 'OFFER', label: 'Offer' },
  { key: 'HIRED', label: 'Hired' },
  { key: 'REJECTED', label: 'Rejected' },
] as const

export type StageKey = (typeof STAGES)[number]['key']

export interface StageCount {
  key: string
  label: string
  count: number
}

export interface TaskItem {
  id: string
  /** Who the task is about. */
  title: string
  /** The role it is against, plus whatever makes the row actionable. */
  sub: string
  /** Where clicking the row goes. */
  href: string
  /** Shown on the right — an age, a score, a reason. */
  meta?: string
}

export interface RecruitingDashboard {
  /** Every candidate on record, the rejected included. */
  total: number
  /** The five stages the ring draws — everyone still moving, plus the hires. */
  inPipeline: number
  stages: StageCount[]
  openRequisitions: number
  feedbackDue: TaskItem[]
  toScreen: TaskItem[]
  knockedOut: TaskItem[]
}

/** "3 days" / "5 hours" — how long something has been waiting. */
function waiting(since: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - since.getTime())
  const hours = Math.round(ms / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}

/** The first knockout reason, so the row says why rather than just "failed". */
function firstReason(raw: string | null): string {
  if (!raw) return 'Failed a hard filter'
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length) {
      const r = parsed[0]
      const text = typeof r === 'string' ? r : r?.reason ?? r?.type
      if (typeof text === 'string' && text.trim()) return text.trim()
    }
  } catch { /* not JSON — fall through */ }
  return 'Failed a hard filter'
}

export async function recruitingDashboard(now = new Date()): Promise<RecruitingDashboard> {
  const [grouped, openRequisitions, interviews, screening, failed] = await Promise.all([
    prisma.candidate.groupBy({ by: ['stage'], _count: { _all: true } }),

    prisma.jobRequisition.count({ where: { status: 'OPEN' } }),

    // An interview that has happened and still has no result is somebody's
    // homework. Workday calls these Assessment Tasks.
    prisma.interview.findMany({
      where: { scheduledAt: { lte: now }, result: null },
      orderBy: { scheduledAt: 'asc' },
      take: 6,
      select: {
        id: true, scheduledAt: true, round: true, type: true,
        candidate: {
          select: { id: true, fullName: true, requisition: { select: { title: true } } },
        },
      },
    }),

    // Waiting on a first read. Anyone knocked out by a hard filter is not
    // here — they are in the third queue, where the decision is different.
    prisma.candidate.findMany({
      where: {
        stage: { in: ['APPLIED', 'SCREENING'] },
        knockoutStatus: { in: ['PASSED', 'OVERRIDDEN', 'PENDING'] },
      },
      orderBy: [{ matchScore: 'desc' }, { createdAt: 'asc' }],
      take: 6,
      select: {
        id: true, fullName: true, matchScore: true, createdAt: true, stage: true,
        requisition: { select: { title: true } },
      },
    }),

    // Filtered out automatically. Someone still has to agree, or override.
    prisma.candidate.findMany({
      where: { knockoutStatus: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true, fullName: true, knockoutReasons: true, createdAt: true,
        requisition: { select: { title: true } },
      },
    }),
  ])

  const counts = new Map(grouped.map((g) => [g.stage, g._count._all]))
  const stages = STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    count: counts.get(s.key) ?? 0,
  }))
  const total = grouped.reduce((sum, g) => sum + g._count._all, 0)
  // The centre of a ring has to equal the sum of what is drawn around it, and
  // Rejected is not drawn: a rejected candidate has left the pipeline, and on
  // this data they are five of seven — the ring would be mostly the people we
  // said no to. They are counted beside it instead.
  const inPipeline = stages
    .filter((s) => s.key !== 'REJECTED')
    .reduce((sum, s) => sum + s.count, 0)

  return {
    total,
    inPipeline,
    stages,
    openRequisitions,
    feedbackDue: interviews.map((i) => ({
      id: i.id,
      title: i.candidate.fullName,
      sub: `Round ${i.round} ${i.type.toLowerCase()} · ${i.candidate.requisition.title}`,
      href: '/dashboard/recruiting?tab=schedule',
      meta: `waiting ${waiting(i.scheduledAt, now)}`,
    })),
    toScreen: screening.map((c) => ({
      id: c.id,
      title: c.fullName,
      sub: `${c.stage === 'APPLIED' ? 'Applied' : 'Screening'} · ${c.requisition.title}`,
      href: '/dashboard/recruiting?tab=pipeline',
      meta: c.matchScore != null ? `${Math.round(c.matchScore)}% match` : undefined,
    })),
    knockedOut: failed.map((c) => ({
      id: c.id,
      title: c.fullName,
      sub: `${firstReason(c.knockoutReasons)} · ${c.requisition.title}`,
      href: '/dashboard/recruiting?tab=knockouts',
    })),
  }
}
