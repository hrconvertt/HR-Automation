/**
 * Evidence on a leave or WFH request — many files, not one.
 *
 *   GET               list what is attached (names and sizes, never the bytes)
 *   POST              add one or more files
 *   DELETE ?fileId=   remove one
 *
 * The bytes never travel in a list response. They are megabytes each, the list
 * is rendered on every row of the register, and nothing on screen needs them
 * until somebody clicks a file.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024
const MAX_FILES = 10

async function canTouch(requestId: string, userId: string, role: string) {
  const req = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: { id: true, employee: { select: { userId: true } } },
  })
  if (!req) return { ok: false as const, status: 404, error: 'Not found' }
  const isHr = role === 'HR_ADMIN' || role === 'EXECUTIVE'
  const isOwner = req.employee.userId === userId
  if (!isHr && !isOwner) return { ok: false as const, status: 403, error: 'Forbidden' }
  return { ok: true as const, isHr }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const gate = await canTouch(id, payload.userId, payload.role)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const files = await prisma.leaveEvidence.findMany({
    where: { leaveRequestId: id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, mime: true, size: true, createdAt: true },
  })
  return NextResponse.json({ files })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const gate = await canTouch(id, payload.userId, payload.role)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: { files?: { base64?: string; mime?: string; name?: string }[] } = {}
  try { body = await request.json() } catch { /* validated below */ }
  const incoming = Array.isArray(body.files) ? body.files : []
  if (incoming.length === 0) {
    return NextResponse.json({ error: 'No files supplied.' }, { status: 400 })
  }

  const existing = await prisma.leaveEvidence.count({ where: { leaveRequestId: id } })
  if (existing + incoming.length > MAX_FILES) {
    return NextResponse.json({
      error: `A request holds at most ${MAX_FILES} files; this one already has ${existing}.`,
    }, { status: 400 })
  }

  const rows: { leaveRequestId: string; bytes: Buffer; mime: string; name: string; size: number; addedById: string }[] = []
  for (const f of incoming) {
    if (typeof f?.base64 !== 'string' || typeof f.mime !== 'string') {
      return NextResponse.json({ error: 'Each file needs base64 content and a type.' }, { status: 400 })
    }
    if (!ALLOWED.includes(f.mime.toLowerCase())) {
      return NextResponse.json({
        error: `${f.name ?? 'A file'} is not a PDF, JPG, PNG or WebP.`,
      }, { status: 400 })
    }
    let bytes: Buffer
    try { bytes = Buffer.from(f.base64, 'base64') } catch {
      return NextResponse.json({ error: 'Invalid file encoding.' }, { status: 400 })
    }
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json({
        error: `${f.name ?? 'A file'} is over 5 MB.`,
      }, { status: 400 })
    }
    rows.push({
      leaveRequestId: id,
      bytes,
      mime: f.mime,
      name: (typeof f.name === 'string' ? f.name : 'attachment').slice(0, 240),
      size: bytes.length,
      addedById: payload.userId,
    })
  }

  await prisma.leaveEvidence.createMany({ data: rows })

  // The old single-file columns still back the "has evidence" checks in the
  // sandwich rule and the Friday/Monday gate. Keep the first file mirrored
  // there so those keep answering correctly until they read the table.
  const first = await prisma.leaveEvidence.findFirst({
    where: { leaveRequestId: id }, orderBy: { createdAt: 'asc' },
    select: { name: true, mime: true, bytes: true },
  })
  if (first) {
    await prisma.leaveRequest.update({
      where: { id },
      data: { attachmentName: first.name, attachmentMime: first.mime, attachmentBytes: first.bytes },
    })
  }

  const files = await prisma.leaveEvidence.findMany({
    where: { leaveRequestId: id }, orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, mime: true, size: true, createdAt: true },
  })
  return NextResponse.json({ files })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  const fileId = request.nextUrl.searchParams.get('fileId')
  if (!fileId) return NextResponse.json({ error: 'fileId is required' }, { status: 400 })

  const file = await prisma.leaveEvidence.findUnique({
    where: { id: fileId }, select: { leaveRequestId: true },
  })
  if (!file || file.leaveRequestId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  await prisma.leaveEvidence.delete({ where: { id: fileId } })

  // Re-mirror, so removing the file the legacy columns pointed at does not
  // leave the request claiming evidence it no longer has.
  const next = await prisma.leaveEvidence.findFirst({
    where: { leaveRequestId: id }, orderBy: { createdAt: 'asc' },
    select: { name: true, mime: true, bytes: true },
  })
  await prisma.leaveRequest.update({
    where: { id },
    data: next
      ? { attachmentName: next.name, attachmentMime: next.mime, attachmentBytes: next.bytes }
      : { attachmentName: null, attachmentMime: null, attachmentBytes: null },
  })

  const files = await prisma.leaveEvidence.findMany({
    where: { leaveRequestId: id }, orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, mime: true, size: true, createdAt: true },
  })
  return NextResponse.json({ files })
}
