import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import {
  ONBOARDING_TEMPLATE, OFFBOARDING_TEMPLATE, expandTemplate,
} from '@/lib/journey-templates'
import { notify, notifyMany } from '@/lib/notifications'
import { buildEmail, type EmailTrigger } from '@/lib/email-templates'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') // ONBOARDING | OFFBOARDING | null=both
  const status = searchParams.get('status') // optional

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const previewRole = user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  const myEmpId = user.employee?.id ?? null

  const where: Record<string, unknown> = {}
  if (type) where.type = type
  if (status) where.status = status

  // Role-scope
  if (effectiveRole === 'EMPLOYEE') {
    if (!myEmpId) return NextResponse.json({ journeys: [] })
    where.employeeId = myEmpId
  } else if (effectiveRole === 'MANAGER') {
    if (!myEmpId) return NextResponse.json({ journeys: [] })
    where.employee = { OR: [{ id: myEmpId }, { reportingManagerId: myEmpId }] }
  }
  // HR_ADMIN, EXECUTIVE see everything

  const journeys = await prisma.employeeJourney.findMany({
    where,
    include: {
      employee: { select: { id: true, fullName: true, employeeCode: true, designation: true, joiningDate: true, department: { select: { name: true } } } },
      tasks: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }] },
    },
    orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
  })

  return NextResponse.json({ journeys })
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { employeeId, type, reason, noticePeriodDays, targetEndDate, buddyId, successorId, notes } = body

    if (!employeeId || !type) {
      return NextResponse.json({ error: 'employeeId and type required' }, { status: 400 })
    }
    if (type !== 'ONBOARDING' && type !== 'OFFBOARDING') {
      return NextResponse.json({ error: 'type must be ONBOARDING or OFFBOARDING' }, { status: 400 })
    }

    // Prevent duplicate active journey of same type
    const existing = await prisma.employeeJourney.findFirst({
      where: { employeeId, type, status: 'IN_PROGRESS' },
    })
    if (existing) {
      return NextResponse.json({ error: `Active ${type} journey already exists for this employee` }, { status: 409 })
    }

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    const startDate = new Date()
    let anchor: Date
    let target: Date | null = null

    if (type === 'ONBOARDING') {
      // Anchor = joining date (or now if missing). Target = +90 days (probation end).
      anchor = employee.joiningDate ?? startDate
      target = new Date(anchor); target.setDate(target.getDate() + 90)
    } else {
      // Offboarding: target = supplied last working day (or anchor + noticePeriodDays)
      const period = noticePeriodDays ?? 30
      target = targetEndDate ? new Date(targetEndDate) : new Date(Date.now() + period * 24 * 60 * 60 * 1000)
      anchor = target
    }

    const tasks = expandTemplate(
      type === 'ONBOARDING' ? ONBOARDING_TEMPLATE : OFFBOARDING_TEMPLATE,
      anchor,
      {
        employeeType: employee.employeeType ?? undefined,
        reason: reason ?? undefined,
      },
    )

    const journey = await prisma.employeeJourney.create({
      data: {
        employeeId,
        type,
        reason: reason ?? null,
        noticePeriodDays: type === 'OFFBOARDING' ? (noticePeriodDays ?? 30) : null,
        startDate,
        targetEndDate: target,
        buddyId: buddyId ?? null,
        successorId: successorId ?? null,
        notes: notes ?? null,
        tasks: { create: tasks },
      },
      include: { tasks: true, employee: { select: { fullName: true, reportingManagerId: true } } },
    })

    // Notify employee
    await notify({
      employeeId,
      type: 'GENERAL',
      title: type === 'ONBOARDING' ? 'ðŸŽ‰ Welcome to Convertt!' : 'ðŸ“‹ Offboarding Process Started',
      message: type === 'ONBOARDING'
        ? `Your onboarding journey is live. Check your tasks in the Onboarding portal.`
        : `Your offboarding journey is set up. Last working day: ${target?.toLocaleDateString('en-GB')}.`,
      link: `/dashboard/journeys`,
    })

    // Notify manager
    if (journey.employee.reportingManagerId) {
      await notifyMany([journey.employee.reportingManagerId], {
        type: 'GENERAL',
        title: type === 'ONBOARDING' ? `ðŸŽ‰ New joiner: ${journey.employee.fullName}` : `ðŸ“‹ Offboarding: ${journey.employee.fullName}`,
        message: type === 'ONBOARDING'
          ? `Onboarding tasks have been assigned to you. Review them in the Onboarding portal.`
          : `Knowledge-transfer + announcement tasks await. See the Offboarding portal.`,
        link: `/dashboard/journeys`,
      })
    }

    // â”€â”€â”€ Auto-queue email drafts for HR review â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Onboarding â†’ Offer Letter (permanent or internship variant)
    // Offboarding (resignation/mutual) â†’ Notice Period email
    // Offboarding (termination*/layoff) â†’ Termination email
    try {
      const empFull = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: { department: true, salary: true, reportingManager: true },
      })
      if (empFull) {
        let emailTrigger: EmailTrigger | null = null
        if (type === 'ONBOARDING') {
          emailTrigger = ['INTERNSHIP', 'TRAINING'].includes(empFull.employeeType ?? '')
            ? 'OFFER_INTERN' : 'OFFER_PERMANENT'
        } else if (type === 'OFFBOARDING') {
          if (['TERMINATION_PERFORMANCE', 'TERMINATION_MISCONDUCT', 'LAYOFF'].includes(reason ?? '')) {
            emailTrigger = 'TERMINATION'
          } else {
            emailTrigger = 'NOTICE_PERIOD'
          }
        }
        if (emailTrigger && empFull.email) {
          const built = buildEmail(emailTrigger, empFull, {
            lastWorkingDay: target ?? undefined,
            reason: reason ?? 'As discussed.',
          })
          await prisma.emailDraft.create({
            data: {
              employeeId: empFull.id,
              toEmail: empFull.email,
              toName: empFull.fullName,
              ccEmails: 'hr@convertt.co',
              subject: built.subject,
              bodyHtml: built.bodyHtml,
              trigger: emailTrigger,
              triggerRefId: journey.id,
              createdById: payload.userId,
              status: 'DRAFT',
            },
          })
        }
      }
    } catch (err) {
      console.error('[journey email auto-queue]', err)
      // Non-fatal â€” the journey was created successfully
    }

    return NextResponse.json({ journey })
  } catch (err) {
    console.error('[POST /api/journeys]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
