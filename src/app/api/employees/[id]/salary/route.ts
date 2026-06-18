import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import { sendEmail, compensationChangeEmail } from '@/lib/email'
import { triggerEmail, employeeVars } from '@/lib/email-triggers'

interface RouteParams { params: Promise<{ id: string }> }

async function requireHR(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!hasRole(payload, 'HR_ADMIN')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'Switch back to HR view' }, { status: 403 }) }
  }
  return { payload }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  const salary = await prisma.salary.findUnique({ where: { employeeId: id } })
  return NextResponse.json({ salary })
}

/**
 * Update salary. Auto-writes a CompensationHistory row capturing the change.
 *
 * Body: { basic, houseRent, utilities, food, fuel, medicalAllowance, otherAllowance,
 *         effectiveFrom, type, reason, notifyEmployee }
 *
 * - `type`     INCREMENT | PROMOTION | BONUS | ADJUSTMENT  (default INCREMENT)
 * - `reason`   free text
 * - `notifyEmployee` if true, send in-app notification to the employee
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = await requireHR(request)
  if (auth.error) return auth.error
  const { id } = await params

  try {
    const body = await request.json()
    const {
      basic, houseRent, utilities, food, fuel, medicalAllowance, otherAllowance,
      effectiveFrom, type, reason, notes, notifyEmployee, monthlyPayDay,
    } = body

    // Validate
    if (basic == null || basic < 0) {
      return NextResponse.json({ error: 'Basic salary is required' }, { status: 400 })
    }
    const effective = effectiveFrom ? new Date(effectiveFrom) : new Date()

    const newGross =
      basic + (houseRent ?? 0) + (utilities ?? 0) + (food ?? 0) +
      (fuel ?? 0) + (medicalAllowance ?? 0) + (otherAllowance ?? 0)

    // Get existing salary (if any) to compute the change
    const existing = await prisma.salary.findUnique({ where: { employeeId: id } })
    const oldGross = existing
      ? existing.basic + existing.houseRent + existing.utilities + existing.food +
        existing.fuel + existing.medicalAllowance + existing.otherAllowance
      : 0

    // Upsert salary + write history row in one transaction. We capture the
    // new CompensationHistory row id so we can render an Increment Letter PDF
    // out-of-band after the txn commits.
    let newHistoryId: string | null = null
    const result = await prisma.$transaction(async (tx) => {
      // Normalise monthlyPayDay (1–31, or null to clear)
      const payDay = monthlyPayDay == null
        ? null
        : Number.isFinite(Number(monthlyPayDay)) && Number(monthlyPayDay) >= 1 && Number(monthlyPayDay) <= 31
          ? Number(monthlyPayDay)
          : null

      const salary = await tx.salary.upsert({
        where: { employeeId: id },
        update: {
          basic, houseRent: houseRent ?? 0, utilities: utilities ?? 0,
          food: food ?? 0, fuel: fuel ?? 0,
          medicalAllowance: medicalAllowance ?? 0, otherAllowance: otherAllowance ?? 0,
          effectiveFrom: effective,
          monthlyPayDay: payDay,
        },
        create: {
          employeeId: id,
          basic, houseRent: houseRent ?? 0, utilities: utilities ?? 0,
          food: food ?? 0, fuel: fuel ?? 0,
          medicalAllowance: medicalAllowance ?? 0, otherAllowance: otherAllowance ?? 0,
          effectiveFrom: effective,
          monthlyPayDay: payDay,
        },
      })

      // Write history (only if there's a real change, or it's the first record)
      if (oldGross !== newGross) {
        const pct = oldGross > 0 ? ((newGross - oldGross) / oldGross) * 100 : null
        const hist = await tx.compensationHistory.create({
          data: {
            employeeId: id,
            type: type ?? (existing ? 'ADJUSTMENT' : 'INITIAL'),
            oldSalary: oldGross,
            newSalary: newGross,
            incrementPct: pct,
            reason: reason ?? null,
            notes: notes ?? null,
            effectiveDate: effective,
            approvedById: auth.payload!.userId,
          },
        })
        newHistoryId = hist.id
      }

      return salary
    })

    // Auto-generate Increment Letter document + notification.
    // Only fires for INCREMENT / PROMOTION / ADJUSTMENT (real comp changes),
    // not the very first INITIAL setup at hire-time and not for BONUS.
    const isLetterWorthy =
      newHistoryId &&
      oldGross > 0 &&
      ['INCREMENT', 'PROMOTION', 'ADJUSTMENT'].includes(type ?? 'INCREMENT')
    if (isLetterWorthy && newHistoryId) {
      try {
        const effectiveLabel = effective.toISOString().slice(0, 10)
        await prisma.employeeDocument.create({
          data: {
            employeeId: id,
            type: 'INCREMENT_LETTER',
            name: `Increment Letter — ${effectiveLabel}`,
            url: `/increment-letter/${newHistoryId}/print`,
            uploadedById: auth.payload!.userId,
            visibleToEmployee: true,
          },
        })
      } catch (e) {
        console.error('[salary] failed to write increment-letter document:', e)
      }
    }

    // Notify employee outside the transaction (in-app bell + email)
    if (notifyEmployee && oldGross !== newGross) {
      const diff = newGross - oldGross
      const verb = diff > 0 ? 'increased' : 'updated'

      // 1) In-app bell notification — link points at the printable increment
      //    letter when we generated one, otherwise the compensation tab.
      const letterLink = newHistoryId
        ? `/increment-letter/${newHistoryId}/print`
        : `/dashboard/employees/${id}?tab=compensation`
      await notify({
        employeeId: id,
        type: 'GENERAL',
        title: '💼 Your salary has been revised',
        message: `Your gross salary has been ${verb} effective ${effective.toLocaleDateString('en-GB', { dateStyle: 'long' })}. View letter.`,
        link: letterLink,
      })

      // 2) Email (queued if SMTP not configured)
      const emp = await prisma.employee.findUnique({
        where: { id },
        select: { fullName: true, email: true },
      })
      if (emp?.email) {
        const { subject, html } = compensationChangeEmail({
          employeeName: emp.fullName,
          oldGross,
          newGross,
          effectiveDate: effective,
          type: type ?? 'ADJUSTMENT',
          reason: reason ?? null,
        })
        await sendEmail({ to: emp.email, subject, html })
      }

      // Template-driven trigger (LIF-04 increment / LIF-03 promotion)
      const triggerType = (type ?? 'INCREMENT').toUpperCase()
      const compType = triggerType === 'PROMOTION' ? 'promotion' : triggerType === 'BONUS' ? 'bonus' : 'increment'
      await triggerEmail({
        event: compType === 'promotion' ? 'employee.promoted' : 'compensation.changed',
        employeeId: id,
        variables: {
          ...employeeVars({ fullName: emp?.fullName, designation: null, department: null }),
          'New Gross': `PKR ${Math.round(newGross).toLocaleString('en-PK')}`,
          'Previous Gross': `PKR ${Math.round(oldGross).toLocaleString('en-PK')}`,
          'Effective Date': effective.toLocaleDateString('en-GB', { dateStyle: 'long' }),
        },
        conditionContext: { type: compType },
        createdById: auth.payload?.userId,
        dedupeSalt: newHistoryId || effective.toISOString(),
      })
    }

    return NextResponse.json({ salary: result })
  } catch (err) {
    console.error('[PUT /api/employees/[id]/salary]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
