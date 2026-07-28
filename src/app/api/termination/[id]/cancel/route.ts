import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guardHrAction, pushActivity } from '@/lib/termination-helpers'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await guardHrAction(request)
  if (!guard.ok) return guard.response
  const { access } = guard

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const reason = String(body.reason ?? '').trim()

  const termination = await prisma.termination.findUnique({ where: { id } })
  if (!termination) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (
    termination.status === 'NOTICE_ISSUED' ||
    termination.status === 'IN_EXIT_CLEARANCE' ||
    termination.status === 'COMPLETED' ||
    termination.status === 'CANCELLED'
  ) {
    return NextResponse.json({ error: 'Cannot cancel after notice has been issued' }, { status: 400 })
  }

  const activity = pushActivity(termination.activityLog, {
    at: new Date().toISOString(),
    by: access.actorName,
    action: 'CANCELLED',
    note: reason || undefined,
  })

  const updated = await prisma.termination.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancellationReason: reason || null,
      activityLog: activity,
    },
  })

  return NextResponse.json({ termination: updated })
}
