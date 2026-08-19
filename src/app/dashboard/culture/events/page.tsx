/**
 * Events — the catalogue Convertt runs from, and everything planned.
 *
 * Two ways in, because both are real: start from one of the events the company
 * already runs and adjust it, or add something new from scratch. The presets
 * carry the plan that gets retyped every year — the Mango Party refreshments,
 * the cricket roles, the Eid run of show.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CultureHeader } from '../_components/culture-header'
import { EventCatalogue } from './_components/event-catalogue'

export default async function CultureEventsPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  const isHR = role === 'HR_ADMIN'

  const events = await prisma.companyEvent.findMany({
    orderBy: { eventDate: 'desc' },
    include: {
      costItems: { select: { quantity: true, unitCost: true, actual: true } },
      _count: { select: { eventRoles: true } },
    },
  })

  const rows = events.map((e) => ({
    id: e.id,
    title: e.title,
    category: e.category,
    status: e.status,
    eventDate: e.eventDate.toISOString(),
    location: e.location,
    hasProposal: !!e.proposalBody,
    roleCount: e._count.eventRoles,
    currency: e.currency,
    budget: e.costItems.reduce((n, c) => n + c.quantity * c.unitCost, 0),
    actual: e.costItems.some((c) => c.actual != null)
      ? e.costItems.reduce((n, c) => n + (c.actual ?? 0), 0)
      : null,
  }))

  return (
    <div className="space-y-5">
      <CultureHeader subtitle="Company events, retreats and town halls." />
      <EventCatalogue events={rows} isHR={isHR} />
    </div>
  )
}
