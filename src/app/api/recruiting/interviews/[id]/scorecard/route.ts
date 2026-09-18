import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { resolveJobActor } from '@/lib/job-post-server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { interviewerId, rubricAnswers, overallRating, recommendation, strengths, concerns } = body

    if (!interviewerId || !overallRating) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const interview = await prisma.interview.findUnique({ where: { id } })
    if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })

    // HR and hiring managers record for anyone; a panel member only for themselves.
    const actor = await resolveJobActor(request)
    const onPanel = interviewerId === payload.employeeId && panelOf(interview.interviewerIds).includes(interviewerId)
    if (actor instanceof NextResponse && !onPanel) {
      return NextResponse.json({ error: 'Only the interviewer, HR or the hiring manager can score this interview' }, { status: 403 })
    }

    const slaDueAt = new Date(interview.scheduledAt)
    slaDueAt.setHours(slaDueAt.getHours() + 24)

    const existing = await prisma.scorecard.findFirst({
      where: { interviewId: id, interviewerId },
    })

    const commonData = {
      rubricAnswers: JSON.stringify(rubricAnswers || []),
      overallRating,
      recommendation: recommendation || null,
      strengths: JSON.stringify(strengths || []),
      concerns: JSON.stringify(concerns || []),
      submittedAt: new Date(),
      slaDueAt,
    }

    const scorecard = existing
      ? await prisma.scorecard.update({
          where: { id: existing.id },
          data: { ...commonData, slaNudgedAt: null },
        })
      : await prisma.scorecard.create({
          data: {
            interviewId: id,
            interviewerId,
            ...commonData,
          },
        })

    return NextResponse.json(scorecard, { status: 201 })
  } catch (error) {
    console.error('[scorecard POST]', error)
    return NextResponse.json({ error: 'Failed to submit scorecard' }, { status: 500 })
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const actor = await resolveJobActor(request)
    if (actor instanceof NextResponse) {
      const interview = await prisma.interview.findUnique({ where: { id }, select: { interviewerIds: true } })
      if (!interview || !payload.employeeId || !panelOf(interview.interviewerIds).includes(payload.employeeId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const scorecards = await prisma.scorecard.findMany({
      where: { interviewId: id },
      include: { interviewer: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(scorecards)
  } catch (error) {
    console.error('[scorecard GET]', error)
    return NextResponse.json({ error: 'Failed to fetch scorecards' }, { status: 500 })
  }
}

/** Employee ids on an interview's panel (stored as a JSON array). */
function panelOf(raw: string | null): string[] {
  try {
    const ids = JSON.parse(raw ?? '[]')
    return Array.isArray(ids) ? ids.map(String) : []
  } catch {
    return []
  }
}
