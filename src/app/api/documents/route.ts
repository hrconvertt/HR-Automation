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
    // Don't ship blobs in the list payload — they're served via /download.
    select: {
      id: true, employeeId: true, type: true, name: true, url: true,
      size: true, mimeType: true, fileSize: true, fileMimeType: true,
      uploadedById: true, signedAt: true, expiryDate: true, createdAt: true,
    },
  })
  return NextResponse.json({ documents })
}

// POST /api/documents — multipart upload (name, type, file)
//
// HR can upload for anyone. Employees can upload to their own record.
// Manager can upload for their direct reports. Stored as BYTEA so we
// don't depend on external blob storage in early deployments.
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg', 'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const previewRole = me.role === 'HR_ADMIN'
    ? request.cookies.get('hr_preview_role')?.value
    : undefined
  const effectiveRole = previewRole ?? me.role
  const myEmpId = me.employee?.id ?? null

  // HR previewing as another role is a "view-only" — block uploads.
  if (me.role === 'HR_ADMIN' && previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'View-only while previewing role' }, { status: 403 })
  }

  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }

  const employeeId = String(form.get('employeeId') ?? '')
  const type = String(form.get('type') ?? 'OTHER')
  const name = String(form.get('name') ?? '').trim()
  const file = form.get('file')

  if (!employeeId || !name || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing employeeId, name, or file' }, { status: 400 })
  }

  // Auth: HR or self or manager-of-target.
  const isPrivileged = effectiveRole === 'HR_ADMIN'
  const isSelf = myEmpId === employeeId
  let allowed = isPrivileged || isSelf
  if (!allowed && effectiveRole === 'MANAGER' && myEmpId) {
    const target = await prisma.employee.findUnique({ where: { id: employeeId }, select: { reportingManagerId: true } })
    allowed = !!target && target.reportingManagerId === myEmpId
  }
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File exceeds 5MB' }, { status: 413 })
  if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: 'Unsupported file type. Allowed: PDF, JPG, PNG, DOCX.' }, { status: 415 })

  const buf = Buffer.from(await file.arrayBuffer())

  const doc = await prisma.employeeDocument.create({
    data: {
      employeeId,
      type,
      name,
      url: '',  // unused with blob storage; placeholder for legacy schema field
      size: buf.length,
      mimeType: file.type,
      fileBlob: buf,
      fileMimeType: file.type,
      fileSize: buf.length,
      uploadedById: payload.userId,
    },
    select: { id: true, name: true, type: true, fileSize: true, createdAt: true },
  })
  return NextResponse.json({ document: doc })
}
