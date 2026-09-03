/**
 * GET /api/pulse/[id]/results — what a round says, if it is allowed to say it.
 *
 * The floor is enforced here rather than in the page, because a page is one
 * client and an endpoint is all of them. Under MIN_RESPONSES this returns the
 * count and nothing else: no scores, no eNPS, no comments. Not greyed out in
 * the UI — absent from the payload.
 *
 * employeeId is never selected. The one query in this file that could identify
 * a respondent is the one that does not run.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { summarise, MIN_RESPONSES } from '@/lib/pulse'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN' && payload.role !== 'EXECUTIVE') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const round = await prisma.pulseRound.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, opensAt: true, closesAt: true },
  })
  if (!round) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const rows = await prisma.pulseResponse.findMany({
    where: { roundId: id },
    select: { enps: true, scores: true, comment: true },
  })
  const invited = await prisma.employee.count({ where: { status: 'ACTIVE' } })

  const result = summarise(rows, invited)

  if (result.belowFloor) {
    return NextResponse.json({
      round,
      minResponses: MIN_RESPONSES,
      responses: result.responses,
      invited,
      belowFloor: true,
    })
  }

  return NextResponse.json({ round, minResponses: MIN_RESPONSES, ...result })
}
