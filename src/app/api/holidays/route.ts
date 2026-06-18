/**
 * Public holidays â€” read by anyone (used to compute leave days), write only by HR.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { parseLocalDate } from '@/lib/date-utils'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

  const start = new Date(year, 0, 1)
  const end = new Date(year, 11, 31, 23, 59, 59)

  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
  })

  return NextResponse.json({ holidays })
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload || payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Block HR in preview mode
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to manage holidays' }, { status: 403 })
  }

  const { name, date, type } = await request.json()
  if (!name || !date) {
    return NextResponse.json({ error: 'name and date are required' }, { status: 400 })
  }

  // Parse "YYYY-MM-DD" as LOCAL midnight so the holiday stores on the day the
  // HR admin actually picked, regardless of TZ.
  const d = parseLocalDate(date)

  try {
    const holiday = await prisma.holiday.upsert({
      where: { date: d },
      update: { name, type: type ?? 'PUBLIC' },
      create: { name, date: d, type: type ?? 'PUBLIC' },
    })
    return NextResponse.json({ holiday })
  } catch (e) {
    return NextResponse.json({ error: 'Could not save holiday' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload || payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to manage holidays' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // Idempotent delete â€” if the row doesn't exist (already removed in another
  // tab, or never created), return success rather than 500.
  const result = await prisma.holiday.deleteMany({ where: { id } })
  return NextResponse.json({ success: true, deleted: result.count })
}
