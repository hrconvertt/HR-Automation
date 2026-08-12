/**
 * PATCH /api/employees/[id]/increment-track
 *
 * Which cycle this person is on — ANNUAL or BIANNUAL. Set from the Increments
 * table, because that is where you can see everyone side by side and notice
 * that someone is on the wrong one.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { INCREMENT_RULES, type IncrementTrack } from '@/lib/pay-split'

const CHOOSABLE: IncrementTrack[] = ['ANNUAL', 'BIANNUAL']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }
  const preview = request.cookies.get('hr_preview_role')?.value
  if (preview && preview !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to change this' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const track = String(body.incrementTrack ?? '').toUpperCase() as IncrementTrack

  // Probation-to-permanent is a one-off, not a cycle, so it is not on offer
  // here — nobody is "on" it.
  if (!CHOOSABLE.includes(track)) {
    return NextResponse.json(
      { error: `Track must be one of ${CHOOSABLE.join(', ')}` },
      { status: 400 },
    )
  }

  const employee = await prisma.employee.update({
    where: { id },
    data: { incrementTrack: track },
    select: { id: true, fullName: true, incrementTrack: true },
  })
  const rule = INCREMENT_RULES[track]
  return NextResponse.json({
    ok: true,
    employee,
    rule: { minPct: rule.minPct, maxPct: rule.maxPct, cycleMonths: rule.cycleMonths },
  })
}
