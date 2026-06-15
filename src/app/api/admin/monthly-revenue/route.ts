/**
 * POST /api/admin/monthly-revenue
 *
 *   HR enters the company's gross revenue for a given month so the
 *   Executive dashboard can compute Cost-of-People % and Revenue per
 *   Employee. Upsert — re-entering the same month overwrites.
 *
 *   HR_ADMIN only. Preview-mode blocked.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me || me.role !== 'HR_ADMIN') return NextResponse.json({ error: 'HR only' }, { status: 403 })

  const recent = await prisma.monthlyMetric.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: 12,
  })
  return NextResponse.json({ metrics: recent })
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, role: true } })
  if (!me || me.role !== 'HR_ADMIN') return NextResponse.json({ error: 'HR only' }, { status: 403 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to record revenue' }, { status: 403 })
  }

  const body = await request.json()
  const month = Number(body.month)
  const year  = Number(body.year)
  const revenue = Number(body.revenue)
  const note = body.note ? String(body.note).trim().slice(0, 500) : null
  if (!month || !year || !Number.isFinite(revenue) || revenue < 0) {
    return NextResponse.json({ error: 'month, year, and a non-negative revenue are required' }, { status: 400 })
  }

  const metric = await prisma.monthlyMetric.upsert({
    where: { month_year: { month, year } },
    update: { revenue, note, enteredById: me.id },
    create: { month, year, revenue, note, enteredById: me.id },
  })
  return NextResponse.json({ metric })
}
