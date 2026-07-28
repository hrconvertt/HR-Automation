/**
 * POST /api/recruiting/requisitions
 *
 *   Creates a JobRequisition.
 *
 *   â€¢ MANAGER caller â†’ request goes in with status='PENDING', requestedById set
 *     to the manager's employee.id. Awaits HR approval.
 *   â€¢ HR_ADMIN caller â†’ request goes in as 'OPEN' directly (admin override).
 *
 *   Notifies HR_ADMIN users when a manager submits a PENDING request.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { generateJD } from '@/lib/jd-generator'

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, employee: { select: { id: true, fullName: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Preview mode: HR can preview Manager view and still submit a request
  // (the request gets attributed to HR's own employee record). For other
  // role previews (Employee, Executive) we keep the block â€” they have no
  // legitimate reason to create requisitions.
  const previewRole = request.cookies.get('hr_preview_role')?.value
  const effectiveRole = (previewRole && me.role === 'HR_ADMIN')
    ? previewRole
    : me.role

  if (!['HR_ADMIN', 'MANAGER'].includes(effectiveRole)) {
    return NextResponse.json({ error: 'Only Managers or HR can create requisitions' }, { status: 403 })
  }

  const isHR      = effectiveRole === 'HR_ADMIN'
  const isManager = effectiveRole === 'MANAGER'

  const body = await request.json()
  const title         = String(body.title || '').trim()
  const departmentId  = body.departmentId ? String(body.departmentId) : null
  const positionLevel = body.positionLevel ? String(body.positionLevel) : null
  const type          = String(body.type || 'FULL_TIME')
  const vacancies     = Math.max(1, Number(body.vacancies) || 1)
  const requestReason = body.requestReason ? String(body.requestReason) : null
  const requestNote   = body.requestNote ? String(body.requestNote).trim().slice(0, 2000) : null
  const closingDate   = body.closingDate ? new Date(body.closingDate) : null
  const scoreThreshold = body.scoreThreshold != null
    ? Math.max(1, Math.min(100, Number(body.scoreThreshold) || 60))
    : 60

  if (!title) return NextResponse.json({ error: 'Job title is required' }, { status: 400 })
  if (isManager && !me.employee) {
    return NextResponse.json({ error: 'Your account has no employee record â€” contact HR' }, { status: 400 })
  }

  const status        = isHR ? 'OPEN' : 'PENDING'
  const requestedById = isManager ? me.employee!.id : null

  const created = await prisma.jobRequisition.create({
    data: {
      title, type, vacancies,
      departmentId, positionLevel,
      requestedById,
      requestReason, requestNote,
      closingDate,
      scoreThreshold,
      status,
      postedDate: status === 'OPEN' ? new Date() : null,
    },
  })

  // Auto-draft JD for HR-direct creates too (status===OPEN).
  // Manager-submitted requests get their JD draft when HR approves them,
  // handled in the [id]/route.ts decision path.
  if (status === 'OPEN') {
    const dept = departmentId
      ? await prisma.department.findUnique({ where: { id: departmentId }, select: { name: true } })
      : null
    const draft = generateJD({
      title, type, vacancies,
      departmentName: dept?.name,
      reason: requestReason,
      requestNote,
    })
    await prisma.jobRequisition.update({
      where: { id: created.id },
      data: { jdContent: draft, jdStatus: 'DRAFT_JD', jdGeneratedAt: new Date() },
    })
  }

  // Notify HR Admins when a manager submits a PENDING request
  if (status === 'PENDING') {
    // Find every HR_ADMIN user with an employee record (we notify per-employee)
    const hrs = await prisma.user.findMany({
      where: { role: 'HR_ADMIN', employee: { isNot: null } },
      select: { employee: { select: { id: true } } },
    })
    const managerName = me.employee?.fullName ?? 'A manager'
    await prisma.notification.createMany({
      data: hrs.filter((h) => h.employee).map((h) => ({
        employeeId: h.employee!.id,
        type: 'HIRING_REQUEST',
        title: `New hiring request â€” ${title}`,
        message: `${managerName} requested ${vacancies} ${vacancies === 1 ? 'hire' : 'hires'} for "${title}"`,
        link: `/dashboard/recruiting?tab=requests&id=${created.id}`,
      })),
    })
  }

  return NextResponse.json({ requisition: created }, { status: 201 })
}
