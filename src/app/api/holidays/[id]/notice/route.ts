/**
 * POST /api/holidays/[id]/notice
 *
 * The closure notice: what, which dates, when work resumes, and any condition
 * attached to it.
 *
 * Generating returns a DRAFT. Every real notice carries something no template
 * can know — the Muharram one spelled out the sandwich rule, the Eid one added
 * that salaries would be disbursed early — so subject and body come back
 * editable and whatever HR sends is what goes out, not a regenerated copy.
 *
 * Sending also applies the holiday. Announcing a closure and marking it are the
 * same decision; leaving the attendance sheet untouched after telling everyone
 * the office is shut is how a day ends up marked absent for the whole company.
 *
 *   Body: { send?, extraNote?, subject?, body? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { applyHoliday } from '@/lib/holiday-apply'

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

/** Something that can actually be delivered — "N/A" and blanks are not. */
const isDeliverable = (e: string | null | undefined): e is string =>
  !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

/**
 * Wrapped in the type the rest of Convertt's mail uses, because a notice that
 * arrives in the browser's default serif at whatever size looks like it came
 * from somewhere else. 15px/1.7 with real spacing between paragraphs.
 */
function wrapHtml(paragraphs: string[]): string {
  const style = 'margin:0 0 16px;font-family:Calibri,Segoe UI,Helvetica,Arial,sans-serif;'
    + 'font-size:15px;line-height:1.7;color:#1e293b;'
  const body = paragraphs.map((p) => `<p style="${style}">${p}</p>`).join('\n')
  return `<div style="max-width:640px;padding:8px 0;">\n${body}\n</div>`
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

  let body: { send?: boolean; extraNote?: string; subject?: string; body?: string } = {}
  try { body = await request.json() } catch { /* draft with defaults */ }

  const holiday = await prisma.holiday.findUnique({
    where: { id }, select: { id: true, name: true, date: true, type: true, applied: true },
  })
  if (!holiday) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Consecutive days under the same name are one closure, not several — the
  // Eid notice announced a range, it did not send three emails.
  const sameName = await prisma.holiday.findMany({
    where: { name: holiday.name }, select: { id: true, date: true }, orderBy: { date: 'asc' },
  })
  const dates = sameName.map((h) => h.date)
  const from = dates[0]
  const to = dates[dates.length - 1]
  const resumes = await nextWorkingDay(to)

  const isWfh = holiday.type === 'WFH'
  const many = dates.length > 1
  const span = from.getTime() === to.getTime()
    ? `on ${longDate(from)}`
    : `from ${longDate(from)} to ${longDate(to)}`

  const subject = body.subject?.trim() || (isWfh
    ? `Work From Home — ${holiday.name}`
    : `${holiday.name} — Office Closure Notice`)

  // Warm, and still a notice. It opens by naming the occasion rather than
  // leading with an instruction, and closes with something a person would
  // actually say before a holiday.
  const paragraphs = [
    'Dear Team,',
    isWfh
      ? `We will be working from home ${span}. Please stay reachable during regular hours and keep your team updated on what you are picking up — everything else carries on as normal.`
      : `In observance of ${holiday.name}, the Convertt office will remain closed ${span}.`,
    isWfh
      ? `Normal office working resumes on ${longDate(resumes)}.`
      : `We will resume regular operations on ${longDate(resumes)}. Kindly wrap up anything time-sensitive beforehand and let your lead know if something needs cover.`,
    body.extraNote?.trim() || null,
    isWfh ? null : `Wishing you and your families a restful ${many ? 'few days' : 'day'}.`,
    'Warm regards,',
    'Human Resources<br>Convertt',
  ].filter(Boolean) as string[]

  const defaultText = paragraphs.map((p) => p.replace(/<br>/g, '\n')).join('\n\n')
  const text = body.body?.trim() || defaultText
  // Whatever HR edited is what goes out — the draft is not regenerated on send.
  const html = body.body?.trim()
    ? wrapHtml(body.body.trim().split(/\n{2,}/).map((p) => p.replace(/\n/g, '<br>')))
    : wrapHtml(paragraphs)

  // Only people actually on the payroll on the day, and only addresses that can
  // receive mail — one employee record carries "N/A" where an email should be.
  const employees = await prisma.employee.findMany({
    where: {
      status: 'ACTIVE',
      joiningDate: { lte: to },
      OR: [{ exitDate: null }, { exitDate: { gte: from } }],
    },
    select: { fullName: true, email: true },
    orderBy: { fullName: 'asc' },
  })
  const recipients = employees.filter((e) => isDeliverable(e.email))
  const undeliverable = employees.filter((e) => !isDeliverable(e.email)).map((e) => e.fullName)

  if (!body.send) {
    return NextResponse.json({
      draft: true, subject, html, text,
      dates: dates.map((d) => d.toISOString().slice(0, 10)),
      resumes: resumes.toISOString().slice(0, 10),
      recipients: recipients.map((r) => r.email),
      undeliverable,
      applied: holiday.applied,
    })
  }

  // ── Send ────────────────────────────────────────────────────────────────
  let sent = 0
  const failed: string[] = []
  for (const r of recipients) {
    const res = await sendEmail({ to: r.email!, subject, html, text })
    if (res.ok) sent++
    else failed.push(r.fullName)
  }

  // Telling everyone the office is closed and marking it closed are the same
  // decision. Every day in the range, not just the one that was clicked.
  let attendanceRowsChanged = 0
  for (const h of sameName) {
    const outcome = await applyHoliday(h.id, true, payload.userId)
    attendanceRowsChanged += outcome.changed
  }

  return NextResponse.json({
    draft: false, subject, sent, failed, undeliverable,
    attendanceRowsChanged,
    applied: true,
  })
}
