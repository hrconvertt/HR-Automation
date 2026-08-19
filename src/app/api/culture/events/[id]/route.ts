/**
 * PATCH  /api/culture/events/[id] — edit the plan, the costs or the roles.
 * POST   /api/culture/events/[id] — generate the proposal from the plan.
 * DELETE /api/culture/events/[id] — remove it.
 *
 * Costs and roles are sent whole rather than one row at a time. The tabs edit
 * them as a table, and replacing the set is simpler to reason about than
 * diffing rows — there are never more than a dozen.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { EVENT_CATEGORIES, EVENT_STATUSES, COST_CATEGORIES } from '@/lib/event-presets'
import { buildProposal } from '@/lib/event-proposal'

interface RouteParams { params: Promise<{ id: string }> }

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (payload.role !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  }
  const preview = request.cookies.get('hr_preview_role')?.value
  if (preview && preview !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'Switch back to HR view to edit events' }, { status: 403 }) }
  }
  return { payload }
}

const TEXT_FIELDS = [
  'title', 'description', 'location', 'overview', 'objectives', 'refreshments',
  'activities', 'rewards', 'decoration', 'runOfShow', 'requirements',
  'successMetrics', 'whyItMatters', 'notes', 'startTime', 'endTime',
  'proposalBody', 'approvedByName',
] as const

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const data: Record<string, unknown> = {}
  for (const f of TEXT_FIELDS) {
    if (body[f] === undefined) continue
    const v = body[f]
    data[f] = typeof v === 'string' && v.trim() ? v.slice(0, 20000) : null
  }
  if (body.title !== undefined && !data.title) {
    return NextResponse.json({ error: 'An event needs a title' }, { status: 400 })
  }
  if ((EVENT_CATEGORIES as readonly string[]).includes(body.category)) data.category = body.category
  if ((EVENT_STATUSES as readonly string[]).includes(body.status)) data.status = body.status
  if (typeof body.currency === 'string' && body.currency.trim()) {
    data.currency = body.currency.trim().toUpperCase().slice(0, 8)
  }
  if (body.eventDate !== undefined) {
    const d = new Date(`${String(body.eventDate).slice(0, 10)}T00:00:00Z`)
    if (!Number.isNaN(d.getTime())) data.eventDate = d
  }
  if (body.expectedGuests !== undefined) {
    const n = Number(body.expectedGuests)
    data.expectedGuests = Number.isFinite(n) && n >= 0 ? Math.round(n) : null
  }
  if (body.financeOwnerId !== undefined) {
    data.financeOwnerId = body.financeOwnerId || null
  }
  // Approving is a decision with a date on it, not just a status.
  if (body.status === 'APPROVED') data.approvedAt = new Date()

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) {
      await tx.companyEvent.update({ where: { id }, data })
    }

    if (Array.isArray(body.costItems)) {
      await tx.eventCostItem.deleteMany({ where: { eventId: id } })
      const rows = body.costItems
        .filter((c: { label?: string }) => String(c?.label ?? '').trim())
        .map((c: Record<string, unknown>) => ({
          eventId: id,
          label: String(c.label).trim().slice(0, 200),
          category: (COST_CATEGORIES as readonly string[]).includes(String(c.category))
            ? String(c.category) : 'OTHER',
          quantity: Math.max(0, Number(c.quantity) || 0),
          unitCost: Math.max(0, Number(c.unitCost) || 0),
          actual: c.actual === '' || c.actual == null ? null : Math.max(0, Number(c.actual) || 0),
          notes: c.notes ? String(c.notes).slice(0, 500) : null,
        }))
      if (rows.length) await tx.eventCostItem.createMany({ data: rows })
    }

    if (Array.isArray(body.eventRoles)) {
      await tx.eventRole.deleteMany({ where: { eventId: id } })
      const rows = body.eventRoles
        .filter((r: { role?: string }) => String(r?.role ?? '').trim())
        .map((r: Record<string, unknown>) => ({
          eventId: id,
          role: String(r.role).trim().slice(0, 200),
          headcount: Math.max(1, Math.round(Number(r.headcount) || 1)),
          responsibility: r.responsibility ? String(r.responsibility).slice(0, 1000) : null,
          employeeId: r.employeeId ? String(r.employeeId) : null,
        }))
      if (rows.length) await tx.eventRole.createMany({ data: rows })
    }
  }, { timeout: 60000 })

  const event = await prisma.companyEvent.findUnique({
    where: { id },
    include: {
      costItems: true,
      eventRoles: { include: { employee: { select: { fullName: true } } } },
      financeOwner: { select: { id: true, fullName: true } },
    },
  })
  return NextResponse.json({ ok: true, event })
}

/** Generate the proposal from whatever the plan currently says. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params

  const event = await prisma.companyEvent.findUnique({
    where: { id },
    include: {
      costItems: true,
      eventRoles: { include: { employee: { select: { fullName: true } } } },
      financeOwner: { select: { fullName: true } },
    },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const me = await prisma.user.findUnique({
    where: { id: auth.payload!.userId },
    select: { employee: { select: { fullName: true, designation: true } } },
  })
  const proposedByName = me?.employee
    ? `${me.employee.fullName}${me.employee.designation ? `, ${me.employee.designation}` : ''}`
    : null

  const proposalBody = buildProposal({
    ...event,
    costs: event.costItems,
    roles: event.eventRoles.map((r) => ({
      role: r.role,
      headcount: r.headcount,
      responsibility: r.responsibility,
      personName: r.employee?.fullName ?? null,
    })),
    financeOwnerName: event.financeOwner?.fullName ?? null,
    proposedByName,
  })

  // Generating moves it out of planning — a proposal exists to be sent.
  const updated = await prisma.companyEvent.update({
    where: { id },
    data: {
      proposalBody,
      proposalAt: new Date(),
      proposedById: auth.payload!.userId,
      status: event.status === 'PLANNING' ? 'PROPOSED' : event.status,
    },
    select: { id: true, proposalBody: true, proposalAt: true, status: true },
  })
  return NextResponse.json({ ok: true, ...updated })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  await prisma.companyEvent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
