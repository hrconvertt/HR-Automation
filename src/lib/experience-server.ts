/**
 * Journeys on the server — creating them from templates, handing them out,
 * and working out where somebody is in one.
 */
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { resolveTalentAccess, type TalentAccess } from '@/lib/talent'
import { JOURNEY_TEMPLATES, type TemplateKey } from '@/lib/experience'

const DAY = 86_400_000

export function isJourneyAdmin(v: TalentAccess): boolean {
  return v.actualRole === 'HR_ADMIN' && !v.isPreviewMode
}

/** For studio routes: the HR caller, or a response to return. */
export async function journeyAdmin(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return { error: 'Unauthorized', status: 401 } as const
  if (!isJourneyAdmin(access)) return { error: 'Only HR builds and distributes journeys.', status: 403 } as const
  return { access } as const
}

export async function createJourney(key: TemplateKey | null, title: string | null, createdById: string) {
  const t = key ? JOURNEY_TEMPLATES[key] : null
  const programs = t ? await prisma.trainingProgram.findMany({ select: { id: true, title: true } }) : []
  const modules = t?.modules ?? [{ title: 'Module 1', description: undefined, steps: [] }]

  return prisma.experienceJourney.create({
    data: {
      title: title || t?.title || 'Untitled journey',
      description: t?.description ?? null,
      bannerTone: t?.tone ?? 'blue',
      status: 'DRAFT',
      createdById,
      modules: {
        create: modules.map((m, mi) => ({
          title: m.title,
          description: m.description ?? null,
          seq: mi + 1,
          steps: {
            create: m.steps.map((s, si) => {
              const program = s.learningTitle
                ? programs.find((p) => p.title.toLowerCase().includes(s.learningTitle!.toLowerCase()))
                : undefined
              const learning = s.type === 'LEARNING'
              // A course that does not exist yet becomes a link to Learning,
              // so the step still leads somewhere.
              return {
                title: s.title,
                body: s.body ?? null,
                type: learning && !program ? 'LINK' : s.type,
                url: learning ? (program ? null : '/dashboard/learning') : (s.url ?? null),
                programId: program?.id ?? null,
                required: s.required,
                dueDays: s.dueDays ?? null,
                minutes: s.minutes ?? null,
                seq: si + 1,
              }
            }),
          },
        })),
      },
    },
    select: { id: true },
  })
}

export async function assignJourney(opts: {
  journeyId: string
  employeeIds: string[]
  method: string
  assignedById: string | null
  assignedByName: string | null
}) {
  const journey = await prisma.experienceJourney.findUnique({
    where: { id: opts.journeyId }, select: { id: true, title: true, status: true },
  })
  if (!journey || journey.status !== 'PUBLISHED') return { assigned: 0, already: 0, published: false }

  const ids = [...new Set(opts.employeeIds)]
  const existing = await prisma.experienceAssignment.findMany({
    where: { journeyId: journey.id, employeeId: { in: ids } }, select: { employeeId: true },
  })
  const have = new Set(existing.map((e) => e.employeeId))
  const fresh = ids.filter((id) => !have.has(id))

  if (fresh.length > 0) {
    await prisma.experienceAssignment.createMany({
      data: fresh.map((employeeId) => ({
        journeyId: journey.id, employeeId, method: opts.method, assignedById: opts.assignedById,
      })),
      skipDuplicates: true,
    })
    const rows = await prisma.experienceAssignment.findMany({
      where: { journeyId: journey.id, employeeId: { in: fresh } }, select: { id: true, employeeId: true },
    })
    await Promise.all(rows.map((r) => notify({
      employeeId: r.employeeId,
      type: 'GENERAL',
      title: `New journey: ${journey.title}`,
      message: opts.assignedByName
        ? `${opts.assignedByName} shared a journey with you. Take it one step at a time.`
        : 'A journey has been set up for you. Take it one step at a time.',
      link: `/dashboard/my-journeys/${r.id}`,
    })))
  }
  return { assigned: fresh.length, already: have.size, published: true }
}

