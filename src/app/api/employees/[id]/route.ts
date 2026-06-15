/**
 * Per-employee CRUD.
 *
 *   GET   — role-scoped read.
 *           HR_ADMIN / EXECUTIVE → full record
 *           MANAGER              → self + direct reports (full record)
 *           Self                 → full own record
 *           Anyone else          → public-directory subset only (404 on private fields)
 *   PUT   — HR_ADMIN only (not in preview mode). Writes the whole row.
 *   DELETE— HR_ADMIN only. Soft-terminate (status=TERMINATED + exitDate).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

// Fields exposed to non-privileged peers (directory view)
const PUBLIC_FIELDS = {
  id: true,
  fullName: true,
  employeeCode: true,
  designation: true,
  workLocation: true,
  status: true,
  photoUrl: true,
  joiningDate: true,
  department: { select: { id: true, name: true } },
  position: { select: { id: true, title: true } },
  reportingManager: { select: { id: true, fullName: true } },
} as const

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Look up caller's actual employee + role (don't trust token alone for roles)
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const myEmpId = me.employee?.id ?? null

  const { id } = await params

  // First, resolve whether caller may see the FULL record (incl. CNIC, DOB,
  // bank, salary, leave balances) or only the directory subset.
  const isSelf = myEmpId === id
  const isPrivileged = me.role === 'HR_ADMIN' || me.role === 'EXECUTIVE'
  let isMyReport = false
  if (!isPrivileged && !isSelf && me.role === 'MANAGER' && myEmpId) {
    const target = await prisma.employee.findUnique({
      where: { id },
      select: { reportingManagerId: true },
    })
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    isMyReport = target.reportingManagerId === myEmpId
  }

  // HR/Exec/self → everything. Manager-of-this-report → everything EXCEPT
  // compensation data (salary, bank, leave balances belong to HR + employee).
  if (isPrivileged || isSelf) {
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        position: true,
        reportingManager: { select: { fullName: true } },
        salary: true,
        leaveBalances: true,
      },
    })
    if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ employee })
  }

  if (isMyReport) {
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        position: true,
        reportingManager: { select: { fullName: true } },
        // salary, bank fields, leaveBalances intentionally omitted
      },
    })
    if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // Strip sensitive identifiers — bank + statutory tax IDs are HR/self only.
    const {
      bankName: _bn, bankAccount: _ba, bankBranch: _bb,
      eobiNumber: _eobi, ntn: _ntn, sessiNumber: _sessi,
      ...safe
    } = employee
    return NextResponse.json({ employee: safe, scope: 'manager' })
  }

  // Directory view — public fields only
  const directory = await prisma.employee.findUnique({
    where: { id },
    select: PUBLIC_FIELDS,
  })
  if (!directory) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ employee: directory, partial: true })
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // HR_ADMIN only — read DB role, not token, to avoid stale tokens.
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  if (!me || me.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to edit employees' }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const {
      fullName, phone, cnic, dob, gender, address,
      temporaryAddress, workLocationAddress,
      emergencyContact, emergencyPhone, designation,
      departmentId, positionId, reportingManagerId,
      employeeType, status, workLocation, timings, workDays,
      confirmationDate, exitDate,
      // Bank fields
      bankName, bankAccount, bankBranch,
      // Statutory / Tax IDs (Pakistan)
      eobiNumber, ntn, sessiNumber,
      // Directory visibility (HR-controlled)
      hideFromDirectory,
    } = body

    // Capture old manager for ManagerHistory audit trail
    const prior = await prisma.employee.findUnique({
      where: { id },
      select: { reportingManagerId: true, fullName: true, status: true, userId: true },
    })

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        fullName,
        phone,
        cnic,
        dob: dob ? new Date(dob) : undefined,
        gender,
        address,
        temporaryAddress,
        workLocationAddress,
        emergencyContact,
        emergencyPhone,
        designation,
        departmentId,
        positionId,
        reportingManagerId: reportingManagerId === '' ? null : reportingManagerId,
        employeeType,
        status,
        workLocation,
        timings,
        workDays,
        confirmationDate: confirmationDate ? new Date(confirmationDate) : undefined,
        exitDate: exitDate ? new Date(exitDate) : undefined,
        bankName,
        bankAccount,
        bankBranch,
        eobiNumber,
        ntn,
        sessiNumber,
        // Only write when explicitly provided so legacy callers don't toggle it.
        ...(typeof hideFromDirectory === 'boolean' ? { hideFromDirectory } : {}),
      },
    })

    // Auto-disable login when status flips to INACTIVE (parallel to the
    // existing RESIGNED/TERMINATED/ABSCONDED flows handled elsewhere).
    if (status === 'INACTIVE' && prior?.status !== 'INACTIVE' && prior?.userId) {
      await prisma.user.update({ where: { id: prior.userId }, data: { isActive: false } }).catch(() => {})
    }

    // Auto-create ExitClearance when status flips to one of the 3 exit paths.
    // Idempotent: skip if an open (non-COMPLETED, non-CANCELLED) clearance
    // already exists for this employee. lastWorkingDay falls back to the
    // submitted exitDate (Edit Profile) or body.lastWorkingDay if present.
    const EXIT_STATUSES = ['RESIGNED', 'TERMINATED', 'LAYOFF'] as const
    const newStatusIsExit = EXIT_STATUSES.includes(status as typeof EXIT_STATUSES[number])
    if (newStatusIsExit && prior?.status !== status) {
      // Cancel is a hard-delete in this app; an existing row that isn't
      // COMPLETED means there's an open clearance we shouldn't duplicate.
      const openClearance = await prisma.exitClearance.findFirst({
        where: {
          employeeId: id,
          status: { not: 'COMPLETED' },
        },
        select: { id: true },
      })
      if (!openClearance) {
        const lwdSource = body.lastWorkingDay ?? exitDate ?? null
        const lastWorkingDay = lwdSource ? new Date(String(lwdSource)) : null
        const { computeFinalSettlement } = await import('@/lib/final-settlement')
        const settlement = await computeFinalSettlement(id, lastWorkingDay).catch(() => null)
        await prisma.exitClearance.create({
          data: {
            employeeId: id,
            initiatedById: payload.userId,
            lastWorkingDay,
            prorataSalary: settlement?.prorataSalary ?? null,
            leaveEncashment: settlement?.leaveEncashment ?? null,
            outstandingDeductions: settlement?.outstandingDeductions ?? null,
            finalSettlementAmount: settlement?.finalSettlementAmount ?? null,
          },
        }).catch((err) => {
          console.error('[auto-exit-clearance] create failed', err)
        })

        // Notify HR + employee's manager
        const { notify } = await import('@/lib/notifications')
        const statusLabel = status === 'LAYOFF' ? 'LAYOFF' : status
        const title = 'Exit clearance initiated'
        const message = `Exit clearance initiated for ${prior?.fullName ?? 'employee'} (status: ${statusLabel})`
        const link = '/dashboard/lifecycle?tab=exit'

        const hrUsers = await prisma.user.findMany({
          where: { role: 'HR_ADMIN' },
          select: { employee: { select: { id: true } } },
        })
        for (const u of hrUsers) {
          if (u.employee?.id) {
            await notify({ employeeId: u.employee.id, type: 'GENERAL', title, message, link })
          }
        }
        // Manager (if any)
        const targetEmp = await prisma.employee.findUnique({
          where: { id },
          select: { reportingManagerId: true },
        })
        if (targetEmp?.reportingManagerId) {
          await notify({
            employeeId: targetEmp.reportingManagerId,
            type: 'GENERAL',
            title,
            message,
            link,
          })
        }
      }
    }

    // Log manager change (ManagerHistory) + notify affected parties.
    if (prior && reportingManagerId !== undefined && (prior.reportingManagerId ?? null) !== (reportingManagerId === '' ? null : reportingManagerId)) {
      const newMgrId = reportingManagerId === '' ? null : reportingManagerId
      await prisma.managerHistory.create({
        data: {
          employeeId: id,
          oldManagerId: prior.reportingManagerId ?? null,
          newManagerId: newMgrId,
          changedById: payload.userId,
        },
      })
      const { notify } = await import('@/lib/notifications')
      // Notify employee + old + new manager
      await notify({ employeeId: id, type: 'GENERAL', title: 'Manager change', message: 'Your reporting manager has been updated.' })
      if (prior.reportingManagerId) await notify({ employeeId: prior.reportingManagerId, type: 'GENERAL', title: 'Team member moved out', message: `${prior.fullName} is no longer in your team.` })
      if (newMgrId) await notify({ employeeId: newMgrId, type: 'GENERAL', title: 'New team member', message: `${prior.fullName} now reports to you.` })
    }

    return NextResponse.json({ employee })
  } catch (error) {
    console.error('[PUT /api/employees/[id]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Two delete modes:
 *   ?mode=archive (default) — soft delete: status=TERMINATED,
 *     terminationType=INVOLUNTARY, exitDate=now, user.isActive=false.
 *     All historical data preserved (payslips, comp history, reviews).
 *   ?mode=hard — destructive cascade: removes the employee + every
 *     dependent row (used for demo data / data entry mistakes).
 *     Transaction-wrapped; user row is also dropped.
 *
 * Both modes write an AuditLog entry capturing who did it + which mode.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to delete employees' }, { status: 403 })
  }

  const { id } = await params
  const mode = request.nextUrl.searchParams.get('mode') === 'hard' ? 'hard' : 'archive'

  const emp = await prisma.employee.findUnique({
    where: { id },
    include: { user: { select: { id: true } } },
  })
  if (!emp) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (mode === 'archive') {
    // Soft delete — preserve historical data. Most appropriate for real exits.
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          status: 'TERMINATED',
          terminationType: emp.terminationType ?? 'INVOLUNTARY',
          exitDate: emp.exitDate ?? new Date(),
        },
      })
      if (emp.user) {
        await tx.user.update({
          where: { id: emp.user.id },
          data: { isActive: false },
        })
      }
    })

    try {
      await prisma.auditLog.create({
        data: {
          userId: payload.userId,
          employeeId: id,
          action: 'UPDATE',
          entity: 'Employee',
          entityId: id,
          oldValue: JSON.stringify({ status: emp.status, exitDate: emp.exitDate }),
          newValue: JSON.stringify({ status: 'TERMINATED', terminationType: 'INVOLUNTARY', mode: 'archive' }),
        },
      })
    } catch (auditErr) {
      console.error('[audit] Employee archive', auditErr)
    }

    return NextResponse.json({ ok: true, mode: 'archive' })
  }

  // ─── HARD DELETE ──────────────────────────────────────────────────────────
  // Cascade through every table that references this employee. Order matters:
  // child rows first, then the employee row, then the user row last. Any FK we
  // miss will surface as a P2003 — caller sees a 500 with the table name in
  // server logs so it can be patched.
  try {
    await prisma.$transaction(async (tx) => {
      // Audit log written FIRST (before employeeId FK becomes invalid). We
      // null the employeeId on the audit row since the employee won't exist.
      try {
        await tx.auditLog.create({
          data: {
            userId: payload.userId,
            employeeId: null,
            action: 'DELETE',
            entity: 'Employee',
            entityId: id,
            oldValue: JSON.stringify({
              employeeCode: emp.employeeCode,
              fullName: emp.fullName,
              email: emp.email,
              mode: 'hard',
            }),
          },
        })
      } catch (auditErr) {
        console.error('[audit] Employee hard delete', auditErr)
      }

      // Detach direct reports — they survive, but lose their manager pointer.
      await tx.employee.updateMany({
        where: { reportingManagerId: id },
        data: { reportingManagerId: null },
      })

      // Detach manager-history references that point to this employee as
      // old/new manager (the FK on those columns is a String, not a relation,
      // so no enforcement — but the data is meaningless without the row).
      // ManagerHistory.employeeId rows for THIS employee are deleted below.

      // Wipe AuditLog rows that reference this employee (other than the one
      // we just wrote, which has employeeId=null).
      await tx.auditLog.updateMany({
        where: { employeeId: id },
        data: { employeeId: null },
      })

      // Delete all dependent rows. Models with onDelete: Cascade
      // (TrustedDevice, EmployeeJourney) get cleaned automatically when the
      // Employee is deleted, but we delete them explicitly for clarity.
      await tx.attendancePunch.deleteMany({ where: { employeeId: id } })
      await tx.attendanceLog.deleteMany({ where: { employeeId: id } })
      await tx.leaveBalance.deleteMany({ where: { employeeId: id } })
      await tx.leaveRequest.deleteMany({ where: { employeeId: id } })
      await tx.payslip.deleteMany({ where: { employeeId: id } })
      await tx.compensationHistory.deleteMany({ where: { employeeId: id } })
      await tx.goal.deleteMany({ where: { employeeId: id } })
      await tx.performanceReview.deleteMany({ where: { employeeId: id } })
      await tx.showCause.deleteMany({ where: { employeeId: id } })
      await tx.employeeWarning.deleteMany({ where: { employeeId: id } })
      await tx.pIP.deleteMany({ where: { employeeId: id } })
      await tx.onboardingChecklist.deleteMany({ where: { employeeId: id } })
      await tx.employeeJourney.deleteMany({ where: { employeeId: id } })
      await tx.emailDraft.deleteMany({ where: { employeeId: id } })
      await tx.probationRecord.deleteMany({ where: { employeeId: id } })
      await tx.trainingRecord.deleteMany({ where: { employeeId: id } })
      await tx.certification.deleteMany({ where: { employeeId: id } })
      await tx.assetAssignment.deleteMany({ where: { employeeId: id } })
      await tx.employeeDocument.deleteMany({ where: { employeeId: id } })
      await tx.helpDeskTicket.deleteMany({ where: { employeeId: id } })
      await tx.notification.deleteMany({ where: { employeeId: id } })
      await tx.exitClearance.deleteMany({ where: { employeeId: id } })
      await tx.resignation.deleteMany({ where: { employeeId: id } })
      await tx.managerHistory.deleteMany({ where: { employeeId: id } })
      await tx.promotionRequest.deleteMany({ where: { employeeId: id } })
      await tx.onboardingFeedback.deleteMany({ where: { employeeId: id } })
      await tx.taskAssignment.deleteMany({ where: { employeeId: id } })
      await tx.letterRequest.deleteMany({ where: { employeeId: id } })
      await tx.trustedDevice.deleteMany({ where: { employeeId: id } })
      // JobOffer + JobRequisition (via "HiringRequests") reference this
      // employee but are recruiting-side artifacts. Null out rather than
      // delete to preserve the recruiting history.
      await tx.jobOffer.updateMany({
        where: { employeeId: id },
        data: { employeeId: null },
      })
      // Kudos: fromId/toId aren't nullable in the schema, so we have to
      // delete instead of detach. Losing the social-history row is the
      // unavoidable cost of a hard delete.
      await tx.kudos.deleteMany({
        where: { OR: [{ fromId: id }, { toId: id }] },
      })
      // CelebrationCard is keyed by forEmployeeId. Signatures cascade.
      await tx.celebrationCard.deleteMany({ where: { forEmployeeId: id } })
      // JobRequisition "HiringRequests" — null out instead of deleting
      // (recruiting pipeline history outlives the manager).
      await tx.jobRequisition.updateMany({
        where: { requestedById: id },
        data: { requestedById: null },
      })
      // Salary (1:1)
      await tx.salary.deleteMany({ where: { employeeId: id } })

      // Finally, the employee row.
      await tx.employee.delete({ where: { id } })

      // And the linked user row (if any). Cascade isn't on, so do it here.
      if (emp.user) {
        await tx.user.delete({ where: { id: emp.user.id } }).catch(() => undefined)
      }
    }, { timeout: 30_000 })

    return NextResponse.json({ ok: true, mode: 'hard' })
  } catch (err) {
    console.error('[DELETE /api/employees/[id]?mode=hard]', err)
    return NextResponse.json({
      error: 'Hard delete failed. Some related records may still reference this employee. Try Archive instead.',
    }, { status: 500 })
  }
}
