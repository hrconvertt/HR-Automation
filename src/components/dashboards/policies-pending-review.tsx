/**
 * Dashboard card — "Policies awaiting your review".
 *
 * Server component: looks up PolicyReview rows where the current user is the
 * reviewer and status=PENDING. Used on Executive + HR home pages. Renders
 * nothing if the reviewer has no pending items.
 */
import Link from 'next/link'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ClipboardCheck, ArrowRight } from 'lucide-react'

export async function PoliciesPendingReview() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) return null
  const payload = verifyToken(token)
  if (!payload) return null

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { employee: { select: { id: true } } },
  })
  if (!user?.employee) return null

  const pending = await prisma.policyReview.findMany({
    where: {
      reviewerId: user.employee.id,
      status: 'PENDING',
      // Only IN_REVIEW policies — a rejected/restarted policy may leave
      // stale PENDING rows we don't want to surface.
      policy: { status: 'IN_REVIEW' },
    },
    include: {
      policy: { select: { id: true, title: true, category: true, submittedForReviewAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (pending.length === 0) return null

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardCheck className="w-4 h-4 text-slate-700" />
        <p className="text-sm font-semibold text-slate-900">
          Policies awaiting your review · {pending.length}
        </p>
      </div>
      <ul className="space-y-2">
        {pending.map((r) => (
          <li key={r.id}>
            <Link
              href={`/dashboard/policies/${r.policy.id}`}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white border border-slate-100 hover:border-slate-200 transition"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{r.policy.title}</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {r.policy.category.replace(/_/g, ' ')} ·{' '}
                  {r.policy.submittedForReviewAt
                    ? `submitted ${new Date(r.policy.submittedForReviewAt).toLocaleDateString()}`
                    : 'awaiting your decision'}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-700 flex-shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
