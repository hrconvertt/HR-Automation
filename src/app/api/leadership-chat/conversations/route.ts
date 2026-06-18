import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireChatAccess } from '../_access'

/**
 * GET /api/leadership-chat/conversations
 *
 * List distinct thread partners for the caller. Returns one row per
 * conversation with last-message preview + unread count.
 *
 * Naive but correct: pull every DM the caller is part of (capped at the
 * last 2000), group in JS by threadKey. Convertt is small; threads will
 * total in the dozens, not thousands.
 */
export async function GET() {
  const gate = await requireChatAccess()
  if (!gate.ok) return gate.response
  const { access } = gate

  const messages = await prisma.directMessage.findMany({
    where: {
      OR: [{ senderId: access.employeeId }, { recipientId: access.employeeId }],
    },
    orderBy: { sentAt: 'desc' },
    take: 2000,
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      threadKey: true,
      body: true,
      sentAt: true,
      readAt: true,
      deletedAt: true,
    },
  })

  // Collect partner IDs to fetch profiles in one round trip.
  const partnerIds = new Set<string>()
  for (const m of messages) {
    const partner = m.senderId === access.employeeId ? m.recipientId : m.senderId
    partnerIds.add(partner)
  }
  const partners = await prisma.employee.findMany({
    where: { id: { in: Array.from(partnerIds) } },
    select: {
      id: true,
      fullName: true,
      designation: true,
      photoUrl: true,
    },
  })
  const partnerById = new Map(partners.map((p) => [p.id, p]))

  // Group by threadKey, first row wins (already sorted desc).
  type Convo = {
    partnerId: string
    partner: { id: string; fullName: string; designation: string | null; photoUrl: string | null } | null
    lastMessage: string
    lastSentAt: Date
    lastSenderId: string
    unreadCount: number
  }
  const convos = new Map<string, Convo>()
  for (const m of messages) {
    const partnerId = m.senderId === access.employeeId ? m.recipientId : m.senderId
    let c = convos.get(m.threadKey)
    if (!c) {
      c = {
        partnerId,
        partner: partnerById.get(partnerId) ?? null,
        lastMessage: m.deletedAt ? '(deleted)' : m.body,
        lastSentAt: m.sentAt,
        lastSenderId: m.senderId,
        unreadCount: 0,
      }
      convos.set(m.threadKey, c)
    }
    if (m.recipientId === access.employeeId && !m.readAt && !m.deletedAt) {
      c.unreadCount += 1
    }
  }

  const list = Array.from(convos.values()).sort(
    (a, b) => b.lastSentAt.getTime() - a.lastSentAt.getTime(),
  )

  return NextResponse.json({ conversations: list })
}
