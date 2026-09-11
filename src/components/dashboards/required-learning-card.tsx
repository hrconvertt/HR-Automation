/**
 * Awaiting your action — the required learning somebody still owes.
 *
 * Shaped after the card at the top of Workday's home page: each course HR has
 * sent you and you have not finished, soonest deadline first, with the due
 * date on it — and "Overdue" once that date has passed. It renders nothing
 * when there is nothing owed, so an empty card never takes up the page.
 */
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { BookOpen, ArrowUpRight } from 'lucide-react'

/**
 * Kept out of the component so the clock is read in an ordinary function, not
 * during render.
 */
async function load(employeeId: string) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const rows = await prisma.trainingRecord.findMany({
    where: { employeeId, required: true, status: { not: 'COMPLETED' } },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    include: { program: { select: { id: true, title: true } } },
    take: 6,
  })
  return rows.map((r) => ({
    id: r.id,
    programId: r.program.id,
    title: r.program.title,
    status: r.status,
    due: r.dueDate
      ? r.dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
      : null,
    overdue: !!r.dueDate && r.dueDate < today,
  }))
}

export async function RequiredLearningCard({ employeeId }: { employeeId: string }) {
  const rows = await load(employeeId)
  if (rows.length === 0) return null

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Awaiting your action</h2>
        <Link href="/dashboard/learning?tab=my" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
          My Learning <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <ul className="mt-2 divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/dashboard/learning/programs/${r.programId}`} className="flex items-center gap-3 py-3 group">
              <span className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-4 h-4 text-slate-600" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900 group-hover:underline truncate">
                  Required Learning: {r.title}
                </span>
                <span className="flex items-center gap-2 mt-1">
                  {r.due && (
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                      r.overdue ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'
                    }`}>
                      {r.overdue ? 'Overdue' : 'Due'} {r.due}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500">
                    {r.status === 'IN_PROGRESS' ? 'In progress' : r.status === 'FAILED' ? 'Quiz not passed — try again' : 'Not started'}
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
