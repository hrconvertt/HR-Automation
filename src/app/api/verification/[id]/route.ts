/**
 * PATCH  /api/verification/[id] — save the two columns, the contact, the outcome.
 * POST   /api/verification/[id] — log an email exchange.
 * DELETE /api/verification/[id] — remove the check and its correspondence.
 *
 * Emails are logged rather than sent. HR sends from their own mailbox, which is
 * where the reply lands and where the thread lives; the system's job is to keep
 * a record that survives someone leaving, not to become a second mail client.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { VERIFICATION_STATUSES, OUTCOMES, FIELD_BY_KEY } from '@/lib/background-verification'

interface RouteParams { params: Promise<{ id: string }> }

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = request.cookies.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN') return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  return { payload }
}

/** Keep only known field keys, so a stale tab cannot write junk into the JSON. */
function cleanAnswers(v: unknown): string {
  if (!v || typeof v !== 'object') return JSON.stringify({})
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!FIELD_BY_KEY.has(k)) continue
    if (typeof val !== 'string') continue
    const t = val.trim()
    if (t) out[k] = t.slice(0, 4000)
  }
  return JSON.stringify(out)
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const data: Record<string, unknown> = {}

  for (const f of ['employerName', 'contactName', 'contactRole', 'contactEmail',
    'contactPhone', 'decisionNote'] as const) {
    if (body[f] === undefined) continue
    const v = body[f]
    data[f] = typeof v === 'string' && v.trim() ? v.trim().slice(0, 2000) : null
  }
  if (body.employerName !== undefined && !data.employerName) {
    return NextResponse.json({ error: 'The employer needs a name' }, { status: 400 })
  }
  if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId || null

  if (typeof body.status === 'string'
      && (VERIFICATION_STATUSES as readonly string[]).includes(body.status)) {
    data.status = body.status
    // Statuses that mean something happened get their moment stamped, once.
    if (body.status === 'SENT') data.requestedAt = new Date()
    if (body.status === 'RESPONDED') data.respondedAt = new Date()
  }

  if (body.outcome !== undefined) {
    if (body.outcome === null || body.outcome === '') {
      data.outcome = null
      data.decidedAt = null
      data.decidedById = null
    } else if ((OUTCOMES as readonly string[]).includes(body.outcome)) {
      data.outcome = body.outcome
      data.decidedAt = new Date()
      data.decidedById = auth.payload!.userId
    }
  }

  if (body.consentAt !== undefined) {
    data.consentAt = body.consentAt ? new Date() : null
  }
  if (body.claimed !== undefined) data.claimedJson = cleanAnswers(body.claimed)
  if (body.verified !== undefined) data.verifiedJson = cleanAnswers(body.verified)

  const verification = await prisma.backgroundVerification.update({
    where: { id },
    data,
    include: {
      employee: { select: { id: true, fullName: true, employeeCode: true } },
      assignedTo: { select: { id: true, fullName: true } },
      emails: { orderBy: { occurredAt: 'asc' } },
    },
  })
  return NextResponse.json({ ok: true, verification })
}

/** Log one exchange. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const direction = body.direction === 'INBOUND' ? 'INBOUND' : 'OUTBOUND'
  const subject = String(body.subject ?? '').trim()
  const text = String(body.body ?? '').trim()
  if (!subject && !text) {
    return NextResponse.json({ error: 'An empty email is not a record' }, { status: 400 })
  }

  // A date typed by hand is local; store the instant it names.
  const occurredAt = body.occurredAt
    ? new Date(String(body.occurredAt))
    : new Date()

  const email = await prisma.verificationEmail.create({
    data: {
      verificationId: id,
      direction,
      fromAddress: String(body.fromAddress ?? '').slice(0, 320),
      toAddress: String(body.toAddress ?? '').slice(0, 320),
      subject: subject.slice(0, 500),
      body: text.slice(0, 50000),
      occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
      loggedById: auth.payload!.userId,
    },
  })

  // Logging the first outbound is what "sent" means; a reply is what
  // "responded" means. Neither should need a second click to record.
  const current = await prisma.backgroundVerification.findUnique({
    where: { id }, select: { status: true, requestedAt: true },
  })
  if (direction === 'OUTBOUND' && current?.status === 'NOT_STARTED') {
    await prisma.backgroundVerification.update({
      where: { id },
      data: { status: 'SENT', requestedAt: current.requestedAt ?? email.occurredAt },
    })
  }
  if (direction === 'INBOUND'
      && (current?.status === 'SENT' || current?.status === 'CHASING')) {
    await prisma.backgroundVerification.update({
      where: { id },
      data: { status: 'RESPONDED', respondedAt: email.occurredAt },
    })
  }

  return NextResponse.json({ ok: true, email }, { status: 201 })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  await prisma.backgroundVerification.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
