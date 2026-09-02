/**
 * POST /api/appraisals — open an appraisal form for an employee.
 *
 * The header details are copied onto the record rather than joined. An
 * appraisal is read years afterwards, and it should still show the
 * designation and department the person held when it was written.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { verifyToken } from '@/lib/auth'
import { EMPTY_GOALS, EMPTY_DEVELOPMENT } from '@/lib/appraisal-form'

export async function POST(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN' && payload.role !== 'EXECUTIVE') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  let body: {
    employeeId?: string
    periodFrom?: string
    periodTo?: string
    isManagerial?: boolean
  } = {}
  try { body = await request.json() } catch { /* validated below */ }

  if (!body.employeeId) {
    return NextResponse.json({ error: 'employeeId is required' }, { status: 400 })
  }

  const employee = await prisma.employee.findUnique({
    where: { id: body.employeeId },
    select: {
      id: true, fullName: true, designation: true, joiningDate: true,
      department: { select: { name: true } },
      reportingManager: { select: { id: true } },
      _count: { select: { directReports: true } },
    },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // Default the period to the twelve months ending today — an appraisal
  // covers the year behind it, and HR can change both dates on the form.
  const to = body.periodTo ? new Date(body.periodTo + 'T00:00:00Z') : new Date()
  const from = body.periodFrom
    ? new Date(body.periodFrom + 'T00:00:00Z')
    : new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), to.getUTCDate()))

  const years = employee.joiningDate
    ? ((Date.now() - employee.joiningDate.getTime()) / (365.25 * 86_400_000))
    : null

  const form = await prisma.appraisalForm.create({
    data: {
      employeeId: employee.id,
      periodFrom: from,
      periodTo: to,
      designationAtReview: employee.designation,
      departmentAtReview: employee.department?.name ?? null,
      experienceCompany: years != null ? `${years.toFixed(1)} years` : null,
      appraiserId: employee.reportingManager?.id ?? null,
      // Somebody with direct reports is scored on the managerial section too.
      isManagerial: body.isManagerial ?? employee._count.directReports > 0,
      ratings: {},
      // Prisma's Json input type does not accept a typed array directly.
      goals: EMPTY_GOALS as unknown as Prisma.InputJsonValue,
      development: EMPTY_DEVELOPMENT as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  })

  return NextResponse.json({ id: form.id })
}
