/**
 * POST /api/recruiting/postings — record a job post by hand.
 *
 * Publishing a JD opens the careers-page row on its own, but a role gets
 * advertised again and again — the QA Engineer went up five separate times —
 * and each of those is its own line in the payments sheet. Without this the
 * only way to add the second and third was to edit the first, which loses one.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import {
  POSTING_PLATFORMS, POSTING_STATUSES, POSTING_CURRENCIES, trackingToken,
} from '@/lib/job-posting'

/** Pakistan time in, UTC out — the sheet's clock is local. */
function parseWhen(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const raw = v.trim()
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)
    ? `${raw}+05:00`
    : /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T00:00:00Z`
      : raw
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function money(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

export async function POST(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }
  const preview = request.cookies.get('hr_preview_role')?.value
  if (preview && preview !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to add a post' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const requisitionId = typeof body.requisitionId === 'string' ? body.requisitionId : ''
  if (!requisitionId) {
    return NextResponse.json({ error: 'Pick which role this post was for' }, { status: 400 })
  }
  const req = await prisma.jobRequisition.findUnique({
    where: { id: requisitionId }, select: { id: true },
  })
  if (!req) return NextResponse.json({ error: 'That role no longer exists' }, { status: 404 })

  const platform = (POSTING_PLATFORMS as readonly string[]).includes(body.platform)
    ? body.platform : 'LINKEDIN'
  const status = (POSTING_STATUSES as readonly string[]).includes(body.status)
    ? body.status : 'ACTIVE'
  const currency = (POSTING_CURRENCIES as readonly string[]).includes(body.currency)
    ? body.currency : 'AED'

  const posting = await prisma.jobPosting.create({
    data: {
      requisitionId,
      platform,
      trackingToken: trackingToken(platform),
      postedAt: parseWhen(body.postedAt),
      closedAt: parseWhen(body.closedAt),
      budget: money(body.budget),
      cost: money(body.cost),
      currency,
      status,
      notes: typeof body.notes === 'string' && body.notes.trim()
        ? body.notes.trim().slice(0, 2000) : null,
      postedBy: payload.userId,
    },
  })
  return NextResponse.json({ ok: true, posting }, { status: 201 })
}
