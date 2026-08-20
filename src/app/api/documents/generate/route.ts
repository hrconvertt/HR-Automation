/**
 * Generate a personalised HR document from employee data.
 *
 * GET  /api/documents/generate?type=offer_letter&employeeId=xxx
 *    â†’ returns HTML inline (browser opens it, user prints/saves as PDF)
 *
 * Access:
 *   - HR_ADMIN can generate any document for any employee
 *   - Employees can generate their own Experience Letter / Confirmation Letter
 *     (read-only docs that reference them)
 *   - Manager can generate Show Cause / Termination for direct reports
 *     (when their roles permit; otherwise HR-only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { generateDocument, type DocumentType, type DocumentExtras } from '@/lib/document-generator'

const ALWAYS_HR_ONLY: DocumentType[] = [
  'offer_letter', 'employment_agreement', 'employment_agreement_intern',
  'show_cause_notice', 'notice_period_letter', 'termination_letter',
  'confirmation_letter',
]

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') as DocumentType | null
  const employeeId = searchParams.get('employeeId')
  if (!type || !employeeId) {
    return NextResponse.json({ error: 'type and employeeId required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isHR = hasRole(payload, 'HR_ADMIN')
  const isOwn = user.employee?.id === employeeId

  if (ALWAYS_HR_ONLY.includes(type) && !isHR) {
    return NextResponse.json({ error: 'Only HR can generate this document' }, { status: 403 })
  }
  if (!isHR && !isOwn) {
    return NextResponse.json({ error: 'You may only generate documents for yourself' }, { status: 403 })
  }

  // Collect extras from query params
  const extras: DocumentExtras = {}
  if (searchParams.get('effectiveDate')) extras.effectiveDate = searchParams.get('effectiveDate')!
  if (searchParams.get('reportingTo')) extras.reportingTo = searchParams.get('reportingTo')!
  if (searchParams.get('concerns')) extras.concerns = searchParams.get('concerns')!
  if (searchParams.get('responseWindowDays')) extras.responseWindowDays = parseInt(searchParams.get('responseWindowDays')!) || undefined
  if (searchParams.get('lastWorkingDay')) extras.lastWorkingDay = searchParams.get('lastWorkingDay')!
  if (searchParams.get('terminationReason')) extras.terminationReason = searchParams.get('terminationReason')!
  if (searchParams.get('fnfAmount')) extras.fnfAmount = parseFloat(searchParams.get('fnfAmount')!) || undefined

  // The builder passes its edited fields base64-packed in one param, so the
  // Preview/Print link can carry the whole form without a query string a mile
  // long. Anything here layers on top of the query params above.
  const packed = searchParams.get('fields')
  if (packed) {
    try {
      const extra = JSON.parse(Buffer.from(packed, 'base64').toString('utf8'))
      Object.assign(extras, sanitizeOfferExtras(extra))
    } catch { /* ignore a bad pack — fall back to record values */ }
  }

  try {
    const { html } = await generateDocument(type, employeeId, extras)
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    console.error('[generate document]', err)
    return NextResponse.json({ error: 'Failed to generate document' }, { status: 500 })
  }
}

/** Whitelist + coerce the builder's editable fields. */
function sanitizeOfferExtras(v: Record<string, unknown>): DocumentExtras {
  const out: DocumentExtras = {}
  const str = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, 2000) : undefined)
  const num = (x: unknown) => {
    const n = Number(x)
    return Number.isFinite(n) && n >= 0 ? n : undefined
  }
  if (str(v.designation)) out.designation = str(v.designation)
  if (str(v.cnic)) out.cnic = str(v.cnic)
  if (str(v.city)) out.city = str(v.city)
  if (str(v.effectiveDate)) out.effectiveDate = str(v.effectiveDate)
  if (str(v.noticeConfirmed)) out.noticeConfirmed = str(v.noticeConfirmed)
  if (str(v.benefits)) out.benefits = str(v.benefits)
  if (num(v.grossSalary) !== undefined) out.grossSalary = num(v.grossSalary)
  if (num(v.conveyance) !== undefined) out.conveyance = num(v.conveyance)
  if (num(v.probationMonths) !== undefined) out.probationMonths = num(v.probationMonths)
  return out
}

/**
 * POST — save the builder's draft. Generates the letter from the edited fields
 * and stores it as a DocumentDraft, so reopening the letter shows this version.
 * HR only.
 */
export async function POST(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'HR only' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const type = body.type as DocumentType
  const employeeId = String(body.employeeId ?? '')
  if (!type || !employeeId) {
    return NextResponse.json({ error: 'type and employeeId required' }, { status: 400 })
  }

  const extras = sanitizeOfferExtras((body.fields ?? {}) as Record<string, unknown>)
  try {
    const { html } = await generateDocument(type, employeeId, extras)
    await prisma.documentDraft.upsert({
      where: { employeeId_docType: { employeeId, docType: type } },
      update: { html, editedById: payload.userId },
      create: { employeeId, docType: type, html, editedById: payload.userId },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[save document draft]', err)
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
  }
}
