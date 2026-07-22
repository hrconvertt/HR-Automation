import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { status, impressions, clicks, applications } = body

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (status && ['ACTIVE', 'PAUSED', 'EXPIRED', 'CLOSED'].includes(status)) updateData.status = status
    if (typeof impressions === 'number') updateData.impressions = impressions
    if (typeof clicks === 'number') updateData.clicks = clicks
    if (typeof applications === 'number') updateData.applications = applications
    if (status === 'CLOSED' || status === 'EXPIRED') updateData.expiresAt = new Date()

    const posting = await prisma.jobPosting.update({
      where: { id },
      data: updateData,
    })
    return NextResponse.json(posting)
  } catch (error) {
    console.error('[posting PATCH]', error)
    return NextResponse.json({ error: 'Failed to update posting' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await prisma.jobPosting.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[posting DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete posting' }, { status: 500 })
  }
}