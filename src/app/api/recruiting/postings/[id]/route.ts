import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POSTING_PLATFORMS, POSTING_STATUSES, POSTING_CURRENCIES } from '@/lib/job-posting'

/** Blank string means "clear this", a missing key means "leave it alone". */
function optionalMoney(v: unknown): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}
function optionalDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? undefined : d
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { status, impressions, clicks, applications, platform, currency, notes } = body

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (status && (POSTING_STATUSES as readonly string[]).includes(status)) updateData.status = status
    if (typeof impressions === 'number') updateData.impressions = impressions
    if (typeof clicks === 'number') updateData.clicks = clicks
    if (typeof applications === 'number') updateData.applications = applications

    // The payments screen edits these: a post that went up somewhere else, or
    // was billed in another currency, or whose dates and amounts were only
    // known later.
    if (platform && (POSTING_PLATFORMS as readonly string[]).includes(platform)) updateData.platform = platform
    if (currency && (POSTING_CURRENCIES as readonly string[]).includes(currency)) updateData.currency = currency
    if (notes !== undefined) updateData.notes = notes === '' ? null : String(notes).slice(0, 2000)

    const budget = optionalMoney(body.budget)
    if (budget !== undefined) updateData.budget = budget
    const cost = optionalMoney(body.cost)
    if (cost !== undefined) updateData.cost = cost
    const postedAt = optionalDate(body.postedAt)
    if (postedAt !== undefined) updateData.postedAt = postedAt
    const closedAt = optionalDate(body.closedAt)
    if (closedAt !== undefined) updateData.closedAt = closedAt

    // Closing a post is what fixes its end date, unless one was typed in.
    if ((status === 'CLOSED' || status === 'EXPIRED') && closedAt === undefined) {
      updateData.closedAt = new Date()
    }

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