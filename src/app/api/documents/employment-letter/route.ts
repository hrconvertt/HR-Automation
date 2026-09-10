/**
 * GET /api/documents/employment-letter?employeeId=... — the letter Convertt
 * actually issues, as a PDF on the measured letterhead.
 *
 * The six employment letters on file are all this document: one page, the
 * letterhead, "Subject: Employment Letter", the four bulleted terms, signed by
 * the Director Administration. `renderEmploymentLetter` reproduces it exactly
 * and has had no caller since it was written — nothing in the app could
 * produce the letter it is missing. This is that caller.
 *
 * Not to be confused with ?type=offer_letter on /api/documents/generate, which
 * builds a pre-hire offer with counter-signature slots and an e-sign block.
 * That is a different document; it is not what is in anybody's file.
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
import { renderEmploymentLetter } from '@/lib/pdf/employment-letter'

export async function GET(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Only HR can issue an employment letter' }, { status: 403 })
  }
  const preview = request.cookies.get('hr_preview_role')?.value
  if (preview && preview !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to issue this' }, { status: 403 })
  }

  const employeeId = new URL(request.url).searchParams.get('employeeId') ?? ''
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

  const bytes = await renderEmploymentLetter({
    fullName: emp.fullName,
    cnic: emp.cnic,
    designation: emp.designation ?? '[Designation]',
    joiningDate: emp.joiningDate,
    compensation: gross,
    timings: emp.timings ?? '10am-7pm',
    workingDays: workingDaysLabel(emp.workDays),
    probationMonths: emp.probation?.durationMonths ?? 3,
  })

  const filename = `Employment Letter - ${emp.fullName}.pdf`.replace(/[^a-zA-Z0-9 ._-]/g, '')
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
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
