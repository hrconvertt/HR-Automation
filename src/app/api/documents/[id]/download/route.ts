/**
 * GET /api/documents/[id]/download
 *
 * Streams the BYTEA blob with correct Content-Type. Same role gates as
 * the list endpoint — HR sees all, employee sees own, manager sees team.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const doc = await prisma.employeeDocument.findUnique({
    where: { id },
    select: {
      employeeId: true, name: true, fileBlob: true, fileMimeType: true,
      mimeType: true, fileSize: true, url: true, visibleToEmployee: true,
      employee: { select: { reportingManagerId: true } },
    },
  })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const previewRole = me.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? me.role
  const myEmpId = me.employee?.id ?? null

  const isPrivileged = effectiveRole === 'HR_ADMIN' || effectiveRole === 'EXECUTIVE'
  const isSelf = myEmpId === doc.employeeId
  const isManagerOf = effectiveRole === 'MANAGER' && myEmpId === doc.employee.reportingManagerId
  if (!(isPrivileged || isSelf || isManagerOf)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Even authorised employees can't fetch a doc HR has hidden.
  if (isSelf && !isPrivileged && !doc.visibleToEmployee) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // If no blob, this is a legacy doc with only a URL — redirect.
  if (!doc.fileBlob) {
    if (doc.url) return NextResponse.redirect(doc.url, 302)
    return NextResponse.json({ error: 'No content' }, { status: 404 })
  }

  const buf = Buffer.isBuffer(doc.fileBlob) ? doc.fileBlob : Buffer.from(doc.fileBlob as unknown as ArrayBuffer)
  const mime = doc.fileMimeType ?? doc.mimeType ?? 'application/octet-stream'
  const filename = doc.name.replace(/[^a-zA-Z0-9._-]/g, '_')

  // Convert Buffer to Uint8Array for the Web Response body (Buffer is a
  // subclass but TS prefers Uint8Array in the Response constructor types).
  const body = new Uint8Array(buf)
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(buf.length),
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
}

// DELETE /api/documents/[id]/download — HR-only blob removal
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me || me.role !== 'HR_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.employeeDocument.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
