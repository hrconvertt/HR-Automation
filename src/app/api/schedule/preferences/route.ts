/**
 * /api/schedule/preferences — your own schedule preferences.
 *
 *   GET  what you have set, or null
 *   PUT  { weeklyHours?, location?, preferredDays?, onCall?, standby?,
 *          effectiveFrom?, note? }
 *
 * A preference, not a rule. It is shown to whoever builds the schedule and
 * changes nobody's shifts on its own. Only ever the signed-in person's own —
 * there is no employeeId in the body to trust.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { DOW } from '@/lib/schedule'

const LOCATIONS = ['OFFICE', 'WFH', 'HYBRID']

export async function GET(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!payload.employeeId) return NextResponse.json({ preference: null })
  const preference = await prisma.schedulePreference.findUnique({ where: { employeeId: payload.employeeId } })
  return NextResponse.json({ preference })
}

export async function PUT(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const preview = request.cookies.get('hr_preview_role')?.value
  if (hasRole(payload, 'HR_ADMIN') && preview && preview !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'View-only while previewing another role' }, { status: 403 })
  }
  if (!payload.employeeId) {
    return NextResponse.json({ error: 'Your account is not linked to an employee record.' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))

  let weeklyHours: number | null = null
  if (body.weeklyHours !== undefined && body.weeklyHours !== null && body.weeklyHours !== '') {
    const n = Number(body.weeklyHours)
    if (!Number.isInteger(n) || n < 1 || n > 80) {
      return NextResponse.json({ error: 'Preferred weekly hours is a whole number from 1 to 80' }, { status: 400 })
    }
    weeklyHours = n
  }

  const location = LOCATIONS.includes(body.location) ? body.location : null

  const days: string[] = Array.isArray(body.preferredDays)
    ? body.preferredDays.map(String).filter((d: string) => (DOW as readonly string[]).includes(d))
    : []
  // Stored in the week's own order, whatever order they were ticked in.
  const preferredDays = days.length
    ? [...new Set(days)].sort((a, b) => ((DOW.indexOf(a as (typeof DOW)[number]) + 6) % 7) - ((DOW.indexOf(b as (typeof DOW)[number]) + 6) % 7)).join(',')
    : null

  let effectiveFrom = new Date()
  effectiveFrom.setUTCHours(0, 0, 0, 0)
  if (typeof body.effectiveFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.effectiveFrom)) {
    effectiveFrom = new Date(`${body.effectiveFrom}T00:00:00.000Z`)
  }

  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null
  const data = {
    weeklyHours,
    location,
    preferredDays,
    onCall: body.onCall === true,
    standby: body.standby === true,
    effectiveFrom,
    note,
  }

  const preference = await prisma.schedulePreference.upsert({
    where: { employeeId: payload.employeeId },
    update: data,
    create: { employeeId: payload.employeeId, ...data },
  })
  return NextResponse.json({ ok: true, preference })
}
