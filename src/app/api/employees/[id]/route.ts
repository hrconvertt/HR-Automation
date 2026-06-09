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
    return NextResponse.json({ error: 'HR Admin only' }, { status: 403 })
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
      select: { reportingManagerId: true, fullName: true },
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
    return NextResponse.json({ error: 'Switch back to HR view to terminate employees' }, { status: 403 })
  }

  const { id } = await params

  // Soft-terminate + disable login. Preserves the record for audit/payroll history.
  const emp = await prisma.employee.findUnique({
    where: { id },
    include: { user: { select: { id: true } } },
  })
  if (!emp) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id },
      data: {
        status: 'TERMINATED',
        exitDate: emp.exitDate ?? new Date(),
      },
    })
    if (emp.user) {
      // Self-heal: terminated employees can no longer log in.
      await tx.user.update({
        where: { id: emp.user.id },
        data: { isActive: false },
      })
    }
  })

  return NextResponse.json({ ok: true })
}
