/**
 * GET    /api/leave/[id]/attachment — download the evidence on a request
 * POST   /api/leave/[id]/attachment — attach evidence to an existing request
 * DELETE /api/leave/[id]/attachment — remove it
 *
 * The detail page has been linking here since attachments existed, but the
 * route did not — so every prescription and date sheet uploaded with a request
 * was stored and unreachable.
 *
 * POST matters more than it looks. Evidence arrives after the fact far more
 * often than with the request: someone emails a prescription the next morning,
 * or HR is reconstructing a year of requests from the inbox and has the file in
 * hand but no way to put it anywhere. Without this the reason can say "medical
 * certificate attached" while nothing is.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const req = await prisma.leaveRequest.findUnique({
    where: { id },
    select: {
      attachmentBytes: true, attachmentMime: true, attachmentName: true,
      employee: { select: { id: true, reportingManagerId: true } },
    },
  })
  if (!req?.attachmentBytes) return NextResponse.json({ error: 'No attachment' }, { status: 404 })

  // A sick note is medical information. The person it belongs to, their manager
  // and HR — nobody else.
  const me = await prisma.user.findUnique({
    where: { id: payload.userId }, include: { employee: { select: { id: true } } },
  })
  const myEmpId = me?.employee?.id ?? null
  const allowed =
    payload.role === 'HR_ADMIN' ||
    payload.role === 'EXECUTIVE' ||
    req.employee.id === myEmpId ||
    req.employee.reportingManagerId === myEmpId
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const buf = Buffer.isBuffer(req.attachmentBytes)
    ? req.attachmentBytes
    : Buffer.from(req.attachmentBytes as unknown as ArrayBuffer)

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': req.attachmentMime ?? 'application/octet-stream',
      'Content-Length': String(buf.length),
      // inline so a prescription opens in the tab rather than landing in
      // Downloads every time someone checks it.
      'Content-Disposition': `inline; filename="${(req.attachmentName ?? 'attachment').replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId }, include: { employee: { select: { id: true } } },
  })
  const myEmpId = me?.employee?.id ?? null

  const req = await prisma.leaveRequest.findUnique({
    where: { id },
    select: { id: true, employee: { select: { id: true } } },
  })
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // HR files evidence for anyone; everyone else only for their own request.
  const allowed = payload.role === 'HR_ADMIN' || req.employee.id === myEmpId
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file received' }, { status: 400 })
  }

  const mime = file.type?.toLowerCase() ?? ''
  if (!ALLOWED.includes(mime)) {
    return NextResponse.json({
      error: 'Attach a PDF or an image (JPG, PNG, WebP).',
    }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'That file is over 5 MB.' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const name = (file.name || 'attachment').slice(0, 240)

  await prisma.leaveRequest.update({
    where: { id },
    data: {
      attachmentBytes: bytes,
      attachmentMime: mime,
      attachmentName: name,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: payload.userId,
      employeeId: req.employee.id,
      action: 'UPDATE',
      entity: 'LeaveRequest',
      entityId: id,
      newValue: JSON.stringify({ attachmentName: name, bytes: bytes.length }),
    },
  }).catch(() => { /* the file is saved; the audit row is best effort */ })

  return NextResponse.json({ ok: true, attachmentName: name, size: bytes.length })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }

  await prisma.leaveRequest.update({
    where: { id },
    data: { attachmentBytes: null, attachmentMime: null, attachmentName: null },
  })
  return NextResponse.json({ ok: true })
}
