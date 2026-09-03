/**
 * The engagement pulse.
 *
 *   GET            the round open to me, and whether I have answered
 *   POST           submit my answers (once per round)
 *   PATCH          HR: open, close, or create a round
 *
 * Results are not served here — see /api/pulse/[id]/results, which enforces
 * the response floor. Keeping them apart means the endpoint that knows who
 * answered is never the endpoint that returns what was said.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { DRIVER_KEYS } from '@/lib/pulse'

export async function GET(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.employee.findFirst({
    where: { userId: payload.userId }, select: { id: true },
  })

  const now = new Date()
  const open = await prisma.pulseRound.findFirst({
    where: { status: 'OPEN', opensAt: { lte: now }, closesAt: { gte: now } },
    orderBy: { opensAt: 'desc' },
    select: { id: true, title: true, opensAt: true, closesAt: true },
  })

  let answered = false
  if (open && me) {
    answered = (await prisma.pulseResponse.count({
      where: { roundId: open.id, employeeId: me.id },
    })) > 0
  }

  const rounds = payload.role === 'HR_ADMIN' || payload.role === 'EXECUTIVE'
    ? await prisma.pulseRound.findMany({
      orderBy: { opensAt: 'desc' },
      select: {
        id: true, title: true, status: true, opensAt: true, closesAt: true,
        _count: { select: { responses: true } },
      },
    })
    : []

  return NextResponse.json({ open, answered, canAnswer: !!me, rounds })
}

export async function POST(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.employee.findFirst({
    where: { userId: payload.userId }, select: { id: true },
  })
  if (!me) return NextResponse.json({ error: 'No employee record on this account.' }, { status: 400 })

  let body: { roundId?: string; enps?: number; scores?: Record<string, number>; comment?: string } = {}
  try { body = await request.json() } catch { /* validated below */ }

  const now = new Date()
  const round = body.roundId
    ? await prisma.pulseRound.findUnique({ where: { id: body.roundId } })
    : null
  if (!round || round.status !== 'OPEN' || round.opensAt > now || round.closesAt < now) {
    return NextResponse.json({ error: 'That round is not open.' }, { status: 400 })
  }

  const scores: Record<string, number> = {}
  for (const k of DRIVER_KEYS) {
    const v = body.scores?.[k]
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5) scores[k] = v
  }
  if (Object.keys(scores).length === 0) {
    return NextResponse.json({ error: 'Answer at least one question.' }, { status: 400 })
  }

  const enps = typeof body.enps === 'number' && Number.isInteger(body.enps)
    && body.enps >= 0 && body.enps <= 10 ? body.enps : null

  try {
    await prisma.pulseResponse.create({
      data: {
        roundId: round.id,
        employeeId: me.id,
        enps,
        scores,
        comment: typeof body.comment === 'string' && body.comment.trim()
          ? body.comment.trim().slice(0, 2000)
          : null,
      },
    })
  } catch {
    return NextResponse.json({ error: 'You have already answered this round.' }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  let body: { action?: string; id?: string; title?: string; opensAt?: string; closesAt?: string } = {}
  try { body = await request.json() } catch { /* validated below */ }

  if (body.action === 'create') {
    const opens = body.opensAt ? new Date(body.opensAt + 'T00:00:00Z') : new Date()
    const closes = body.closesAt
      ? new Date(body.closesAt + 'T23:59:59Z')
      : new Date(opens.getTime() + 14 * 86_400_000)
    const round = await prisma.pulseRound.create({
      data: {
        title: (body.title?.trim() || quarterLabel(opens)).slice(0, 120),
        opensAt: opens,
        closesAt: closes,
        status: 'OPEN',
      },
      select: { id: true },
    })
    return NextResponse.json({ id: round.id })
  }

  if ((body.action === 'open' || body.action === 'close') && body.id) {
    await prisma.pulseRound.update({
      where: { id: body.id },
      data: { status: body.action === 'open' ? 'OPEN' : 'CLOSED' },
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}

/** "Q3 2026" — the default name for a quarterly pulse. */
function quarterLabel(d: Date): string {
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`
}
