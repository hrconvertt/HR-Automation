/**
 * GET /api/documents/offer-defaults?employeeId=… — the fields that pre-fill the
 * Employment Letter builder, taken from the employee's record.
 *
 * The builder is meant to open already filled in, so this returns everything
 * the letter needs with sensible defaults; HR edits only what differs for this
 * particular offer.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'HR only' }, { status: 403 })

  const employeeId = new URL(request.url).searchParams.get('employeeId') ?? ''
  if (!employeeId) return NextResponse.json({ error: 'employeeId required' }, { status: 400 })

  const e = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true, fullName: true, designation: true, cnic: true, city: true,
      joiningDate: true, employeeType: true, salary: true,
    },
  })
  if (!e) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const s = e.salary
  const gross = s
    ? s.basic + s.houseRent + s.utilities + s.food + s.fuel + s.medicalAllowance + s.otherAllowance
    : 0

  const senior = /lead|head|senior|manager|director|chief|principal/i.test(e.designation ?? '')

  return NextResponse.json({
    employeeName: e.fullName,
    fields: {
      designation: e.designation ?? '',
      cnic: e.cnic ?? '',
      city: e.city ?? 'Lahore',
      effectiveDate: e.joiningDate ? e.joiningDate.toISOString().slice(0, 10) : '',
      grossSalary: gross || '',
      conveyance: 5000,
      probationMonths: 3,
      noticeConfirmed: senior ? 'two (2) months' : 'one (1) month',
      benefits: '',
    },
  })
}
