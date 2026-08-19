/**
 * GET  /api/culture/events — every event, newest first.
 * POST /api/culture/events — start one, optionally from a preset.
 *
 * Starting from a preset copies its plan, its roles and its costs onto the new
 * event and then forgets where it came from. A preset is a head start, not a
 * link — editing Mango Day next year must not change what last year's event
 * says it cost.
 *
 * HR and executives.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { presetByKey, EVENT_CATEGORIES, EVENT_STATUSES } from '@/lib/event-presets'

async function gate(request: NextRequest, write = false) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = request.cookies.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE') {
    return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  }
  if (write && role !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  }
  return { payload }
}

export async function GET(request: NextRequest) {
  const auth = await gate(request)
  if (auth.error) return auth.error
  const events = await prisma.companyEvent.findMany({
    orderBy: { eventDate: 'desc' },
    include: {
      costItems: true,
      eventRoles: { include: { employee: { select: { fullName: true } } } },
      financeOwner: { select: { id: true, fullName: true } },
    },
  })
  return NextResponse.json({ events })
}

export async function POST(request: NextRequest) {
  const auth = await gate(request, true)
  if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))

  const preset = body.presetKey ? presetByKey(String(body.presetKey)) : undefined
  const title = String(body.title ?? preset?.title ?? '').trim()
  if (!title) {
    return NextResponse.json({ error: 'An event needs a title' }, { status: 400 })
  }

  const category = (EVENT_CATEGORIES as readonly string[]).includes(body.category)
    ? body.category
    : preset?.category ?? 'GENERAL'
  const status = (EVENT_STATUSES as readonly string[]).includes(body.status)
    ? body.status : 'PLANNING'

  // No date given means today, so the event has somewhere to sit on a
  // calendar until a real one is picked.
  const eventDate = body.eventDate
    ? new Date(`${String(body.eventDate).slice(0, 10)}T00:00:00Z`)
    : new Date()

  const event = await prisma.companyEvent.create({
    data: {
      title,
      category,
      status,
      eventDate: Number.isNaN(eventDate.getTime()) ? new Date() : eventDate,
      description: body.description ?? null,
      location: body.location ?? null,
      overview: preset?.overview ?? null,
      objectives: preset?.objectives ?? null,
      refreshments: preset?.refreshments ?? null,
      activities: preset?.activities ?? null,
      rewards: preset?.rewards ?? null,
      decoration: preset?.decoration ?? null,
      runOfShow: preset?.runOfShow ?? null,
      requirements: preset?.requirements ?? null,
      successMetrics: preset?.successMetrics ?? null,
      whyItMatters: preset?.whyItMatters ?? null,
      createdById: auth.payload!.userId,
      costItems: preset?.costs?.length
        ? { create: preset.costs.map((c) => ({
            label: c.label, category: c.category,
            quantity: c.quantity, unitCost: c.unitCost,
          })) }
        : undefined,
      eventRoles: preset?.roles?.length
        ? { create: preset.roles.map((r) => ({
            role: r.role, headcount: r.headcount, responsibility: r.responsibility,
          })) }
        : undefined,
    },
    select: { id: true, title: true },
  })

  return NextResponse.json({ ok: true, event }, { status: 201 })
}
