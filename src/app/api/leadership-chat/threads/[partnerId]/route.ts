import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { canUseLeadershipChat, threadKeyFor } from '@/lib/can-message'
import { requireChatAccess } from '../../_access'

/**
 * GET  /api/leadership-chat/threads/[partnerId]
 *   Fetch the full conversation. Marks the caller's received messages as
 *   read on each load (cheap two-statement upsert).
 *
 * POST /api/leadership-chat/threads/[partnerId]
 *   Send a new message. Body: { body: string } (max 5000 chars).
 *   Also fires a notification to the recipient.
 *
 * Both endpoints require senior-staff eligibility on BOTH ends — you
 * can't DM someone who can't see the inbox.
 */

async function loadPartnerOrFail(partnerId: string) {
  if (!partnerId) return { ok: false as const, response: NextResponse.json({ error: 'partnerId required' }, { status: 400 }) }
  const partner = await prisma.employee.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      fullName: true,
      designation: true,
      photoUrl: true,
      user: { select: { role: true } },
      position: { select: { level: true } },
    },
  })
  if (!partner) return { ok: false as const, response: NextResponse.json({ error: 'Partner not found' }, { status: 404 }) }
  if (!canUseLeadershipChat(partner.user?.role ?? null, partner.designation, partner.position?.level ?? null)) {
    return { ok: false as const, response: NextResponse.json({ error: 'Recipient not eligible' }, { status: 403 }) }
  }
  return { ok: true as const, partner }
}

export async function GET(_req: NextRequest, { params }: { params: { partnerId: string } }) {
  const gate = await requireChatAccess()
  if (!gate.ok) return gate.response
  const { access } = gate

  const partnerCheck = await loadPartnerOrFail(params.partnerId)
  if (!partnerCheck.ok) return partnerCheck.response
  const partner = partnerCheck.partner

  if (partner.id === access.employeeId) {
    return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 })
  }

  const tk = threadKeyFor(access.employeeId, partner.id)

  const messages = await prisma.directMessage.findMany({
    where: { threadKey: tk },
    orderBy: { sentAt: 'asc' },
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      body: true,
      sentAt: true,
      readAt: true,
      editedAt: true,
      deletedAt: true,
    },
  })

  // Mark all unread messages addressed to the caller as read.
  await prisma.directMessage.updateMany({
    where: {
      threadKey: tk,
      recipientId: access.employeeId,
      readAt: null,
      deletedAt: null,
    },
    data: { readAt: new Date() },
  })

  return NextResponse.json({
    partner: {
      id: partner.id,
      fullName: partner.fullName,
      designation: partner.designation,
      photoUrl: partner.photoUrl,
    },
    messages: messages.map((m) => ({
      ...m,
      body: m.deletedAt ? '(deleted)' : m.body,
    })),
  })
}

export async function POST(request: NextRequest, { params }: { params: { partnerId: string } }) {
  const gate = await requireChatAccess()
  if (!gate.ok) return gate.response
  const { access } = gate

  const partnerCheck = await loadPartnerOrFail(params.partnerId)
  if (!partnerCheck.ok) return partnerCheck.response
  const partner = partnerCheck.partner

  if (partner.id === access.employeeId) {
    return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const text = typeof (body as { body?: unknown })?.body === 'string'
    ? ((body as { body: string }).body).trim()
    : ''
  if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 })
  if (text.length > 5000) {
    return NextResponse.json({ error: 'Message too long (max 5000 chars)' }, { status: 400 })
  }

  const tk = threadKeyFor(access.employeeId, partner.id)

  const message = await prisma.directMessage.create({
    data: {
      senderId: access.employeeId,
      recipientId: partner.id,
      threadKey: tk,
      body: text,
    },
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      body: true,
      sentAt: true,
      readAt: true,
      editedAt: true,
      deletedAt: true,
    },
  })

  // ── Notify the recipient (best-effort) ─────────────────────────────
  const sender = await prisma.employee.findUnique({
    where: { id: access.employeeId },
    select: { fullName: true },
  })
  const preview = text.length > 80 ? text.slice(0, 80) + '…' : text
  await notify({
    employeeId: partner.id,
    type: 'GENERAL',
    title: `${sender?.fullName ?? 'Someone'} sent you a message`,
    message: preview,
    link: `/dashboard/leadership-chat?with=${access.employeeId}`,
  })

  return NextResponse.json({ message }, { status: 201 })
}
