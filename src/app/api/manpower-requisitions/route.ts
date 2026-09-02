/**
 * POST /api/manpower-requisitions — open the form for a requisition.
 *
 * Seeded from the requisition it belongs to, because the department, the
 * designation and the number of positions are already known there and
 * retyping them is how the two records come to disagree.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN' && payload.role !== 'EXECUTIVE') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  let body: { requisitionId?: string } = {}
  try { body = await request.json() } catch { /* validated below */ }
  if (!body.requisitionId) {
    return NextResponse.json({ error: 'requisitionId is required' }, { status: 400 })
  }

  const existing = await prisma.manpowerRequisition.findUnique({
    where: { requisitionId: body.requisitionId }, select: { id: true },
  })
  if (existing) return NextResponse.json({ id: existing.id, existed: true })

  const req = await prisma.jobRequisition.findUnique({
    where: { id: body.requisitionId },
    select: {
      id: true, title: true, vacancies: true, type: true, departmentId: true,
      description: true, requirements: true, minExperienceYears: true,
      closingDate: true, jdContent: true,
      requestedBy: { select: { fullName: true } },
    },
  })
  if (!req) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })

  // Headcount already in that department, so "Manpower currently available"
  // starts from the truth rather than from memory.
  // Permanent counts confirmed staff; everyone still on probation, in training
  // or interning is the temporary column.
  const [permanent, temporary] = req.departmentId
    ? await Promise.all([
      prisma.employee.count({
        where: { departmentId: req.departmentId, status: 'ACTIVE', employeeType: 'PERMANENT' },
      }),
      prisma.employee.count({
        where: { departmentId: req.departmentId, status: 'ACTIVE', employeeType: { not: 'PERMANENT' } },
      }),
    ])
    : [null, null]

  const head = req.departmentId
    ? await prisma.department.findUnique({
      where: { id: req.departmentId },
      select: { head: { select: { fullName: true } } },
    })
    : null

  const form = await prisma.manpowerRequisition.create({
    data: {
      requisitionId: req.id,
      designation: req.title,
      noOfPositions: req.vacancies,
      appointmentType: req.type === 'CONTRACT' ? 'TEMPORARY' : 'PERMANENT',
      jdAttached: Boolean(req.jdContent),
      workDescription: req.description ?? null,
      qualificationMust: req.requirements ?? null,
      desiredExperience: req.minExperienceYears != null
        ? `${req.minExperienceYears} years`
        : null,
      currentPermanent: permanent,
      currentTemporary: temporary,
      departmentHead: head?.head?.fullName ?? null,
      requestedBy: req.requestedBy?.fullName ?? null,
      requisitionDate: new Date(),
      fillBy: req.closingDate,
    },
    select: { id: true },
  })

  return NextResponse.json({ id: form.id })
}
