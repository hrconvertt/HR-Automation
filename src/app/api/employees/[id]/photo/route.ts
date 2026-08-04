/**
 * GET /api/employees/[id]/photo
 *
 * Serves an employee's profile picture — the newest PHOTO document filed
 * against them, streamed from its stored bytes.
 *
 * Deliberately gated only on "is signed in", unlike /api/documents/[id]/download
 * which is HR/self/manager. A profile picture is shown next to its owner's name
 * in the directory, the org chart, chat and approval queues, so every signed-in
 * colleague already sees it by design; gating it like a CNIC scan would just
 * render every avatar broken for ordinary staff.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canonicalDocName } from '@/lib/document-types'
import { verifyToken } from '@/lib/auth'

/** Browser-renderable formats only — this becomes an <img> on every screen. */
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_BYTES = 8 * 1024 * 1024

/**
 * Who may change this photo: HR (outside preview mode), or the employee
 * themselves. A manager can see a report's photo but not replace it.
 */
async function canEditPhoto(request: NextRequest, employeeId: string) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { ok: false as const, status: 401, error: 'Unauthorized' }

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) return { ok: false as const, status: 401, error: 'Unauthorized' }

  const inPreview = !!request.cookies.get('hr_preview_role')?.value
  const isHR = me.role === 'HR_ADMIN' && !inPreview
  const isSelf = me.employee?.id === employeeId
  if (!isHR && !isSelf) {
    return { ok: false as const, status: 403, error: 'You can only change your own profile photo.' }
  }
  return { ok: true as const }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const doc = await prisma.employeeDocument.findFirst({
    where: { employeeId: id, type: 'PHOTO', NOT: { fileBlob: null } },
    orderBy: { createdAt: 'desc' },
    select: { fileBlob: true, fileMimeType: true, mimeType: true, createdAt: true },
  })
  if (!doc?.fileBlob) return NextResponse.json({ error: 'No photo' }, { status: 404 })

  const buf = Buffer.isBuffer(doc.fileBlob)
    ? doc.fileBlob
    : Buffer.from(doc.fileBlob as unknown as ArrayBuffer)

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': doc.fileMimeType ?? doc.mimeType ?? 'image/jpeg',
      'Content-Length': String(buf.length),
      // Private: avatars are company-internal, so a shared cache must not hold
      // them. Revalidation keeps a changed photo from sticking around.
      'Cache-Control': 'private, max-age=300, must-revalidate',
    },
  })
}

/**
 * POST /api/employees/[id]/photo — replace the profile picture.
 * Body: multipart/form-data with a `file` field.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await canEditPhoto(request, id)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const employee = await prisma.employee.findUnique({ where: { id }, select: { id: true, fullName: true } })
  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let form: FormData
  try { form = await request.formData() } catch {
    return NextResponse.json({ error: 'Expected a file upload' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file received' }, { status: 400 })
  }
  const mime = (file.type || '').toLowerCase()
  if (!ALLOWED.has(mime)) {
    return NextResponse.json(
      { error: 'Use a JPEG, PNG, WebP or GIF image.' }, { status: 415 },
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is ${MAX_BYTES / 1024 / 1024}MB.` },
      { status: 413 },
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  // One profile photo per person: drop the previous one rather than letting
  // old pictures pile up invisibly in the Documents tab.
  await prisma.employeeDocument.deleteMany({
    where: { employeeId: id, type: 'PHOTO', name: { startsWith: 'Profile photo' } },
  })
  await prisma.employeeDocument.create({
    data: {
      employeeId: id,
      type: 'PHOTO',
      // The document is on this employee's record; repeating the name here
      // only makes it differ from every other row. See canonicalDocName.
      name: canonicalDocName('PHOTO'),
      url: '',
      fileBlob: bytes,
      fileMimeType: mime,
      fileSize: bytes.length,
      mimeType: mime,
      size: bytes.length,
      visibleToEmployee: true,
    },
  })
  // Cache-buster: the URL is stable, so without it the browser keeps showing
  // the old picture until the 5-minute cache expires.
  const photoUrl = `/api/employees/${id}/photo?v=${Date.now()}`
  await prisma.employee.update({ where: { id }, data: { photoUrl } })

  return NextResponse.json({ photoUrl })
}

/** DELETE /api/employees/[id]/photo — back to initials. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await canEditPhoto(request, id)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  await prisma.employeeDocument.deleteMany({
    where: { employeeId: id, type: 'PHOTO', name: { startsWith: 'Profile photo' } },
  })
  await prisma.employee.update({ where: { id }, data: { photoUrl: null } })
  return NextResponse.json({ photoUrl: null })
}
