import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireChatAccess } from '../../_access'

/**
 * PATCH  /api/leadership-chat/messages/[id]
 *   Edit own message — only within 5 minutes of sending.
 *   Body: { body: string }
 *
 * DELETE /api/leadership-chat/messages/[id]
 *   Soft-delete own message (sets deletedAt; body shows "(deleted)").
 *   HR can delete any message.
 */

const EDIT_WINDOW_MS = 5 * 60 * 1000

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const gate = await requireChatAccess()
  if (!gate.ok) return gate.response
  const { access } = gate

  const existing = await prisma.directMessage.findUnique({
    where: { id },
    select: { id: true, senderId: true, sentAt: true, deletedAt: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.deletedAt) {
    return NextResponse.json({ error: 'Cannot edit deleted message' }, { status: 400 })
  }
  if (existing.senderId !== access.employeeId) {
    return NextResponse.json({ error: 'Not your message' }, { status: 403 })
  }
  if (Date.now() - existing.sentAt.getTime() > EDIT_WINDOW_MS) {
    return NextResponse.json({ error: 'Edit window expired (5 minutes)' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const text =
    typeof (body as { body?: unknown })?.body === 'string'
      ? ((body as { body: string }).body).trim()
      : ''
  if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 })
  if (text.length > 5000) {
    return NextResponse.json({ error: 'Message too long (max 5000 chars)' }, { status: 400 })
  }

  const message = await prisma.directMessage.update({
    where: { id },
    data: { body: text, editedAt: new Date() },
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

  return NextResponse.json({ message })
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const gate = await requireChatAccess()
  if (!gate.ok) return gate.response
  const { access } = gate

  const existing = await prisma.directMessage.findUnique({
    where: { id },
    select: { id: true, senderId: true, deletedAt: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.deletedAt) {
    return NextResponse.json({ ok: true })
  }

  // Sender can delete their own. HR can delete any.
  const isOwner = existing.senderId === access.employeeId
  const isHr = access.role === 'HR_ADMIN'
  if (!isOwner && !isHr) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }

  await prisma.directMessage.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
