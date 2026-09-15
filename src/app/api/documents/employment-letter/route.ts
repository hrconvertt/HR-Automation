/**
 * The employment letter Convertt issues, on the measured letterhead.
 *
 *   GET  ?employeeId=…              the letter as the record writes it, as a PDF
 *   GET  ?employeeId=…&defaults=1   the same letter as editable text (JSON)
 *   POST { employeeId?, text }      draw edited text as a PDF; the X-Letter-Fits
 *                                   header is 0 when it runs into the space
 *                                   kept for signature and stamp
 *
 * The editor in Letters → Employment Letter loads the text, lets HR change any
 * line, and posts it back. Nothing is saved: the record is not touched, and
 * the signed copy is filed with "Upload signed" on the probation page.
 *
 * Not to be confused with ?type=offer_letter on /api/documents/generate, the
 * longer pre-hire offer with counter-signature slots (Letters → Offer Letter).
 *
 * The figures are the ones in force today — designation, gross monthly and the
 * probation length on the probation record — because that is how the issued
 * letters read: dated when written, with the joining date as it was and the
 * terms as they are.
 *
 * HR only. The letter states somebody's salary, and a manager should not be
 * able to mint one for a report.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import {
  employmentLetterText, renderLetterText, LETTER_TEXT_LIMITS, type EmploymentLetterText,
} from '@/lib/pdf/employment-letter'

async function denied(request: NextRequest): Promise<NextResponse | null> {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Only HR can issue an employment letter' }, { status: 403 })
  }
  const preview = request.cookies.get('hr_preview_role')?.value
  if (preview && preview !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to issue this' }, { status: 403 })
  }
  return null
}

function pdf(bytes: Uint8Array, name: string, fits: boolean): Response {
  const filename = `Employment Letter - ${name}.pdf`.replace(/[^a-zA-Z0-9 ._-]/g, '')
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Letter-Fits': fits ? '1' : '0',
    },
  })
}

export async function GET(request: NextRequest) {
  const no = await denied(request)
  if (no) return no

  const params = new URL(request.url).searchParams
  const employeeId = params.get('employeeId') ?? ''
  if (!employeeId) return NextResponse.json({ error: 'employeeId required' }, { status: 400 })

  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      fullName: true, cnic: true, designation: true, joiningDate: true,
      timings: true, workDays: true,
      probation: { select: { durationMonths: true } },
      salary: {
        select: {
          basic: true, houseRent: true, utilities: true, food: true,
          fuel: true, medicalAllowance: true, otherAllowance: true,
        },
      },
    },
  })
  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  if (!emp.joiningDate) {
    return NextResponse.json(
      { error: 'This employee has no joining date on record, and the letter states one.' },
      { status: 409 },
    )
  }

  const s = emp.salary
  const gross = s
    ? s.basic + s.houseRent + s.utilities + s.food + s.fuel + s.medicalAllowance + s.otherAllowance
    : 0

  const text = employmentLetterText({
    fullName: emp.fullName,
    cnic: emp.cnic,
    designation: emp.designation ?? '[Designation]',
    joiningDate: emp.joiningDate,
    compensation: gross,
    timings: emp.timings ?? '10am-7pm',
    workingDays: workingDaysLabel(emp.workDays),
    probationMonths: emp.probation?.durationMonths ?? 3,
  })

  if (params.get('defaults') === '1') {
    return NextResponse.json({ employeeName: emp.fullName, text })
  }
  const { bytes, fits } = await renderLetterText(text)
  return pdf(bytes, emp.fullName, fits)
}

export async function POST(request: NextRequest) {
  const no = await denied(request)
  if (no) return no

  const body = await request.json().catch(() => null) as { employeeId?: unknown; text?: Partial<EmploymentLetterText> } | null
  const t = body?.text
  const line = (v: unknown) => (typeof v === 'string' ? v.slice(0, LETTER_TEXT_LIMITS.lineChars) : '')
  if (!t || !Array.isArray(t.paragraphs)) {
    return NextResponse.json({ error: 'Send the letter text.' }, { status: 400 })
  }
  if (t.paragraphs.length > LETTER_TEXT_LIMITS.paragraphs) {
    return NextResponse.json({ error: `A letter can have up to ${LETTER_TEXT_LIMITS.paragraphs} paragraphs.` }, { status: 400 })
  }
  const text: EmploymentLetterText = {
    letterDate: line(t.letterDate),
    subject: line(t.subject),
    paragraphs: t.paragraphs.map((p) => (typeof p === 'string' ? p.slice(0, LETTER_TEXT_LIMITS.paragraphChars) : '')),
    signatoryName: line(t.signatoryName),
    signatoryTitle: line(t.signatoryTitle),
  }

  let name = 'Letter'
  if (typeof body?.employeeId === 'string' && body.employeeId) {
    const emp = await prisma.employee.findUnique({ where: { id: body.employeeId }, select: { fullName: true } })
    if (emp) name = emp.fullName
  }
  const { bytes, fits } = await renderLetterText(text)
  return pdf(bytes, name, fits)
}

/**
 * `workDays` is stored as "Mon,Tue,Wed,Thu,Fri". Every issued letter says
 * "Monday to Friday", so a contiguous run is written the way they write it and
 * anything unusual is listed rather than forced into a range that would be a
 * lie.
 */
const LONG: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
}
const ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function workingDaysLabel(workDays: string | null): string {
  const days = (workDays ?? '').split(',').map((d) => d.trim()).filter(Boolean)
  if (days.length === 0) return 'Monday to Friday'
  const idx = days.map((d) => ORDER.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b)
  if (idx.length === 0) return 'Monday to Friday'
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  if (contiguous && idx.length > 1) {
    return `${LONG[ORDER[idx[0]]]} to ${LONG[ORDER[idx[idx.length - 1]]]}`
  }
  return idx.map((i) => LONG[ORDER[i]]).join(', ')
}
