/**
 * GET   /api/probation/[id]/review — the review, creating a draft if due
 * PATCH /api/probation/[id]/review — save the manager's answers
 *
 * The draft is created empty. It is deliberately not pre-filled from the
 * decision packet: the packet counts attendance, and it counted zero absences
 * for someone who had taken leave. Seeding a form from a number nobody checked
 * is how a wrong figure ends up signed.
 *
 * [id] accepts either the probation record id or the employee id — the board
 * links by employee, and this has caught us out before.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { reviewIsDue, REVIEW_WINDOW_DAYS, daysUntil } from '@/lib/probation-review'

async function findRecord(id: string) {
  return prisma.probationRecord.findFirst({
    where: { OR: [{ id }, { employeeId: id }] },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          joiningDate: true,
          department: { select: { name: true } },
          reportingManager: { select: { id: true, fullName: true } },
          salary: {
            select: {
              basic: true, houseRent: true, utilities: true, food: true,
              fuel: true, medicalAllowance: true, otherAllowance: true,
            },
          },
        },
      },
    },
  })
}

const grossOf = (s: {
  basic: number; houseRent: number; utilities: number; food: number
  fuel: number; medicalAllowance: number; otherAllowance: number
} | null) =>
  s ? s.basic + s.houseRent + s.utilities + s.food + s.fuel + s.medicalAllowance + s.otherAllowance : 0

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rec = await findRecord(id)
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const due = reviewIsDue(rec.endDate)
  let review = await prisma.probationReview.findFirst({
    where: { probationId: rec.id },
    orderBy: { createdAt: 'desc' },
  })

  if (!review && due) {
    review = await prisma.probationReview.create({
      data: {
        probationId: rec.id,
        employeeId: rec.employeeId,
        reviewerId: rec.employee.reportingManager?.id ?? null,
        currentSalary: grossOf(rec.employee.salary) || null,
      },
    })
  }

  return NextResponse.json({
    due,
    daysRemaining: daysUntil(rec.endDate),
    windowDays: REVIEW_WINDOW_DAYS,
    review,
    context: {
      probationId: rec.id,
      employee: {
        id: rec.employee.id,
        fullName: rec.employee.fullName,
        employeeCode: rec.employee.employeeCode,
        designation: rec.employee.designation,
        department: rec.employee.department?.name ?? null,
        joiningDate: rec.employee.joiningDate.toISOString(),
      },
      manager: rec.employee.reportingManager?.fullName ?? null,
      startDate: rec.startDate.toISOString(),
      endDate: rec.endDate.toISOString(),
      currentSalary: grossOf(rec.employee.salary) || null,
    },
  })
}

const RATING_FIELDS = [
  'ratingQuality', 'ratingPunctuality', 'ratingOwnership',
  'ratingCommunication', 'ratingAdaptability',
] as const
const NOTE_FIELDS = [
  'notesQuality', 'notesPunctuality', 'notesOwnership',
  'notesCommunication', 'notesAdaptability',
  'managerRemarks', 'improvementAreas',
] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['HR_ADMIN', 'MANAGER', 'LEAD', 'EXECUTIVE'].includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rec = await findRecord(id)
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  for (const f of RATING_FIELDS) {
    if (f in body) {
      const v = body[f]
      if (v === null) { data[f] = null; continue }
      const n = Number(v)
      if (!Number.isInteger(n) || n < 1 || n > 4) {
        return NextResponse.json({ error: `${f} must be 1–4` }, { status: 400 })
      }
      data[f] = n
    }
  }
  for (const f of NOTE_FIELDS) {
    if (f in body) data[f] = typeof body[f] === 'string' ? String(body[f]).slice(0, 4000) : null
  }
  if ('overallAssessment' in body) data.overallAssessment = body.overallAssessment || null
  if ('decision' in body) data.decision = body.decision || null
  if ('extensionDays' in body) data.extensionDays = body.extensionDays ? Number(body.extensionDays) : null
  if ('currentSalary' in body) data.currentSalary = body.currentSalary ? Number(body.currentSalary) : null
  if ('recommendedPct' in body) data.recommendedPct = body.recommendedPct ? Number(body.recommendedPct) : null
  if ('incrementAmount' in body) data.incrementAmount = body.incrementAmount ? Number(body.incrementAmount) : null
  if ('proposedSalary' in body) data.proposedSalary = body.proposedSalary ? Number(body.proposedSalary) : null
  if ('salaryEffectiveFrom' in body) {
    data.salaryEffectiveFrom = body.salaryEffectiveFrom
      ? new Date(String(body.salaryEffectiveFrom))
      : null
  }
  if (body.status === 'SUBMITTED') {
    data.status = 'SUBMITTED'
    data.managerSignedAt = new Date()
  }
  if (body.status === 'FINALISED') {
    data.status = 'FINALISED'
    data.hrSignedAt = new Date()
    data.hrSignedById = payload.userId
  }

  const existing = await prisma.probationReview.findFirst({
    where: { probationId: rec.id },
    orderBy: { createdAt: 'desc' },
  })

  const review = existing
    ? await prisma.probationReview.update({ where: { id: existing.id }, data })
    : await prisma.probationReview.create({
        data: {
          probationId: rec.id,
          employeeId: rec.employeeId,
          reviewerId: rec.employee.reportingManager?.id ?? null,
          currentSalary: grossOf(rec.employee.salary) || null,
          ...data,
        },
      })

  return NextResponse.json({ review })
}
