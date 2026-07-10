import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyMany } from '@/lib/notifications'
import {
  JOB_CHANGE_TYPES,
  JOB_CHANGE_STATUSES,
  JOB_CHANGE_TYPE_LABEL,
  type JobChangeType,
  resolveJobChangeAccess,
  hrAdminEmployeeIds,
  promotionLetterPurpose,
} from '@/lib/job-changes'

// GET /api/job-changes?status=&employeeId=
// HR / EXECUTIVE see all; Manager sees their direct reports'; Employee sees own (read-only).
export async function GET(request: NextRequest) {
  const access = await resolveJobChangeAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const employeeId = searchParams.get('employeeId')

  let where: Record<string, unknown> = {}
  if (access.effectiveRole === 'MANAGER') {
    if (!access.employeeId) return NextResponse.json({ jobChanges: [] })
    where = {
      OR: [
        { employee: { reportingManagerId: access.employeeId } },
        { employeeId: access.employeeId },
      ],
    }
  } else if (access.effectiveRole !== 'HR_ADMIN' && access.effectiveRole !== 'EXECUTIVE') {
    // EMPLOYEE (and any other role): own records only
    if (!access.employeeId) return NextResponse.json({ jobChanges: [] })
    where = { employeeId: access.employeeId }
  }

  if (status && (JOB_CHANGE_STATUSES as readonly string[]).includes(status)) {
    where = { ...where, status }
  }
  if (employeeId) where = { ...where, employeeId }

  const rows = await prisma.jobChange.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          reportingManagerId: true,
          department: { select: { name: true } },
        },
      },
    },
  })

  // Resolve department / manager / requester names in batches.
  const deptIds = new Set<string>()
  const empIds = new Set<string>()
  const userIds = new Set<string>()
  for (const r of rows) {
    if (r.fromDepartmentId) deptIds.add(r.fromDepartmentId)
    if (r.toDepartmentId) deptIds.add(r.toDepartmentId)
    if (r.fromManagerId) empIds.add(r.fromManagerId)
    if (r.toManagerId) empIds.add(r.toManagerId)
    userIds.add(r.requestedById)
  }
  const [depts, emps, users] = await Promise.all([
    deptIds.size
      ? prisma.department.findMany({ where: { id: { in: [...deptIds] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    empIds.size
      ? prisma.employee.findMany({ where: { id: { in: [...empIds] } }, select: { id: true, fullName: true } })
      : Promise.resolve([]),
    userIds.size
      ? prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, email: true, employee: { select: { fullName: true } } },
        })
      : Promise.resolve([]),
  ])
  const deptName = new Map(depts.map((d) => [d.id, d.name]))
  const empName = new Map(emps.map((e) => [e.id, e.fullName]))
  const userName = new Map(users.map((u) => [u.id, u.employee?.fullName ?? u.email]))

  // Promotion letters generated on enact — linked via a deterministic purpose string.
  const enactedPromos = rows.filter((r) => r.changeType === 'PROMOTION' && r.status === 'ENACTED')
  const letterByPurpose = new Map<string, string>()
  if (enactedPromos.length) {
    const letters = await prisma.letterRequest.findMany({
      where: {
        letterType: 'PROMOTION',
        purpose: { in: enactedPromos.map((r) => promotionLetterPurpose(r.id)) },
      },
      select: { id: true, purpose: true },
    })
    for (const l of letters) if (l.purpose) letterByPurpose.set(l.purpose, l.id)
  }

  const jobChanges = rows.map((r) => ({
    id: r.id,
    changeType: r.changeType,
    changeTypeLabel: JOB_CHANGE_TYPE_LABEL[r.changeType as JobChangeType] ?? r.changeType,
    effectiveDate: r.effectiveDate.toISOString(),
    status: r.status,
    reason: r.reason,
    decisionNote: r.decisionNote,
    requestedById: r.requestedById,
    requestedByName: userName.get(r.requestedById) ?? '—',
    enactedAt: r.enactedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    employee: {
      id: r.employee.id,
      fullName: r.employee.fullName,
      employeeCode: r.employee.employeeCode,
      designation: r.employee.designation,
      departmentName: r.employee.department?.name ?? null,
    },
    fromDesignation: r.fromDesignation,
    toDesignation: r.toDesignation,
    fromDepartmentName: r.fromDepartmentId ? deptName.get(r.fromDepartmentId) ?? null : null,
    toDepartmentName: r.toDepartmentId ? deptName.get(r.toDepartmentId) ?? null : null,
    fromManagerName: r.fromManagerId ? empName.get(r.fromManagerId) ?? null : null,
    toManagerName: r.toManagerId ? empName.get(r.toManagerId) ?? null : null,
    letterUrl: letterByPurpose.has(promotionLetterPurpose(r.id))
      ? `/letters/${letterByPurpose.get(promotionLetterPurpose(r.id))}/print`
      : null,
  }))

  return NextResponse.json({ jobChanges })
}

