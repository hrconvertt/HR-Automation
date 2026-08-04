/**
 * POST /api/holidays/[id]/notice
 *
 * Produces the closure-notice email for a holiday, in the shape Convertt's
 * notices already take: what, which dates, when work resumes, and any
 * conditions.
 *
 * Returns a DRAFT — subject, recipients and body — rather than sending. Every
 * real notice carries something specific that no template can know: the
 * Muharram one spelled out the sandwich rule, the Eid one added "salaries will
 * be disbursed before Eid". HR edits before it goes out.
 *
 *   Body: { send?: boolean, extraNote?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** "Friday, 14th August 2026" — the format the existing notices use. */
function longDate(d: Date): string {
  const n = d.getUTCDate()
  const s = n % 10 === 1 && n !== 11 ? 'st'
    : n % 10 === 2 && n !== 12 ? 'nd'
    : n % 10 === 3 && n !== 13 ? 'rd' : 'th'
  return `${DAY[d.getUTCDay()]}, ${n}${s} ${MONTH[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** Next working day after a date, skipping weekends and other holidays. */
async function nextWorkingDay(after: Date): Promise<Date> {
  const d = new Date(after)
  for (let i = 0; i < 14; i++) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue
    const clash = await prisma.holiday.findFirst({ where: { date: d }, select: { id: true } })
    if (!clash) return new Date(d)
  }
  return d
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({
    where: { id: payload.userId }, select: { role: true },
  })
  if (!me || me.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  let body: { send?: boolean; extraNote?: string } = {}
  try { body = await request.json() } catch { /* draft with defaults */ }

  const holiday = await prisma.holiday.findUnique({
    where: { id }, select: { id: true, name: true, date: true, type: true },
  })
  if (!holiday) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Consecutive days under the same name are one closure, not several — the
  // Eid notice announced a range, it did not send three emails.
  const sameName = await prisma.holiday.findMany({
    where: { name: holiday.name }, select: { date: true }, orderBy: { date: 'asc' },
  })
  const dates = sameName.map((h) => h.date)
  const from = dates[0]
  const to = dates[dates.length - 1]
  const resumes = await nextWorkingDay(to)

  const isWfh = holiday.type === 'WFH'
  const span = from.getTime() === to.getTime()
    ? `on ${longDate(from)}`
    : `from ${longDate(from)} to ${longDate(to)}`

  const subject = isWfh
    ? `Work From Home Notice — ${holiday.name}`
    : `${holiday.name} | Office Closure Notice`

  const lines = [
    'Dear Team,',
    isWfh
      ? `Kindly be informed that ${span} will be observed as Work From Home day${dates.length > 1 ? 's' : ''}. The team is expected to remain available during regular working hours and ensure timely completion of assigned tasks.`
      : `This is to inform you that the office will remain closed ${span} in observance of ${holiday.name}.`,
    `Regular operations will resume on ${longDate(resumes)}.`,
    body.extraNote?.trim() || null,
    'Regards,',
    'HR Department',
    'Convertt',
  ].filter(Boolean) as string[]

  const html = lines.map((l) => `<p>${l}</p>`).join('\n')
  const text = lines.join('\n\n')

  const recipients = await prisma.employee.findMany({
    where: {
      status: 'ACTIVE',
      joiningDate: { lte: to },
      NOT: { email: '' },
    },
    select: { fullName: true, email: true },
  })

  if (!body.send) {
    return NextResponse.json({
      draft: true, subject, html, text,
      dates: dates.map((d) => d.toISOString().slice(0, 10)),
      resumes: resumes.toISOString().slice(0, 10),
      recipients: recipients.map((r) => r.email),
    })
  }

  let sent = 0
  const failed: string[] = []
  for (const r of recipients) {
    const res = await sendEmail({ to: r.email, subject, html, text })
    if (res.ok) sent++
    else failed.push(r.fullName)
  }
  return NextResponse.json({ draft: false, subject, sent, failed })
}
