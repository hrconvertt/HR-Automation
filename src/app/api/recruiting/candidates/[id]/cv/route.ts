/**
 * GET /api/recruiting/candidates/[id]/cv — the CV uploaded for this candidate.
 *
 * HR, hiring managers and executives: the same people who can open the
 * requisition workspace.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (me.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined) ?? me.role
  if (!['HR_ADMIN', 'MANAGER', 'EXECUTIVE'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const file = await prisma.candidateCvFile.findUnique({ where: { candidateId: id } })
  if (!file) return NextResponse.json({ error: 'No CV was uploaded for this candidate.' }, { status: 404 })

  const name = file.name.replace(/["\r\n]/g, '')
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': file.mime,
      'Content-Disposition': `inline; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