/** Hands out every published journey set to assign itself on this trigger. */
export async function autoAssignJourneys(trigger: 'ONBOARDING' | 'NEW_MANAGER', employeeId: string) {
  const journeys = await prisma.experienceJourney.findMany({
    where: { autoAssign: trigger, status: 'PUBLISHED' }, select: { id: true },
  })
  for (const j of journeys) {
    await assignJourney({
      journeyId: j.id,
      employeeIds: [employeeId],
      method: trigger === 'ONBOARDING' ? 'AUTO_ONBOARDING' : 'AUTO_NEW_MANAGER',
      assignedById: null,
      assignedByName: null,
    })
  }
  return journeys.length
}

export function resolveStepUrl(url: string | null, employeeId: string): string | null {
  return url ? url.replace('{profile}', `/dashboard/employees/${employeeId}`) : null
}

export interface ProgressStep {
  id: string
  moduleId: string
  title: string
  body: string | null
  type: string
  url: string | null
  programId: string | null
  required: boolean
  minutes: number | null
  due: Date | null
  completedAt: Date | null
}
export interface ProgressModule {
  id: string
  title: string
  description: string | null
  steps: ProgressStep[]
  minutes: number
}

type JourneyShape = {
  modules: {
    id: string; title: string; description: string | null; seq: number
    steps: {
      id: string; title: string; body: string | null; type: string; url: string | null; programId: string | null
      required: boolean; minutes: number | null; dueDays: number | null; seq: number
    }[]
  }[]
}

export function buildProgress(
  journey: JourneyShape,
  assignment: { assignedAt: Date; progress: { stepId: string; completedAt: Date | null }[] } | null,
  employeeId: string,
) {
  const done = new Map((assignment?.progress ?? []).map((p) => [p.stepId, p.completedAt]))
  const base = assignment?.assignedAt ?? new Date()
  const modules: ProgressModule[] = [...journey.modules]
    .sort((a, b) => a.seq - b.seq)
    .map((m) => {
      const steps = [...m.steps].sort((a, b) => a.seq - b.seq).map((s) => ({
        id: s.id,
        moduleId: m.id,
        title: s.title,
        body: s.body,
        type: s.type,
        url: resolveStepUrl(s.url, employeeId),
        programId: s.programId,
        required: s.required,
        minutes: s.minutes,
        due: s.dueDays != null ? new Date(base.getTime() + s.dueDays * DAY) : null,
        completedAt: done.get(s.id) ?? null,
      }))
      return { id: m.id, title: m.title, description: m.description, steps, minutes: steps.reduce((x, s) => x + (s.minutes ?? 0), 0) }
    })
  const all = modules.flatMap((m) => m.steps)
  const required = all.filter((s) => s.required)
  const requiredDone = required.filter((s) => s.completedAt).length
  const next = required.find((s) => !s.completedAt) ?? all.find((s) => !s.completedAt) ?? null
  return {
    modules,
    steps: all,
    requiredTotal: required.length,
    requiredDone,
    remaining: required.length - requiredDone,
    pct: required.length ? Math.round((requiredDone / required.length) * 100) : all.length ? Math.round((all.filter((s) => s.completedAt).length / all.length) * 100) : 0,
    next,
  }
}

/** Marks the assignment started, and complete once every required step is. */
export async function refreshAssignment(assignmentId: string) {
  const a = await prisma.experienceAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true, startedAt: true, completedAt: true,
      journey: { select: { modules: { select: { steps: { where: { required: true }, select: { id: true } } } } } },
      progress: { where: { completedAt: { not: null } }, select: { stepId: true } },
    },
  })
  if (!a) return
  const required = a.journey.modules.flatMap((m) => m.steps.map((s) => s.id))
  const doneIds = new Set(a.progress.map((p) => p.stepId))
  const complete = required.length > 0 ? required.every((id) => doneIds.has(id)) : doneIds.size > 0
  await prisma.experienceAssignment.update({
    where: { id: a.id },
    data: {
      startedAt: a.startedAt ?? new Date(),
      completedAt: complete ? (a.completedAt ?? new Date()) : null,
    },
  })
}
