import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { Card } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { Bell } from 'lucide-react'

const LIFECYCLE_TYPES = new Set([
  'PROBATION_ALERT', 'REVIEW_FINALIZED', 'GENERAL',
])

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { employee: { select: { id: true } } },
  })
  const empId = user?.employee?.id
  if (!empId) return <div className="text-sm text-slate-500">No employee record linked.</div>

  const sp = await searchParams
  const filter = sp.filter ?? 'all'

  const where: { employeeId: string; isRead?: boolean; type?: { in: string[] } } = { employeeId: empId }
  if (filter === 'unread') where.isRead = false
  if (filter === 'lifecycle') where.type = { in: Array.from(LIFECYCLE_TYPES) }

  const items = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Bell className="w-5 h-5 text-slate-500" />
        <h1 className="text-xl font-semibold text-slate-900">Inbox</h1>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { k: 'all', l: 'All' },
          { k: 'unread', l: 'Unread' },
          { k: 'lifecycle', l: 'Lifecycle' },
        ].map((f) => (
          <Link
            key={f.k}
            href={`/dashboard/inbox?filter=${f.k}`}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${filter === f.k ? 'bg-slate-50 border-slate-100 text-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {f.l}
          </Link>
        ))}
      </div>

      <Card className="rounded-xl border-slate-200 divide-y divide-slate-100">
        {items.length === 0 ? (
          <p className="p-8 text-center text-slate-400 text-sm">No notifications.</p>
        ) : items.map((n) => (
          <div key={n.id} className={`p-4 flex items-start gap-3 ${n.isRead ? '' : 'bg-slate-50/30'}`}>
            <div className={`w-2 h-2 rounded-full mt-2 ${n.isRead ? 'bg-slate-300' : 'bg-slate-500'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">{n.title}</p>
                <p className="text-[11px] text-slate-400 flex-shrink-0">{formatDate(n.createdAt)}</p>
              </div>
              <p className="text-sm text-slate-600 mt-0.5">{n.message}</p>
              {n.link && (
                <Link href={n.link} className="text-xs text-slate-700 hover:underline mt-1 inline-block">
                  View â†’
                </Link>
              )}
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}
