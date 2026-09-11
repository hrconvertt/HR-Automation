/**
 * The numbers behind Learning Admin and Manage Learning Content.
 *
 * Server only. Every figure is counted from the records as they stand —
 * TrainingRecord, LearningRating, LearningSave, LearningPathItem and
 * LearningAssignment — so nothing here is stored twice or can drift.
 */
import { prisma } from '@/lib/prisma'
import { parseLessons, parseQuiz, parseCompleted } from '@/lib/learning'
import { DEPARTED_STATUSES } from '@/lib/learning-assign'

export interface CourseUsage {
  id: string
  title: string
  type: string
  notStarted: number
  inProgress: number
  completed: number
  total: number
}

export interface ComplianceRow {
  programId: string
  title: string
  assigned: number
  completed: number
  overdue: number
  lastSent: string | null
}

export interface OverdueRow {
  recordId: string
  employeeId: string
  employeeName: string
  programId: string
  title: string
  dueDate: string
}

export interface EngagementRow {
  programId: string
  title: string
  type: string
  ratingAvg: number | null
  ratings: number
  saves: number
  inPaths: number
}

export interface AdminTotals {
  courses: number
  withContent: number
  enrolments: number
  completions: number
  requiredOpen: number
  overdue: number
}

export interface LearningAdminData {
  totals: AdminTotals
  usage: CourseUsage[]
  compliance: ComplianceRow[]
  overdue: OverdueRow[]
  engagement: EngagementRow[]
}

export interface ContentRow {
  id: string
  title: string
  type: string
  description: string | null
  provider: string | null
  duration: number | null
  lessons: number
  hasQuiz: boolean
  enrolled: number
  completed: number
  ratingAvg: number | null
  ratings: number
}

/**
 * Where a record sits on the way to done. An enrolment with a lesson ticked
 * has started even if its status was never moved on, and a failed quiz is
 * still in progress — the learner can retake it.
 */
function stage(status: string, completedLessons: unknown, lessonCount: number): keyof Pick<CourseUsage, 'notStarted' | 'inProgress' | 'completed'> {
  if (status === 'COMPLETED') return 'completed'
  if (status === 'IN_PROGRESS' || status === 'FAILED') return 'inProgress'
  return parseCompleted(completedLessons, lessonCount).length > 0 ? 'inProgress' : 'notStarted'
}

