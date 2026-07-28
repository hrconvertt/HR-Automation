import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guardHrAction, pushActivity } from '@/lib/termination-helpers'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await guardHrAction(request)
  if (!guard.ok) return guard.response
  const { access } = guard

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const heldAtRaw = body.heldAt ? String(body.heldAt) : ''
  const notes = String(body.notes ?? '').trim()
  if (!heldAtRaw) return NextResponse.json({ error: 'heldAt required' }, { status: 400 })
  if (!notes) return NextResponse.json({ error: 'notes required' }, { status: 400 })
  const heldAt = new Date(heldAtRaw)
  if (Number.isNaN(heldAt.getTime())) return NextResponse.json({ error: 'invalid heldAt' }, { status: 400 })

  const termination = await prisma.termination.findUnique({ where: { id } })
  if (!termination) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (termination.status === 'CANCELLED' || termination.status === 'COMPLETED') {
    return NextResponse.json({ error: 'Termination is closed' }, { status: 400 })
  }

  const activity = pushActivity(termination.activityLog, {
    at: new Date().toISOString(),
    by: access.actorName,
    action: 'MEETING_HELD',
    note: notes.slice(0, 200),
  })

  const updated = await prisma.termination.update({
    where: { id },
    data: {
      meetingHeldAt: heldAt,
      meetingNotes: notes,
      status: 'MEETING_HELD',
      activityLog: activity,
    },
  })

  return NextResponse.json({ termination: updated })
}
