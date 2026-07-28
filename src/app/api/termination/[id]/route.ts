/**
 * /api/termination/[id]
 *
 * GET — fetch one termination with employee + linked ShowCause.
 *       HR_ADMIN + EXECUTIVE + the affected employee themselves.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const previewRole = request.cookies.get('hr_preview_role')?.value
  const effectiveRole = previewRole ?? me.role

  const termination = await prisma.termination.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          joiningDate: true, email: true,
          department: { select: { name: true } },
          reportingManager: { select: { id: true, fullName: true } },
        },
      },
    },
  })
  if (!termination) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isHR = effectiveRole === 'HR_ADMIN'
  const isExec = effectiveRole === 'EXECUTIVE'
  const isSelf = me.employee?.id === termination.employeeId
  if (!isHR && !isExec && !isSelf) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let showCause: unknown = null
  if (termination.showCauseId) {
    showCause = await prisma.showCause.findUnique({
      where: { id: termination.showCauseId },
      select: { id: true, issueType: true, status: true, description: true, issueDate: true, occurrenceNo: true },
    })
  }

  return NextResponse.json({ termination, showCause })
}
