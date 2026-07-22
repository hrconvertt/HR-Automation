import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sequences = await prisma.nurtureSequence.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    })
    return NextResponse.json(sequences)
  } catch (error) {
    console.error('[nurture GET]', error)
    return NextResponse.json({ error: 'Failed to fetch sequences' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { name, type, triggerStage, delayHours, emailSubject, emailBodyHtml, sortOrder } = body

    if (!name || !type || !emailSubject || !emailBodyHtml) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const sequence = await prisma.nurtureSequence.create({
      data: {
        name,
        type,
        triggerStage: triggerStage || null,
        delayHours: delayHours || 0,
        emailSubject,
        emailBodyHtml,
        sortOrder: sortOrder || 0,
      },
    })
    return NextResponse.json(sequence, { status: 201 })
  } catch (error) {
    console.error('[nurture POST]', error)
    return NextResponse.json({ error: 'Failed to create sequence' }, { status: 500 })
  }
}