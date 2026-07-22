import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
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

    const slaDueAt = new Date(interview.scheduledAt)
    slaDueAt.setHours(slaDueAt.getHours() + 24)

    const scorecard = await prisma.scorecard.upsert({
      where: {
        interviewId_interviewerId: { interviewId: id, interviewerId },
      },
      update: {
        rubricAnswers: JSON.stringify(rubricAnswers || []),
        overallRating,
        recommendation: recommendation || null,
        strengths: JSON.stringify(strengths || []),
        concerns: JSON.stringify(concerns || []),
        submittedAt: new Date(),
        slaDueAt,
        slaNudgedAt: null,
      },
      create: {
        interviewId: id,
        interviewerId,
        rubricAnswers: JSON.stringify(rubricAnswers || []),
        overallRating,
        recommendation: recommendation || null,
        strengths: JSON.stringify(strengths || []),
        concerns: JSON.stringify(concerns || []),
        submittedAt: new Date(),
        slaDueAt,
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