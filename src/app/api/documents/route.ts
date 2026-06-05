/**
 * GET /api/documents?employeeId=...
 *
 *   Returns employee documents.
 *   Role enforcement (single DB, four roles):
 *     • HR_ADMIN / EXECUTIVE → any employee's documents
 *     • MANAGER              → their direct reports' documents only
 *     • EMPLOYEE             → their own documents only
 *     • Others               → 403
 *
 *   Without these checks, any authenticated user could enumerate other
 *   employees' documents by guessing IDs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve the caller's actual role + employeeId from the DB (don't
  // trust the token alone — roles can be revoked).
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // HR-previewing-as-another-role gets that role's scope.
  const previewRole = me.role === 'HR_ADMIN'
    ? request.cookies.get('hr_preview_role')?.value
    : undefined
  const effectiveRole = previewRole ?? me.role
  const myEmpId = me.employee?.id ?? null

  const { searchParams } = new URL(request.url)
  const employeeId = searchParams.get('employeeId') ?? ''
  if (!employeeId) return NextResponse.json({ documents: [] })

  // Permission gate per role.
  const isPrivileged = effectiveRole === 'HR_ADMIN' || effectiveRole === 'EXECUTIVE'
  const isSelf = myEmpId === employeeId

  let allowed = isPrivileged || isSelf
  if (!allowed && effectiveRole === 'MANAGER' && myEmpId) {
    // Manager: check the target employee actually reports to me.
    const target = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { reportingManagerId: true },
    })
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    allowed = target.reportingManagerId === myEmpId
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const documents = await prisma.employeeDocument.findMany({
    where: { employeeId },
    orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ documents })
}
