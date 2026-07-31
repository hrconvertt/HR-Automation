/**
 * POST /api/documents/[id]/extract
 *
 * HR-only. Reads the stored document with Claude and writes what it finds onto
 * the employee's profile.
 *
 * Only ever FILLS BLANKS. A value already on the profile is never overwritten
 * by a scan — OCR misreads digits, and `cnic` / `ibanAccount` feed payroll and
 * statutory filings. Anything that disagrees comes back as a conflict for HR to
 * settle by hand, the same rule the Employee Information Form importer follows.
 *
 *   Body: { dryRun?: boolean }   // true = report only, write nothing
 *   200:  { applied, conflicts, unchanged, note, wrote }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { extractFromDocument, ExtractionError } from '@/lib/document-extract'

export const maxDuration = 60

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  if (!me || me.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }
  // Reading identity documents into the profile is a real write; don't let it
  // happen while HR is previewing the app as somebody else.
  if (request.cookies.get('hr_preview_role')?.value) {
    return NextResponse.json(
      { error: 'Leave preview mode to extract from documents.' },
      { status: 403 },
    )
  }

  let body: { dryRun?: boolean } = {}
  try { body = await request.json() } catch { /* empty body is fine */ }
  const dryRun = body.dryRun === true

  const doc = await prisma.employeeDocument.findUnique({
    where: { id },
    select: {
      id: true, type: true, name: true, url: true,
      fileBlob: true, fileMimeType: true, mimeType: true,
      employee: { select: { id: true, fullName: true } },
    },
  })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!doc.fileBlob) {
    return NextResponse.json({
      error: doc.url
        ? 'This document is a link, not a stored file — the app holds no bytes to read. Download it and re-upload it to extract from it.'
        : 'This document has no file attached.',
    }, { status: 422 })
  }

  const bytes = Buffer.isBuffer(doc.fileBlob)
    ? doc.fileBlob
    : Buffer.from(doc.fileBlob as unknown as ArrayBuffer)

  let result
  try {
    result = await extractFromDocument({
      bytes,
      mimeType: doc.fileMimeType ?? doc.mimeType ?? 'application/octet-stream',
      docType: doc.type,
      fullName: doc.employee.fullName,
    })
  } catch (e) {
    if (e instanceof ExtractionError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error('[documents/extract] failed', e)
    return NextResponse.json({ error: 'Could not read this document.' }, { status: 502 })
  }

  // Compare against what the profile already holds.
  const fields = [...new Set(result.values.map((v) => v.field))]
  const current = fields.length
    ? await prisma.employee.findUnique({
        where: { id: doc.employee.id },
        select: Object.fromEntries(fields.map((f) => [f, true])) as Record<string, true>,
      }) as Record<string, unknown> | null
    : null

  const applied: { label: string; value: string }[] = []
  const conflicts: { label: string; existing: string; found: string }[] = []
  const unchanged: { label: string; value: string }[] = []
  const data: Record<string, string | Date> = {}

  for (const v of result.values) {
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(v.value) &&
      ['dob', 'cnicIssuedOn', 'cnicExpiresOn', 'cnicBirthDate'].includes(v.field)
    const parsed: string | Date = isDate ? new Date(`${v.value}T00:00:00.000Z`) : v.value

    const existing = current?.[v.field] ?? null
    if (existing === null || existing === undefined || existing === '') {
      data[v.field] = parsed
      applied.push({ label: v.label, value: v.value })
      continue
    }

    const existingText = existing instanceof Date
      ? existing.toISOString().slice(0, 10)
      : String(existing).trim()
    // Compare loosely so "35202-1234567-1" and "3520212345671" don't read as a
    // conflict, and neither does a difference in casing or spacing.
    const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (loose(existingText) === loose(v.value)) {
      unchanged.push({ label: v.label, value: existingText })
    } else {
      conflicts.push({ label: v.label, existing: existingText, found: v.value })
    }
  }

  const wrote = !dryRun && Object.keys(data).length > 0
  if (wrote) {
    await prisma.employee.update({ where: { id: doc.employee.id }, data })
  }

  return NextResponse.json({
    document: { id: doc.id, name: doc.name, type: doc.type },
    employee: { id: doc.employee.id, fullName: doc.employee.fullName },
    wrote,
    dryRun,
    applied,
    conflicts,
    unchanged,
    note: result.note,
  })
}
