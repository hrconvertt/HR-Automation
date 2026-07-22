import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/recruiting/slots?interviewerIds=xxx,yyy&date=2026-07-20
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const interviewerIds = searchParams.get('interviewerIds')?.split(',').filter(Boolean) || []
    const dateStr = searchParams.get('date')

    if (interviewerIds.length === 0 || !dateStr) {
      return NextResponse.json({ error: 'Missing interviewerIds or date' }, { status: 400 })
    }

    const start = new Date(dateStr)
    start.setHours(0, 0, 0, 0)
    const end = new Date(dateStr)
    end.setHours(23, 59, 59, 999)

    const slots = await prisma.interviewSlot.findMany({
      where: {
        interviewerId: { in: interviewerIds },
        date: { gte: start, lte: end },
        isBooked: false,
      },
      orderBy: { startTime: 'asc' },
    })
    return NextResponse.json(slots)
  } catch (error) {
    console.error('[slots GET]', error)
    return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 })
  }
}

// POST /api/recruiting/slots — book a slot
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { interviewerId, date, startTime, endTime, timezone } = body

    if (!interviewerId || !date || !startTime || !endTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const slot = await prisma.interviewSlot.create({
      data: {
        interviewerId,
        date: new Date(date),
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        timezone: timezone || 'Asia/Karachi',
      },
    })
    return NextResponse.json(slot, { status: 201 })
  } catch (error) {
    console.error('[slots POST]', error)
    return NextResponse.json({ error: 'Failed to create slot' }, { status: 500 })
  }
}