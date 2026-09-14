/**
 * Help Center cases.
 *
 *   GET   the cases the viewer may see, newest first
 *   POST  create one — multipart (with an optional attachment) or JSON
 *         fields: forEmployeeId?, type, title, description, priority?, file?
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess } from '@/lib/talent'
import { caseScope, canCreateFor, createCase } from '@/lib/help-center-server'
import {
  CASE_TYPE_VALUES, CASE_TITLE_MAX, ATTACHMENT_TYPES, ATTACHMENT_MAX_BYTES, CASE_PRIORITIES,
} from '@/lib/help-center'

export async function GET(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const cases = await prisma.helpDeskTicket.findMany({
    where: caseScope(access),
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, caseNumber: true, subject: true, category: true, serviceTeam: true, status: true,
      priority: true, createdAt: true, updatedAt: true,
      employee: { select: { fullName: true, employeeCode: true } },
      _count: { select: { replies: true } },
    },
  })
  return NextResponse.json({ cases })
}

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.isPreviewMode) {
    return NextResponse.json({ error: 'Switch back to your own view to create a case.' }, { status: 403 })
  }

  let fields: Record<string, string> = {}
  let file: File | null = null
  const ct = request.headers.get('content-type') ?? ''
  if (ct.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'Could not read the form.' }, { status: 400 })
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string') fields[k] = v
      else if (k === 'file' && v.size > 0) file = v
    }
  } else {
    fields = (await request.json().catch(() => ({}))) as Record<string, string>
  }

  const forEmployeeId = fields.forEmployeeId || access.employeeId
  if (!forEmployeeId) return NextResponse.json({ error: 'Pick who the case is for.' }, { status: 400 })
  if (!(await canCreateFor(access, forEmployeeId))) {
    return NextResponse.json({ error: 'You cannot open a case for that person.' }, { status: 403 })
  }
  const target = await prisma.employee.findUnique({ where: { id: forEmployeeId }, select: { id: true } })
  if (!target) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 })

  const type = fields.type ?? ''
  if (!CASE_TYPE_VALUES.includes(type)) return NextResponse.json({ error: 'Pick a case type.' }, { status: 400 })
  const title = (fields.title ?? '').trim()
  if (!title) return NextResponse.json({ error: 'Give the case a title.' }, { status: 400 })
  if (title.length > CASE_TITLE_MAX) return NextResponse.json({ error: `Keep the title under ${CASE_TITLE_MAX} characters.` }, { status: 400 })
  const description = (fields.description ?? '').trim().slice(0, 10_000)
  const priority = (CASE_PRIORITIES as readonly string[]).includes(fields.priority ?? '') ? fields.priority : 'MEDIUM'

  let attachment: { bytes: Buffer; mime: string; name: string } | null = null
  if (file) {
    const mime = file.type?.toLowerCase() ?? ''
    if (!ATTACHMENT_TYPES.includes(mime)) return NextResponse.json({ error: 'Attach a PDF or an image (JPG, PNG, WebP).' }, { status: 400 })
    if (file.size > ATTACHMENT_MAX_BYTES) return NextResponse.json({ error: 'That file is over 5 MB.' }, { status: 400 })
    attachment = { bytes: Buffer.from(await file.arrayBuffer()), mime, name: (file.name || 'attachment').slice(0, 240) }
  }

  const created = await createCase({
    forEmployeeId,
    createdByUserId: access.userId,
    createdByEmployeeId: access.employeeId,
    createdByName: access.userName,
    type,
    title,
    description: description || title,
    priority,
    attachment,
  })
  return NextResponse.json({ case: created }, { status: 201 })
}
