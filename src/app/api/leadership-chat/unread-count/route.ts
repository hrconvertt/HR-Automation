import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireChatAccess } from '../_access'

/**
 * GET /api/leadership-chat/unread-count
 *
 * Cheap count used by the sidebar nav badge. Polled every ~30s by the
 * chrome. Returns 0 silently for non-eligible users (the badge is hidden
 * anyway).
 */
export async function GET() {
  const gate = await requireChatAccess()
  if (!gate.ok) {
    // Non-eligible: report 0 so the client doesn't render a badge.
    return NextResponse.json({ count: 0 })
  }
  const { access } = gate

  const count = await prisma.directMessage.count({
    where: {
      recipientId: access.employeeId,
      readAt: null,
      deletedAt: null,
    },
  })
  return NextResponse.json({ count })
}