// POST /api/job-changes
// body: { employeeId, changeType, effectiveDate, toDesignation?, toDepartmentId?, toManagerId?, reason? }
// Requester: HR_ADMIN for anyone; otherwise only the employee's own reporting
// manager (server-enforced via Employee.reportingManagerId).
export async function POST(request: NextRequest) {
  const access = await resolveJobChangeAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.isPreviewMode) {
    return NextResponse.json({ error: 'Switch back to HR view to create job changes' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const employeeId = String(body.employeeId ?? '')
  const changeType = String(body.changeType ?? '') as JobChangeType
  const effectiveDate = body.effectiveDate ? new Date(body.effectiveDate) : null
  const toDesignation = (body.toDesignation ?? '').toString().trim() || null
  const toDepartmentId = (body.toDepartmentId ?? '').toString().trim() || null
  const toManagerId = (body.toManagerId ?? '').toString().trim() || null
  const reason = (body.reason ?? '').toString().trim() || null

  if (!employeeId) return NextResponse.json({ error: 'employeeId required' }, { status: 400 })
  if (!JOB_CHANGE_TYPES.includes(changeType)) {
    return NextResponse.json({ error: 'Invalid changeType' }, { status: 400 })
  }
  if (!effectiveDate || Number.isNaN(effectiveDate.getTime())) {
    return NextResponse.json({ error: 'Valid effectiveDate required' }, { status: 400 })
  }

  // Per-type target-field validation
  if ((changeType === 'PROMOTION' || changeType === 'DESIGNATION_CHANGE') && !toDesignation) {
    return NextResponse.json({ error: 'toDesignation is required for this change type' }, { status: 400 })
  }
  if (changeType === 'TRANSFER' && !toDepartmentId) {
    return NextResponse.json({ error: 'toDepartmentId is required for a transfer' }, { status: 400 })
  }
  if (changeType === 'MANAGER_CHANGE' && !toManagerId) {
    return NextResponse.json({ error: 'toManagerId is required for a manager change' }, { status: 400 })
  }
  // TRANSFER / MANAGER_CHANGE don't change the designation
  const cleanToDesignation =
    changeType === 'TRANSFER' || changeType === 'MANAGER_CHANGE' ? null : toDesignation
  // Only PROMOTION may optionally also move department/manager
  const cleanToDepartmentId =
    changeType === 'TRANSFER' || changeType === 'PROMOTION' ? toDepartmentId : null
  const cleanToManagerId =
    changeType === 'MANAGER_CHANGE' || changeType === 'PROMOTION' ? toManagerId : null

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true, fullName: true, designation: true, status: true,
      departmentId: true, reportingManagerId: true,
    },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  if (employee.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Job changes can only be requested for active employees' }, { status: 400 })
  }

  // Requester gate: HR admin for anyone; otherwise only the employee's own manager.
  const isHR = access.actualRole === 'HR_ADMIN'
  const isTheirManager = !!access.employeeId && employee.reportingManagerId === access.employeeId
  if (!isHR && !isTheirManager) {
    return NextResponse.json(
      { error: 'Only HR or the employee’s reporting manager can request a job change' },
      { status: 403 },
    )
  }

  // Target sanity checks
  if (cleanToManagerId) {
    if (cleanToManagerId === employeeId) {
      return NextResponse.json({ error: 'An employee cannot be their own manager' }, { status: 400 })
    }
    const mgr = await prisma.employee.findUnique({
      where: { id: cleanToManagerId },
      select: { id: true, status: true },
    })
    if (!mgr || mgr.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Target manager not found or inactive' }, { status: 400 })
    }
  }
  if (cleanToDepartmentId) {
    const dept = await prisma.department.findUnique({ where: { id: cleanToDepartmentId }, select: { id: true } })
    if (!dept) return NextResponse.json({ error: 'Target department not found' }, { status: 400 })
  }

  // One open request of a given type per employee at a time
  const open = await prisma.jobChange.findFirst({
    where: { employeeId, changeType, status: { in: ['PENDING_APPROVAL', 'APPROVED'] } },
    select: { id: true },
  })
  if (open) {
    return NextResponse.json(
      { error: `${employee.fullName} already has an open ${JOB_CHANGE_TYPE_LABEL[changeType].toLowerCase()} request` },
      { status: 409 },
    )
  }

  const created = await prisma.jobChange.create({
    data: {
      employeeId,
      changeType,
      effectiveDate,
      // from* snapshot captured server-side from the current Employee row
      fromDesignation: employee.designation,
      toDesignation: cleanToDesignation,
      fromDepartmentId: employee.departmentId,
      toDepartmentId: cleanToDepartmentId,
      fromManagerId: employee.reportingManagerId,
      toManagerId: cleanToManagerId,
      reason,
      status: 'PENDING_APPROVAL',
      requestedById: access.userId,
    },
  })

  // Notify HR (skip the requester if they're an HR admin themselves)
  const hrIds = await hrAdminEmployeeIds(access.userId)
  await notifyMany(hrIds, {
    type: 'GENERAL',
    title: `Job change requested: ${JOB_CHANGE_TYPE_LABEL[changeType]}`,
    message: `${access.userName} requested a ${JOB_CHANGE_TYPE_LABEL[changeType].toLowerCase()} for ${employee.fullName}${cleanToDesignation ? ` → ${cleanToDesignation}` : ''}.`,
    link: '/dashboard/lifecycle/job-changes',
  })

  return NextResponse.json({ jobChange: created }, { status: 201 })
}
