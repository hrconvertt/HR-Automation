/**
 * PATCH /api/sandwich/[id] — waive it, reinstate it, retitle the warning, or
 *                            correct the amount.
 * POST  /api/sandwich/[id]  — send the warning email.
 *
 * The letter is editable before it goes. A deduction always has a story behind
 * it that no template knows — someone was in hospital, someone had told their
 * lead and it never reached HR — so whatever HR has on screen is what gets
 * sent, not a freshly generated copy.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { warningHtml, buildWarning } from '@/lib/sandwich-server'
import type { SandwichTrigger } from '@/lib/sandwich'

interface RouteParams { params: Promise<{ id: string }> }

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (payload.role !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  }
  if (request.cookies.get('hr_preview_role')?.value) {
    return { error: NextResponse.json({ error: 'Leave preview mode to decide this' }, { status: 403 }) }
  }
  return { payload }
}

const isDeliverable = (e: string | null | undefined): e is string =>
  !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  // Rebuild the letter from the record. An edited letter can drift from the
  // facts it describes — a draft went out naming August dates for a July
  // absence and four unpaid days where the record says three — and once it has
  // drifted there is no way back to the truth by hand.
  if (body.regenerate) {
    const row = await prisma.sandwichDeduction.findUnique({
      where: { id },
      include: {
        employee: { select: { fullName: true } },
        leaveRequest: { select: { fromDate: true, toDate: true, leaveType: true } },
      },
    })
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const w = buildWarning({
      fullName: row.employee.fullName,
      trigger: row.trigger as SandwichTrigger,
      triggerDate: row.triggerDate.toISOString().slice(0, 10),
      dates: JSON.parse(row.dates),
      days: row.days,
      amount: row.amount,
      perDayAmount: row.perDayAmount,
      divisorDays: row.divisorDays,
      month: row.month,
      year: row.year,
      leaveType: row.leaveRequest?.leaveType,
      informed: false,
      leaveFrom: row.leaveRequest?.fromDate.toISOString().slice(0, 10),
      leaveTo: row.leaveRequest?.toDate.toISOString().slice(0, 10),
    })
    const fresh = await prisma.sandwichDeduction.update({
      where: { id }, data: { warningSubject: w.subject, warningBody: w.body },
    })
    return NextResponse.json({ ok: true, deduction: fresh })
  }

  const data: Record<string, unknown> = {}
  if (body.status === 'APPLIED' || body.status === 'WAIVED') data.status = body.status
  if (typeof body.note === 'string') data.note = body.note.trim().slice(0, 1000) || null
  if (typeof body.warningSubject === 'string') data.warningSubject = body.warningSubject.slice(0, 300)
  if (typeof body.warningBody === 'string') data.warningBody = body.warningBody.slice(0, 20000)
  // Correcting the amount by hand — the arithmetic is only ever a starting
  // point, and a part-month joiner or a mid-month raise moves it.
  if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
    const n = Number(body.amount)
    if (Number.isFinite(n) && n >= 0) data.amount = Math.round(n * 100) / 100
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  }

  const row = await prisma.sandwichDeduction.update({ where: { id }, data })
  return NextResponse.json({ ok: true, deduction: row })
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const row = await prisma.sandwichDeduction.findUnique({
    where: { id },
    include: { employee: { select: { fullName: true, email: true } } },
  })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Whatever is on screen wins over what is stored.
  const subject = typeof body.subject === 'string' && body.subject.trim()
    ? body.subject.trim().slice(0, 300)
    : row.warningSubject ?? 'Sandwich leave deduction'
  const text = typeof body.body === 'string' && body.body.trim()
    ? body.body.slice(0, 20000)
    : row.warningBody ?? ''

  const to = typeof body.to === 'string' && body.to.trim() ? body.to.trim() : row.employee.email
  if (!isDeliverable(to)) {
    return NextResponse.json(
      { error: `No usable email address for ${row.employee.fullName}` },
      { status: 400 },
    )
  }

  const result = await sendEmail({ to, subject, html: warningHtml(text), text })
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Send failed' }, { status: 502 })
  }

  await prisma.sandwichDeduction.update({
    where: { id },
    data: {
      warningSubject: subject,
      warningBody: text,
      warningSentAt: new Date(),
      warningSentTo: to,
    },
  })

  // 'queued' means SMTP is not configured — the message is stored, not
  // delivered. Saying "sent" for that would be a lie HR acts on.
  return NextResponse.json({
    ok: true,
    to,
    delivered: result.transport === 'smtp',
    transport: result.transport,
  })
}

/**
 * DELETE /api/sandwich/[id] — remove it outright.
 *
 * Waiving keeps the record and stops the charge, which is right when a real
 * decision was made. This is for the other case: one that should never have
 * existed, so there is nothing worth keeping a history of.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  await prisma.sandwichDeduction.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
