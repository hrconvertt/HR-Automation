/**
 * PATCH /api/documents/[id]
 *
 * HR-only. Currently supports toggling visibleToEmployee — used by the
 * eye / hide button in the Documents tab on employee profiles.
 *
 *   Body: { visibleToEmployee: boolean }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  if (!me || me.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  let body: { visibleToEmployee?: boolean } = {}
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (typeof body.visibleToEmployee !== 'boolean') {
    return NextResponse.json({ error: 'visibleToEmployee must be boolean' }, { status: 400 })
  }

  const updated = await prisma.employeeDocument.update({
    where: { id },
    data: { visibleToEmployee: body.visibleToEmployee },
    select: { id: true, visibleToEmployee: true },
  })
  return NextResponse.json({ document: updated })
}
