/**
 * Team highlights — who on your team owes required learning.
 *
 * Shaped after Workday's Team Highlights card: one row per person with the
 * course they have due soonest (and how many more), marked overdue once the
 * date has passed, and a way through to My Team's Learning. Renders nothing
 * when the whole team is clear.
 */
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getInitials } from '@/lib/utils'
import { DEPARTED_STATUSES } from '@/lib/learning-assign'

/** Read outside the component, so the clock is not read during render. */
async function load(managerEmployeeId: string) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const reports = await prisma.employee.findMany({
    where: { reportingManagerId: managerEmployeeId, deletedAt: null, status: { notIn: DEPARTED_STATUSES } },
    select: { id: true },
  })
  if (reports.length === 0) return []

  const rows = await prisma.trainingRecord.findMany({
    where: {
      employeeId: { in: reports.map((r) => r.id) },
      required: true,
      status: { not: 'COMPLETED' },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    include: {
      employee: { select: { id: true, fullName: true } },
      program: { select: { title: true } },
    },
  })

  // One row per person: their soonest deadline, and a count of the rest.
  const byPerson = new Map<string, { id: string; name: string; course: string; due: Date | null; more: number }>()
  for (const r of rows) {
    const got = byPerson.get(r.employee.id)
    if (got) { got.more++; continue }
    byPerson.set(r.employee.id, {
      id: r.employee.id, name: r.employee.fullName, course: r.program.title, due: r.dueDate, more: 0,
    })
  }
  return [...byPerson.values()].map((p) => ({
    ...p,
    dueLabel: p.due
      ? p.due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
      : null,
    overdue: !!p.due && p.due < today,
  }))
}

export async function TeamLearningCard({ managerEmployeeId }: { managerEmployeeId: string }) {
  const people = await load(managerEmployeeId)
  if (people.length === 0) return null

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Team highlights</h2>
        <span className="text-xs text-slate-500">
          {people.length} {people.length === 1 ? 'person has' : 'people have'} learning due
        </span>
      </div>
      <ul className="mt-2 divide-y divide-slate-100">
        {people.slice(0, 6).map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-3">
            <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">
              {getInitials(p.name)}
            </span>
            <span className="min-w-0 flex-1">
              <Link href={`/dashboard/employees/${p.id}`} className="block text-sm font-medium text-blue-700 hover:underline truncate">
                {p.name}
              </Link>
              <span className="block text-xs text-slate-500 truncate">
                {p.course} {p.overdue ? 'overdue' : 'due'}{p.dueLabel ? ` ${p.dueLabel}` : ''}
                {p.more ? ` · and ${p.more} more` : ''}
              </span>
            </span>
            <Link href="/dashboard/learning?tab=team" className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap">
              My Team&apos;s Learning
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
