import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import { LETTER_TYPES, type LetterType } from '@/lib/letter-templates'

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, fullName: true } } },
  })
  if (!user) return null
  const previewRole =
    user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  return {
    userId: user.id,
    actualRole: user.role,
    effectiveRole,
    isPreviewMode: user.role === 'HR_ADMIN' && !!previewRole && previewRole !== 'HR_ADMIN',
    employeeId: user.employee?.id ?? null,
    userName: user.employee?.fullName ?? user.email,
  }
}

// GET /api/letters?status=&type=
export async function GET(request: NextRequest) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const type = searchParams.get('type')

  let where: Record<string, unknown> = {}
  if (access.effectiveRole === 'EMPLOYEE') {
    if (!access.employeeId) return NextResponse.json({ letters: [] })
    where = { employeeId: access.employeeId }
  } else if (access.effectiveRole === 'MANAGER' && access.employeeId) {
    where = {
      OR: [
        { employeeId: access.employeeId },
        { employee: { reportingManagerId: access.employeeId } },
      ],
    }
  }
  // HR_ADMIN / EXECUTIVE: see all

  if (status) where = { ...where, status }
  if (type) where = { ...where, letterType: type }

  const letters = await prisma.letterRequest.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true, employeeCode: true, fullName: true, designation: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: [{ requestedAt: 'desc' }],
  })

  return NextResponse.json({ letters })
}

// POST /api/letters — employee creates a request
// body: { letterType, purpose?, destinationCountry?, bankName?, travelFrom?, travelTo? }
export async function POST(request: NextRequest) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!access.employeeId) {
    return NextResponse.json({ error: 'Only employees can request letters' }, { status: 403 })
  }
  // Block HR previewing as employee from creating requests on the live employee's behalf
  if (access.isPreviewMode) {
    return NextResponse.json({ error: 'Cannot create letter requests in preview mode' }, { status: 403 })
  }

  const body = await request.json()
  const letterType = String(body.letterType ?? '') as LetterType
  if (!LETTER_TYPES.includes(letterType)) {
    return NextResponse.json({ error: 'Invalid letterType' }, { status: 400 })
  }

  // Per-type validation
  if (letterType === 'NOC_VISA') {
    if (!body.destinationCountry || !body.travelFrom || !body.travelTo) {
      return NextResponse.json({ error: 'NOC for Visa requires destinationCountry, travelFrom, travelTo' }, { status: 400 })
    }
  }
  if (letterType === 'SALARY_CERTIFICATE' && !body.bankName && !body.purpose) {
    return NextResponse.json({ error: 'Salary Certificate requires a bank name or purpose' }, { status: 400 })
  }

  const created = await prisma.letterRequest.create({
    data: {
      employeeId: access.employeeId,
      letterType,
      purpose: body.purpose ?? null,
      destinationCountry: body.destinationCountry ?? null,
      bankName: body.bankName ?? null,
      travelFrom: body.travelFrom ? new Date(body.travelFrom) : null,
      travelTo: body.travelTo ? new Date(body.travelTo) : null,
      status: 'PENDING',
    },
  })

  // Notify all HR admins
  const hrEmps = await prisma.user.findMany({
    where: { role: 'HR_ADMIN', employee: { isNot: null } },
    select: { employee: { select: { id: true } } },
  })
  for (const hr of hrEmps) {
    if (hr.employee) {
      await notify({
        employeeId: hr.employee.id,
        type: 'GENERAL',
        title: 'New letter request',
        message: `${access.userName} requested a ${letterType.replace('_', ' ')}.`,
        link: '/dashboard/letters',
      })
    }
  }

  return NextResponse.json({ letter: created }, { status: 201 })
}
