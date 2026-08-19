/**
 * One event, in full.
 *
 * The plan is spread across tabs because it is genuinely several documents —
 * what the event is, what is served, how the room looks, who is doing what,
 * what it costs — and the proposal at the end is a rendering of all of them.
 * Nothing is retyped into the proposal; it is generated from these fields, so
 * changing the plan and regenerating cannot leave the two disagreeing.
 */

import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EventDetail } from '../_components/event-detail'

interface PageProps { params: Promise<{ id: string }> }

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE') {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">
          Event planning is visible to HR and the executive team.
        </p>
      </div>
    )
  }

  const [event, staff] = await Promise.all([
    prisma.companyEvent.findUnique({
      where: { id },
      include: {
        costItems: { orderBy: { createdAt: 'asc' } },
        eventRoles: { orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, designation: true },
      orderBy: { fullName: 'asc' },
    }),
  ])
  if (!event) notFound()

  return (
    <EventDetail
      isHR={role === 'HR_ADMIN'}
      staff={staff}
      event={{
        id: event.id,
        title: event.title,
        category: event.category,
        status: event.status,
        eventDate: event.eventDate.toISOString().slice(0, 10),
        startTime: event.startTime ?? '',
        endTime: event.endTime ?? '',
        location: event.location ?? '',
        expectedGuests: event.expectedGuests,
        description: event.description ?? '',
        overview: event.overview ?? '',
        objectives: event.objectives ?? '',
        refreshments: event.refreshments ?? '',
        activities: event.activities ?? '',
        rewards: event.rewards ?? '',
        decoration: event.decoration ?? '',
        runOfShow: event.runOfShow ?? '',
        requirements: event.requirements ?? '',
        successMetrics: event.successMetrics ?? '',
        whyItMatters: event.whyItMatters ?? '',
        notes: event.notes ?? '',
        currency: event.currency,
        financeOwnerId: event.financeOwnerId ?? '',
        proposalBody: event.proposalBody,
        proposalAt: event.proposalAt?.toISOString() ?? null,
        approvedByName: event.approvedByName ?? '',
        costItems: event.costItems.map((c) => ({
          label: c.label, category: c.category,
          quantity: c.quantity, unitCost: c.unitCost,
          actual: c.actual, notes: c.notes ?? '',
        })),
        eventRoles: event.eventRoles.map((r) => ({
          role: r.role, headcount: r.headcount,
          responsibility: r.responsibility ?? '', employeeId: r.employeeId ?? '',
        })),
      }}
    />
  )
}