export async function learningAdminData(): Promise<LearningAdminData> {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const [programs, records, ratings, saves, pathItems, sends] = await Promise.all([
    prisma.trainingProgram.findMany({
      orderBy: { title: 'asc' },
      select: { id: true, title: true, type: true, lessons: true, quiz: true },
    }),
    prisma.trainingRecord.findMany({
      select: {
        id: true, programId: true, status: true, completedLessons: true, required: true, dueDate: true,
        employee: { select: { id: true, fullName: true, status: true, deletedAt: true } },
      },
    }),
    prisma.learningRating.groupBy({ by: ['programId'], _avg: { stars: true }, _count: { _all: true } }),
    prisma.learningSave.groupBy({ by: ['programId'], _count: { _all: true } }),
    prisma.learningPathItem.groupBy({ by: ['programId'], _count: { _all: true } }),
    prisma.learningAssignment.groupBy({ by: ['programId'], _max: { createdAt: true } }),
  ])

  const byId = new Map(programs.map((p) => [p.id, {
    ...p,
    lessonCount: parseLessons(p.lessons).length,
    hasQuiz: parseQuiz(p.quiz).length > 0,
  }]))
  const isCurrent = (e: { status: string; deletedAt: Date | null }) =>
    !e.deletedAt && !DEPARTED_STATUSES.includes(e.status)

  // Usage — everyone who has ever been on a course, whoever they are.
  const usage = new Map<string, CourseUsage>()
  for (const r of records) {
    const p = byId.get(r.programId)
    if (!p) continue
    const u = usage.get(p.id) ?? { id: p.id, title: p.title, type: p.type, notStarted: 0, inProgress: 0, completed: 0, total: 0 }
    u[stage(r.status, r.completedLessons, p.lessonCount)]++
    u.total++
    usage.set(p.id, u)
  }

  // Compliance — required learning of people still here. Somebody who has
  // left cannot be chased, so they are not counted as overdue.
  const lastSent = new Map(sends.map((s) => [s.programId, s._max.createdAt?.toISOString() ?? null]))
  const compliance = new Map<string, ComplianceRow>()
  const overdue: OverdueRow[] = []
  for (const r of records) {
    if (!r.required || !isCurrent(r.employee)) continue
    const p = byId.get(r.programId)
    if (!p) continue
    const c = compliance.get(p.id) ?? {
      programId: p.id, title: p.title, assigned: 0, completed: 0, overdue: 0, lastSent: lastSent.get(p.id) ?? null,
    }
    c.assigned++
    if (r.status === 'COMPLETED') c.completed++
    else if (r.dueDate && r.dueDate < today) {
      c.overdue++
      overdue.push({
        recordId: r.id,
        employeeId: r.employee.id,
        employeeName: r.employee.fullName,
        programId: p.id,
        title: p.title,
        dueDate: r.dueDate.toISOString(),
      })
    }
    compliance.set(p.id, c)
  }

  const ratingOf = new Map(ratings.map((r) => [r.programId, { avg: r._avg.stars ?? null, n: r._count._all }]))
  const savesOf = new Map(saves.map((s) => [s.programId, s._count._all]))
  const pathsOf = new Map(pathItems.map((s) => [s.programId, s._count._all]))
  const engagement: EngagementRow[] = programs.map((p) => ({
    programId: p.id,
    title: p.title,
    type: p.type,
    ratingAvg: ratingOf.get(p.id)?.avg ?? null,
    ratings: ratingOf.get(p.id)?.n ?? 0,
    saves: savesOf.get(p.id) ?? 0,
    inPaths: pathsOf.get(p.id) ?? 0,
  })).sort((a, b) =>
    (b.ratings + b.saves + b.inPaths) - (a.ratings + a.saves + a.inPaths) || a.title.localeCompare(b.title))

  const requiredCurrent = records.filter((r) => r.required && isCurrent(r.employee))

  return {
    totals: {
      courses: programs.length,
      withContent: [...byId.values()].filter((p) => p.lessonCount > 0 || p.hasQuiz).length,
      enrolments: records.length,
      completions: records.filter((r) => r.status === 'COMPLETED').length,
      requiredOpen: requiredCurrent.filter((r) => r.status !== 'COMPLETED').length,
      overdue: overdue.length,
    },
    usage: [...usage.values()].sort((a, b) => b.total - a.total || a.title.localeCompare(b.title)),
    compliance: [...compliance.values()].sort((a, b) => b.overdue - a.overdue || b.assigned - a.assigned),
    overdue: overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    engagement,
  }
}

export async function contentData(): Promise<ContentRow[]> {
  const [programs, recs, ratings] = await Promise.all([
    prisma.trainingProgram.findMany({
      orderBy: { title: 'asc' },
      select: {
        id: true, title: true, type: true, description: true, provider: true,
        duration: true, lessons: true, quiz: true,
      },
    }),
    prisma.trainingRecord.groupBy({ by: ['programId', 'status'], _count: { _all: true } }),
    prisma.learningRating.groupBy({ by: ['programId'], _avg: { stars: true }, _count: { _all: true } }),
  ])

  const enrolled = new Map<string, number>()
  const completed = new Map<string, number>()
  for (const r of recs) {
    enrolled.set(r.programId, (enrolled.get(r.programId) ?? 0) + r._count._all)
    if (r.status === 'COMPLETED') completed.set(r.programId, (completed.get(r.programId) ?? 0) + r._count._all)
  }
  const ratingOf = new Map(ratings.map((r) => [r.programId, { avg: r._avg.stars ?? null, n: r._count._all }]))

  return programs.map((p) => ({
    id: p.id,
    title: p.title,
    type: p.type,
    description: p.description,
    provider: p.provider,
    duration: p.duration,
    lessons: parseLessons(p.lessons).length,
    hasQuiz: parseQuiz(p.quiz).length > 0,
    enrolled: enrolled.get(p.id) ?? 0,
    completed: completed.get(p.id) ?? 0,
    ratingAvg: ratingOf.get(p.id)?.avg ?? null,
    ratings: ratingOf.get(p.id)?.n ?? 0,
  }))
}
