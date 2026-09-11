/**
 * Required learning — HR sending a course to a group, with a deadline.
 *
 * The part of a Workday learning campaign this system can actually carry out.
 * The course lands on each person's training record marked required, with a
 * due date; they get a notification saying so; and it sits on their home page
 * under "Awaiting your action" until it is done.
 *
 * What a Workday campaign does that this does not: release items on future
 * dates and push them to phones. Both need a scheduler that runs, and none of
 * the app's declared cron jobs has ever fired. Everything here goes out at
 * the moment HR presses Send.
 *
 * Server only.
 */
import { prisma } from '@/lib/prisma'
import { notifyMany } from '@/lib/notifications'

export const AUDIENCES = ['ALL', 'DEPARTMENT', 'EMPLOYEES'] as const
export type Audience = (typeof AUDIENCES)[number]

/** Statuses that mean someone has left, and so is not sent anything. */
export const DEPARTED_STATUSES = ['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF']

/** Who an audience is, today: current employees only, never the departed. */
export async function resolveAudience(
  audience: Audience,
  ref: { departmentId?: string | null; employeeIds?: string[] },
): Promise<string[]> {
  const base = { deletedAt: null, status: { notIn: DEPARTED_STATUSES } }
  let where
  if (audience === 'ALL') where = base
  else if (audience === 'DEPARTMENT') {
    if (!ref.departmentId) return []
    where = { ...base, departmentId: ref.departmentId }
  } else {
    const ids = [...new Set(ref.employeeIds ?? [])]
    if (ids.length === 0) return []
    where = { ...base, id: { in: ids } }
  }
  const rows = await prisma.employee.findMany({ where, select: { id: true } })
  return rows.map((r) => r.id)
}

export interface AssignResult {
  /** Everyone the audience resolved to. */
  audienceSize: number
  /** Sent it now — a new required record, or an existing one made required. */
  assigned: number
  /** Had already completed the course, so were left alone. */
  alreadyDone: number
  /** The deadline, as a date. */
  dueDate: string
}

export async function assignRequired(args: {
  programId: string
  programTitle: string
  audience: Audience
  departmentId?: string | null
  employeeIds?: string[]
  dueDays: number
  note?: string | null
  assignedByUserId: string
}): Promise<AssignResult> {
  const people = await resolveAudience(args.audience, args)

  // Dates are stored at UTC midnight across this app.
  const due = new Date()
  due.setUTCHours(0, 0, 0, 0)
  due.setUTCDate(due.getUTCDate() + args.dueDays)
  const dueIso = due.toISOString().slice(0, 10)

  if (people.length === 0) {
    return { audienceSize: 0, assigned: 0, alreadyDone: 0, dueDate: dueIso }
  }

  // Each person's newest record on the course, if they have one.
  const existing = await prisma.trainingRecord.findMany({
    where: { programId: args.programId, employeeId: { in: people } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, employeeId: true, status: true },
  })
  const latest = new Map<string, { id: string; status: string }>()
  for (const r of existing) if (!latest.has(r.employeeId)) latest.set(r.employeeId, r)

  const toCreate: string[] = []
  const toUpdate: string[] = []
  const notifyIds: string[] = []
  let alreadyDone = 0
  for (const employeeId of people) {
    const r = latest.get(employeeId)
    // Somebody who has already finished it owes nothing; sending it again
    // would put a finished course back on their list.
    if (r?.status === 'COMPLETED') { alreadyDone++; continue }
    if (r) toUpdate.push(r.id)
    else toCreate.push(employeeId)
    notifyIds.push(employeeId)
  }

  await prisma.$transaction([
    ...(toCreate.length
      ? [prisma.trainingRecord.createMany({
        data: toCreate.map((employeeId) => ({
          employeeId,
          programId: args.programId,
          startDate: new Date(),
          status: 'ENROLLED',
          required: true,
          dueDate: due,
          assignedById: args.assignedByUserId,
        })),
      })]
      : []),
    ...(toUpdate.length
      ? [prisma.trainingRecord.updateMany({
        where: { id: { in: toUpdate } },
        data: { required: true, dueDate: due, assignedById: args.assignedByUserId },
      })]
      : []),
    prisma.learningAssignment.create({
      data: {
        programId: args.programId,
        audience: args.audience,
        ...(args.audience === 'DEPARTMENT' ? { audienceRef: { departmentId: args.departmentId ?? null } } : {}),
        ...(args.audience === 'EMPLOYEES' ? { audienceRef: { employeeIds: args.employeeIds ?? [] } } : {}),
        dueDays: args.dueDays,
        note: args.note ?? null,
        assigned: notifyIds.length,
        createdById: args.assignedByUserId,
      },
    }),
  ])

  const dueLabel = due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  if (notifyIds.length) {
    await notifyMany(notifyIds, {
      type: 'LEARNING_ASSIGNED',
      title: `Required learning: ${args.programTitle}`,
      message:
        `You have new content available — please complete it within the next ${args.dueDays} days, by ${dueLabel}.`
        + (args.note ? ` ${args.note}` : ''),
      link: `/dashboard/learning/programs/${args.programId}`,
    })
  }

  return { audienceSize: people.length, assigned: notifyIds.length, alreadyDone, dueDate: dueIso }
}
