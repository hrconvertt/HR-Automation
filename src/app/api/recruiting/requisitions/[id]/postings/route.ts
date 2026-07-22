import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/recruiting/requisitions/[id]/postings — list all postings
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const postings = await prisma.jobPosting.findMany({
      where: { requisitionId: id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(postings)
  } catch (error) {
    console.error('[postings GET]', error)
    return NextResponse.json({ error: 'Failed to fetch postings' }, { status: 500 })
  }
}

// POST /api/recruiting/requisitions/[id]/postings — create a new posting
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { platform, cost, expiresAt, notes } = body

    if (!platform || !['LINKEDIN', 'INDEED', 'ZIPRECRUITER', 'CAREERS_PAGE', 'OTHER'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
    }

    // Generate tracking token
    const prefix = platform === 'LINKEDIN' ? 'LN' : platform === 'INDEED' ? 'ID' : platform === 'ZIPRECRUITER' ? 'ZR' : platform === 'CAREERS_PAGE' ? 'CP' : 'OT'
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
    const trackingToken = `${prefix}-${dateStr}-${rand}`

    const posting = await prisma.jobPosting.create({
      data: {
        requisitionId: id,
        platform,
        trackingToken,
        postedAt: new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        cost: cost ?? null,
        notes: notes ?? null,
        postedBy: payload.userId || payload.sub,
      },
    })

    // Update requisition postedDate if this is the first posting
    const req = await prisma.jobRequisition.findUnique({ where: { id } })
    if (req && !req.postedDate) {
      await prisma.jobRequisition.update({
        where: { id },
        data: { postedDate: new Date(), jdStatus: req.jdStatus === 'JD_APPROVED' ? 'POSTED' : req.jdStatus },
      })
    }

    return NextResponse.json(posting, { status: 201 })
  } catch (error) {
    console.error('[postings POST]', error)
    return NextResponse.json({ error: 'Failed to create posting' }, { status: 500 })
  }
}