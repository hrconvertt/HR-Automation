/**
 * /api/exit-clearance/[id]
 *
 * GET   — fetch one clearance with employee + their active assets (auto-loaded
 *         for the Asset Return section).
 * PATCH — action on a section:
 *         { action: 'CLEAR_DEPT', dept: 'IT'|'FINANCE'|'ADMIN'|'HR' }
 *         { action: 'SETTLE', amount, notes }
 *         { action: 'ACKNOWLEDGE' }            (employee self-sign)
 *         { action: 'CERTIFY' }                (HR final sign-off)
 *         { action: 'COMPLETE' }               (close + disable login + set Employee.status)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clearance = await prisma.exitClearance.findUnique({
    where: { id },
    include: {
      employee: {
        include: {
          department: true,
          assets: { where: { returnedDate: null }, include: { asset: true } },
        },
      },
    },
  })
  if (!clearance) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // HR-full access; the employee in question can also see (for the acknowledgment step).
  const isHR = me.role === 'HR_ADMIN'
  const isSelf = me.employee?.id === clearance.employeeId
  if (!isHR && !isSelf) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json({ clearance })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clearance = await prisma.exitClearance.findUnique({ where: { id } })
  if (!clearance) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const action = String(body.action ?? '')
  const now = new Date()

  const isHR = me.role === 'HR_ADMIN'
  const isSelf = me.employee?.id === clearance.employeeId

  if (action === 'CLEAR_DEPT') {
    if (!isHR) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const dept = String(body.dept ?? '').toUpperCase()
    const updates: Record<string, unknown> = {}
    if (dept === 'IT')      { updates.itCleared = true;      updates.itClearedAt = now;      updates.itClearedBy = payload.userId }
    if (dept === 'FINANCE') { updates.financeCleared = true; updates.financeClearedAt = now; updates.financeClearedBy = payload.userId }
    if (dept === 'ADMIN')   { updates.adminCleared = true;   updates.adminClearedAt = now;   updates.adminClearedBy = payload.userId }
    if (dept === 'HR')      { updates.hrCleared = true;      updates.hrClearedAt = now;      updates.hrClearedBy = payload.userId }
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Unknown dept' }, { status: 400 })
    const c = await prisma.exitClearance.update({ where: { id }, data: updates })
    return NextResponse.json({ clearance: c })
  }

  if (action === 'SETTLE') {
    if (!isHR) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const amount = body.amount != null ? Number(body.amount) : null
    const c = await prisma.exitClearance.update({
      where: { id },
      data: {
        finalSettlementAmount: amount,
        settlementNotes: body.notes ? String(body.notes) : null,
        duesCleared: true,
      },
    })
    return NextResponse.json({ clearance: c })
  }

  if (action === 'ACKNOWLEDGE') {
    if (!isSelf && !isHR) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const c = await prisma.exitClearance.update({
      where: { id },
      data: { employeeAcknowledged: true, employeeSignedAt: now },
    })
    return NextResponse.json({ clearance: c })
  }

  if (action === 'CERTIFY') {
    if (!isHR) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const c = await prisma.exitClearance.update({
      where: { id },
      data: { hrCertifiedAt: now, hrCertifiedById: payload.userId },
    })
    return NextResponse.json({ clearance: c })
  }

  if (action === 'COMPLETE') {
    if (!isHR) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    // Mark COMPLETED + disable login + flag exit on Employee.
    const c = await prisma.exitClearance.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: now },
    })
    const emp = await prisma.employee.findUnique({ where: { id: clearance.employeeId }, select: { userId: true, status: true } })
    if (emp?.userId) {
      await prisma.user.update({ where: { id: emp.userId }, data: { isActive: false } }).catch(() => {})
    }
    if (emp && emp.status !== 'RESIGNED' && emp.status !== 'TERMINATED') {
      await prisma.employee.update({ where: { id: clearance.employeeId }, data: { status: 'RESIGNED', exitDate: now } }).catch(() => {})
    } else {
      await prisma.employee.update({ where: { id: clearance.employeeId }, data: { exitDate: now } }).catch(() => {})
    }
    return NextResponse.json({ clearance: c })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
