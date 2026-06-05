import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

async function resolveAccess(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) return null
  const previewRole =
    user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  return {
    actualRole: user.role,
    effectiveRole: previewRole ?? user.role,
    employeeId: user.employee?.id ?? null,
  }
}

// PATCH /api/performance/pip/[id]
// Used for: adding check-ins, updating outcome
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const access = await resolveAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const pip = await prisma.pIP.findUnique({
    where: { id },
    include: { employee: { select: { reportingManagerId: true } } },
  })
  if (!pip) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isMyTeamMember = pip.employee.reportingManagerId === access.employeeId
  const isHR = access.effectiveRole === 'HR_ADMIN'

  if (!isMyTeamMember && !isHR) {
    return NextResponse.json({ error: 'Only HR or manager can update PIP' }, { status: 403 })
  }

  const data: Record<string, unknown> = {}
  if (body.checkIns !== undefined) {
    // append to checkIns (newline-separated)
    const existing = pip.checkIns ?? ''
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    data.checkIns = existing
      ? `${existing}\n\n[${dateStr}] ${body.checkIns}`
      : `[${dateStr}] ${body.checkIns}`
  }
  if (body.outcome !== undefined && isHR) {
    data.outcome = body.outcome
  }

  const updated = await prisma.pIP.update({ where: { id }, data })
  return NextResponse.json({ pip: updated })
}
