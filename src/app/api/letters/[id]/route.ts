import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import { generateLetter, type LetterType } from '@/lib/letter-templates'

interface RouteParams { params: Promise<{ id: string }> }

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
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

async function loadLetter(id: string) {
  return prisma.letterRequest.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, employeeCode: true, fullName: true, designation: true,
          cnic: true, joiningDate: true, exitDate: true,
          bankName: true, bankAccount: true, reportingManagerId: true,
          department: { select: { name: true } },
          salary: { select: { basic: true, houseRent: true, utilities: true, food: true, fuel: true, medicalAllowance: true, otherAllowance: true } },
          payslips: { orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 1, select: { grossSalary: true } },
        },
      },
    },
  })
}

function canView(letter: NonNullable<Awaited<ReturnType<typeof loadLetter>>>, access: NonNullable<Awaited<ReturnType<typeof resolveAccess>>>): boolean {
  const isOwn = letter.employeeId === access.employeeId
  const isMyTeam = letter.employee.reportingManagerId === access.employeeId
  const isHR = access.effectiveRole === 'HR_ADMIN'
  return isOwn || isMyTeam || isHR
}

// GET /api/letters/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const letter = await loadLetter(id)
  if (!letter) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!canView(letter, access)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ letter })
}

// PATCH /api/letters/[id]
// HR-only actions: APPROVE | REJECT | MARK_GENERATED
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (access.actualRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Only HR can review letters' }, { status: 403 })
  }
  if (access.isPreviewMode) {
    return NextResponse.json({ error: 'Switch back to HR view to act on letters' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const action = body.action as 'APPROVE' | 'REJECT' | 'MARK_GENERATED' | undefined

  const letter = await loadLetter(id)
  if (!letter) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'APPROVE') {
    if (letter.status !== 'PENDING') {
      return NextResponse.json({ error: `Cannot approve a ${letter.status} letter` }, { status: 400 })
    }
    const signedByName = (body.signedByName ?? '').toString().trim() || access.userName
    const signedByTitle = (body.signedByTitle ?? '').toString().trim() || 'HR Department'

    // Allocate next letter number for current year
    const year = new Date().getFullYear()
    const prefix = `CON-LTR-${year}-`
    const countThisYear = await prisma.letterRequest.count({
      where: { letterNumber: { startsWith: prefix } },
    })
    const nextNum = String(countThisYear + 1).padStart(3, '0')
    const letterNumber = `${prefix}${nextNum}`

    // Compute monthly gross — prefer latest payslip, else sum salary components, else basicSalary
    const latestGross = letter.employee.payslips?.[0]?.grossSalary ?? null
    const sal = letter.employee.salary
    const summedGross = sal
      ? (sal.basic + sal.houseRent + sal.utilities + sal.food + sal.fuel + sal.medicalAllowance + sal.otherAllowance)
      : null
    const monthlyGross = latestGross ?? summedGross ?? (sal?.basic ?? null)

    const generated = generateLetter(
      letter.letterType as LetterType,
      {
        fullName: letter.employee.fullName,
        employeeCode: letter.employee.employeeCode,
        designation: letter.employee.designation,
        joiningDate: letter.employee.joiningDate,
        exitDate: letter.employee.exitDate,
        cnic: letter.employee.cnic,
        department: letter.employee.department?.name ?? null,
        basicSalary: sal?.basic ?? null,
        grossSalary: monthlyGross,
        bankName: letter.employee.bankName,
        bankAccount: letter.employee.bankAccount,
      },
      {
        letterNumber,
        letterType: letter.letterType,
        purpose: letter.purpose,
        destinationCountry: letter.destinationCountry,
        bankName: letter.bankName,
        travelFrom: letter.travelFrom,
        travelTo: letter.travelTo,
      },
      { name: signedByName, title: signedByTitle },
    )

    const updated = await prisma.letterRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        letterNumber,
        letterBody: generated.body,
        signedByName,
        signedByTitle,
        reviewedAt: new Date(),
        reviewedById: access.userId,
      },
    })

    await notify({
      employeeId: letter.employeeId,
      type: 'GENERAL',
      title: 'Letter approved',
      message: `Your ${letter.letterType.replace('_', ' ')} (${letterNumber}) is ready to download.`,
      link: '/dashboard/letters',
    })

    return NextResponse.json({ letter: updated })
  }

  if (action === 'REJECT') {
    if (letter.status !== 'PENDING') {
      return NextResponse.json({ error: `Cannot reject a ${letter.status} letter` }, { status: 400 })
    }
    const reason = (body.rejectionReason ?? '').toString().trim()
    if (!reason) {
      return NextResponse.json({ error: 'Rejection reason required' }, { status: 400 })
    }
    const updated = await prisma.letterRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        reviewedAt: new Date(),
        reviewedById: access.userId,
      },
    })
    await notify({
      employeeId: letter.employeeId,
      type: 'GENERAL',
      title: 'Letter request rejected',
      message: `Your ${letter.letterType.replace('_', ' ')} request was rejected: ${reason}`,
      link: '/dashboard/letters',
    })
    return NextResponse.json({ letter: updated })
  }

  if (action === 'MARK_GENERATED') {
    if (letter.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Only APPROVED letters can be marked GENERATED' }, { status: 400 })
    }
    const updated = await prisma.letterRequest.update({
      where: { id },
      data: { status: 'GENERATED' },
    })
    return NextResponse.json({ letter: updated })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

// DELETE /api/letters/[id]
// Employee: can delete their own PENDING request only.
// HR: can delete any (with audit context — actorId stored).
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.isPreviewMode) {
    return NextResponse.json({ error: 'Cannot delete in preview mode' }, { status: 403 })
  }

  const { id } = await params
  const letter = await prisma.letterRequest.findUnique({ where: { id } })
  if (!letter) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwn = letter.employeeId === access.employeeId
  const isHR = access.actualRole === 'HR_ADMIN'

  if (isOwn && letter.status === 'PENDING') {
    await prisma.letterRequest.delete({ where: { id } })
    return NextResponse.json({ success: true })
  }
  if (isHR) {
    await prisma.letterRequest.delete({ where: { id } })
    return NextResponse.json({ success: true, deletedBy: access.userId })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
