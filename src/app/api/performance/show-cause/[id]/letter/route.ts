/**
 * GET /api/performance/show-cause/[id]/letter — the signed notice exactly as sent.
 *
 * Readable by whoever can read the notice: HR, leadership, the employee, their
 * reporting manager, and anyone kept informed of it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined) ?? user.role

  const { id } = await params
  const notice = await prisma.showCause.findUnique({
    where: { id },
    select: {
      employeeId: true, informedIds: true, letterBlob: true, letterMime: true, letterName: true,
      employee: { select: { reportingManagerId: true } },
    },
  })
  if (!notice?.letterBlob) return NextResponse.json({ error: 'No signed notice on this record' }, { status: 404 })

  const me = user.employee?.id ?? null
  const allowed = role === 'HR_ADMIN' || role === 'EXECUTIVE'
    || (me !== null && (me === notice.employeeId || me === notice.employee.reportingManagerId || notice.informedIds.includes(me)))
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const name = (notice.letterName ?? 'Show Cause Notice.pdf').replace(/["\r\n]/g, '')
  return new NextResponse(new Uint8Array(notice.letterBlob), {
    headers: {
      'Content-Type': notice.letterMime ?? 'application/pdf',
      'Content-Disposition': `inline; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
