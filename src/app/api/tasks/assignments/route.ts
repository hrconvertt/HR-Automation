import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function getCtx() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = tok ? verifyToken(tok) : null
  if (!payload) return null
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, employee: { select: { id: true } } },
  })
  if (!me) return null
  const previewRole = c.get('hr_preview_role')?.value
  const effectiveRole = previewRole && me.role === 'HR_ADMIN' ? previewRole : me.role
  return { userId: me.id, employeeId: me.employee?.id ?? null, role: effectiveRole, preview: !!previewRole }
}

export async function GET(request: NextRequest) {
  const ctx = await getCtx()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(request.url)
  const scope = url.searchParams.get('scope') ?? 'mine' // mine | team | all

  const include = {
    template: { select: { name: true, expectedHours: true, complexity: true } },
    employee: { select: { id: true, fullName: true, employeeCode: true, designation: true, reportingManagerId: true } },
  } as const

  if (scope === 'all' && ctx.role === 'HR_ADMIN') {
    const rows = await prisma.taskAssignment.findMany({
      include,
      orderBy: { assignedAt: 'desc' },
      take: 500,
    })
    return NextResponse.json({ assignments: rows })
  }

  if (scope === 'team') {
    if (!ctx.employeeId) return NextResponse.json({ assignments: [] })
    const rows = await prisma.taskAssignment.findMany({
      where: { employee: { reportingManagerId: ctx.employeeId } },
      include,
      orderBy: { assignedAt: 'desc' },
      take: 500,
    })
    return NextResponse.json({ assignments: rows })
  }

  // default: mine
  if (!ctx.employeeId) return NextResponse.json({ assignments: [] })
  const rows = await prisma.taskAssignment.findMany({
    where: { employeeId: ctx.employeeId },
    include,
    orderBy: { assignedAt: 'desc' },
    take: 200,
  })
  return NextResponse.json({ assignments: rows })
}

// Manager / HR assigns a task
export async function POST(request: NextRequest) {
  const ctx = await getCtx()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['HR_ADMIN', 'MANAGER'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Only managers or HR can assign tasks' }, { status: 403 })
  }
  if (ctx.preview) return NextResponse.json({ error: 'Preview mode cannot assign' }, { status: 403 })

  const body = await request.json()
  const employeeId = String(body.employeeId || '')
  if (!employeeId) return NextResponse.json({ error: 'Employee required' }, { status: 400 })

  // If MANAGER, ensure employee is in their reports
  if (ctx.role === 'MANAGER') {
    const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { reportingManagerId: true } })
    if (!emp || emp.reportingManagerId !== ctx.employeeId) {
      return NextResponse.json({ error: 'Employee is not in your reports' }, { status: 403 })
    }
  }

  const templateId = body.templateId ? String(body.templateId) : null
  const customName = body.customName ? String(body.customName).trim() : null
  const customExpectedHours = body.customExpectedHours != null ? Number(body.customExpectedHours) : null
  if (!templateId && !customName) {
    return NextResponse.json({ error: 'Either templateId or customName is required' }, { status: 400 })
  }
  if (!templateId && (!customExpectedHours || customExpectedHours <= 0)) {
    return NextResponse.json({ error: 'Custom task needs expected hours' }, { status: 400 })
  }

  const created = await prisma.taskAssignment.create({
    data: {
      employeeId,
      templateId,
      customName,
      customExpectedHours,
      assignedById: ctx.userId,
      notes: body.notes ? String(body.notes).slice(0, 2000) : null,
    },
  })
  return NextResponse.json({ assignment: created }, { status: 201 })
}
