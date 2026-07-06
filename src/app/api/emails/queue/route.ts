import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { buildEmail, type EmailTrigger } from '@/lib/email-templates'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  const where: Record<string, unknown> = {}
  if (status) where.status = status

  const drafts = await prisma.emailDraft.findMany({
    where,
    include: { employee: { select: { fullName: true, employeeCode: true, designation: true } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ drafts })
}

// Create a new draft. Supports two modes:
//   1) trigger-based: { employeeId, trigger, extras? } â€” auto-builds subject + body from template
//   2) manual:        { employeeId?, toEmail, subject, bodyHtml, trigger?='CUSTOM' }
export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    const { employeeId, trigger, extras, toEmail, subject, bodyHtml, ccEmails, bccEmails, triggerRefId } = body

    let finalSubject = subject
    let finalBody = bodyHtml
    let finalTo = toEmail
    let finalToName: string | undefined
    let empId = employeeId

    if (trigger && employeeId && trigger !== 'CUSTOM') {
      const emp = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: { department: true, salary: true, reportingManager: true },
      })
      if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

      const parsedExtras: Record<string, Date | string | undefined> = {}
      if (extras?.effectiveDate) parsedExtras.effectiveDate = new Date(extras.effectiveDate)
      if (extras?.lastWorkingDay) parsedExtras.lastWorkingDay = new Date(extras.lastWorkingDay)
      if (extras?.reason) parsedExtras.reason = extras.reason

      const built = buildEmail(trigger as EmailTrigger, emp, parsedExtras as { effectiveDate?: Date; lastWorkingDay?: Date; reason?: string })
      finalSubject = subject ?? built.subject
      finalBody = bodyHtml ?? built.bodyHtml
      finalTo = toEmail ?? emp.email
      finalToName = emp.fullName
      empId = emp.id
    }

    if (!finalTo || !finalSubject || !finalBody) {
      return NextResponse.json({ error: 'toEmail, subject and bodyHtml are required (or trigger + employeeId)' }, { status: 400 })
    }

    const draft = await prisma.emailDraft.create({
      data: {
        employeeId: empId ?? null,
        toEmail: finalTo,
        toName: finalToName ?? null,
        ccEmails: ccEmails ?? null,
        bccEmails: bccEmails ?? null,
        subject: finalSubject,
        bodyHtml: finalBody,
        trigger: trigger ?? 'CUSTOM',
        triggerRefId: triggerRefId ?? null,
        createdById: payload.userId,
        status: 'DRAFT',
      },
    })
    return NextResponse.json({ draft })
  } catch (err) {
    console.error('[POST /api/emails/queue]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
