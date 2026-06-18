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
  const payload = token ? await verifyToken(token) : null
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
