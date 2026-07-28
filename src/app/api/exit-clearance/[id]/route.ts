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
import { notify } from '@/lib/notifications'
import { generateLetter } from '@/lib/letter-templates'
import { computeFinalSettlement } from '@/lib/final-settlement'
import { triggerEmail, employeeVars } from '@/lib/email-triggers'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
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
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Writes are blocked while an HR admin previews another role.
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'View-only while previewing role' }, { status: 403 })
  }

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

  if (action === 'RECOMPUTE_SETTLEMENT') {
    if (!isHR) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const settlement = await computeFinalSettlement(clearance.employeeId, clearance.lastWorkingDay)
    const c = await prisma.exitClearance.update({
      where: { id },
      data: {
        prorataSalary: settlement.prorataSalary,
        leaveEncashment: settlement.leaveEncashment,
        outstandingDeductions: settlement.outstandingDeductions,
        finalSettlementAmount: settlement.finalSettlementAmount,
      },
    })
    return NextResponse.json({ clearance: c })
  }

  if (action === 'INTERVIEW') {
    if (!isHR) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const data: Record<string, unknown> = {
      interviewReason: body.interviewReason as string | null ?? null,
      interviewNextRole: body.interviewNextRole as string | null ?? null,
      interviewMgrSupport: body.interviewMgrSupport != null ? Number(body.interviewMgrSupport) : null,
      interviewWorkEnv: body.interviewWorkEnv != null ? Number(body.interviewWorkEnv) : null,
      interviewCompensation: body.interviewCompensation != null ? Number(body.interviewCompensation) : null,
      interviewGrowth: body.interviewGrowth != null ? Number(body.interviewGrowth) : null,
      interviewWorkLife: body.interviewWorkLife != null ? Number(body.interviewWorkLife) : null,
      interviewImprovement: body.interviewImprovement as string | null ?? null,
      interviewRecommendScore: body.interviewRecommendScore != null ? Number(body.interviewRecommendScore) : null,
      interviewCompletedAt: now,
    }
    const c = await prisma.exitClearance.update({ where: { id }, data })
    return NextResponse.json({ clearance: c })
  }

  if (action === 'HANDOVER_SUBMIT') {
    if (!isSelf && !isHR) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const c = await prisma.exitClearance.update({
      where: { id },
      data: {
        handoverCurrentProjects: body.handoverCurrentProjects as string | null ?? null,
        handoverPendingTasks: body.handoverPendingTasks as string | null ?? null,
        handoverKeyContacts: body.handoverKeyContacts as string | null ?? null,
        handoverDocLocations: body.handoverDocLocations as string | null ?? null,
        handoverPasswords: body.handoverPasswords as string | null ?? null,
        handoverSignedAt: now,
      },
    })
    return NextResponse.json({ clearance: c })
  }

  if (action === 'HANDOVER_CONFIRM') {
    // Manager (or HR) confirms handover received
    const emp = await prisma.employee.findUnique({ where: { id: clearance.employeeId }, select: { reportingManagerId: true } })
    const isMgr = !!emp?.reportingManagerId && me.employee?.id === emp.reportingManagerId
    if (!isHR && !isMgr) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const c = await prisma.exitClearance.update({
      where: { id },
      data: { handoverSignedByMgr: true },
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

    // Require all 7 sections.
    const sec2 = clearance.itCleared && clearance.financeCleared && clearance.adminCleared && clearance.hrCleared
    const sec3 = clearance.duesCleared
    const sec4 = clearance.employeeAcknowledged
    const sec5 = !!clearance.hrCertifiedAt
    const sec6 = !!clearance.interviewCompletedAt
    const sec7 = !!clearance.handoverSignedAt && clearance.handoverSignedByMgr
    if (!sec2 || !sec3 || !sec4 || !sec5 || !sec6 || !sec7) {
      return NextResponse.json({
        error: 'All 7 sections required',
        missing: { sec2: !sec2, sec3: !sec3, sec4: !sec4, sec5: !sec5, sec6: !sec6, sec7: !sec7 },
      }, { status: 400 })
    }

    // Mark COMPLETED + disable login + flag exit on Employee.
    const c = await prisma.exitClearance.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: now },
    })

    // Close out the originating Termination workflow (if any) so it doesn't
    // sit in IN_EXIT_CLEARANCE forever after clearance is done.
    if (clearance.terminationId) {
      const term = await prisma.termination.findUnique({ where: { id: clearance.terminationId }, select: { activityLog: true, status: true } })
      if (term && term.status === 'IN_EXIT_CLEARANCE') {
        let log: unknown[] = []
        try { const parsed = JSON.parse(term.activityLog ?? '[]'); if (Array.isArray(parsed)) log = parsed } catch { /* ignore */ }
        log.push({ at: now.toISOString(), by: 'System', action: 'COMPLETED', note: 'Exit clearance completed — workflow closed' })
        await prisma.termination.update({
          where: { id: clearance.terminationId },
          data: { status: 'COMPLETED', activityLog: JSON.stringify(log) },
        }).catch(() => {})
      }
    }
    const emp = await prisma.employee.findUnique({
      where: { id: clearance.employeeId },
      select: {
        userId: true, status: true, fullName: true, employeeCode: true, designation: true,
        joiningDate: true, exitDate: true, cnic: true,
        department: { select: { name: true } },
      },
    })
    if (emp?.userId) {
      await prisma.user.update({ where: { id: emp.userId }, data: { isActive: false } }).catch(() => {})
    }
    const exitAt = clearance.lastWorkingDay ?? now
    if (emp && emp.status !== 'RESIGNED' && emp.status !== 'TERMINATED') {
      await prisma.employee.update({ where: { id: clearance.employeeId }, data: { status: 'RESIGNED', exitDate: exitAt } }).catch(() => {})
    } else {
      await prisma.employee.update({ where: { id: clearance.employeeId }, data: { exitDate: exitAt } }).catch(() => {})
    }

    // Auto-generate Experience + Relieving letters.
    if (emp) {
      const year = now.getFullYear()
      const prefix = `CON-LTR-${year}-`
      // Allocate two sequential letter numbers (count once, then ++).
      const countThisYear = await prisma.letterRequest.count({ where: { letterNumber: { startsWith: prefix } } })
      const expNum = `${prefix}${String(countThisYear + 1).padStart(3, '0')}`
      const relNum = `${prefix}${String(countThisYear + 2).padStart(3, '0')}`
      const empInput = {
        fullName: emp.fullName,
        employeeCode: emp.employeeCode,
        designation: emp.designation,
        joiningDate: emp.joiningDate,
        exitDate: exitAt,
        cnic: emp.cnic,
        department: emp.department?.name ?? null,
      }
      const signedBy = { name: 'HR Department', title: 'Convertt HR' }
      const experience = generateLetter('EXPERIENCE', empInput, { letterType: 'EXPERIENCE', purpose: 'Issued on exit clearance completion' }, signedBy)
      const relieving = generateLetter('RELIEVING', empInput, { letterType: 'RELIEVING', purpose: 'Issued on exit clearance completion' }, signedBy)
      const [expL, relL] = await Promise.all([
        prisma.letterRequest.create({
          data: {
            letterNumber: expNum,
            employeeId: clearance.employeeId,
            letterType: 'EXPERIENCE',
            status: 'APPROVED',
            letterBody: experience.body,
            signedByName: signedBy.name,
            signedByTitle: signedBy.title,
            reviewedAt: now,
            reviewedById: payload.userId,
            purpose: 'Exit clearance completion',
          },
        }).catch((e) => { console.error('[exit] experience letter failed', e); return null }),
        prisma.letterRequest.create({
          data: {
            letterNumber: relNum,
            employeeId: clearance.employeeId,
            letterType: 'RELIEVING',
            status: 'APPROVED',
            letterBody: relieving.body,
            signedByName: signedBy.name,
            signedByTitle: signedBy.title,
            reviewedAt: now,
            reviewedById: payload.userId,
            purpose: 'Exit clearance completion',
          },
        }).catch((e) => { console.error('[exit] relieving letter failed', e); return null }),
      ])
      await prisma.exitClearance.update({
        where: { id },
        data: {
          experienceLetterId: expL?.id ?? null,
          relievingLetterId: relL?.id ?? null,
        },
      }).catch(() => {})

      await notify({
        employeeId: clearance.employeeId,
        type: 'GENERAL',
        title: 'Experience and Relieving letters ready',
        message: `Your Experience (${expNum}) and Relieving (${relNum}) letters are now available in Documents.`,
        link: '/dashboard/letters',
      })

      // OFF-07 clearance.completed + OFF-08/09 employee.exited
      const vars = {
        ...employeeVars({ fullName: emp.fullName, designation: emp.designation, department: { name: emp.department?.name ?? '' } }),
        'Last Working Day': exitAt.toLocaleDateString('en-GB', { dateStyle: 'long' }),
      }
      await triggerEmail({
        event: 'clearance.completed',
        employeeId: clearance.employeeId,
        variables: vars,
        createdById: payload.userId,
        dedupeSalt: id,
      })
      await triggerEmail({
        event: 'employee.exited',
        employeeId: clearance.employeeId,
        variables: vars,
        conditionContext: { settlement_computed: !!clearance.finalSettlementAmount, 'flag.alumni_optin': false },
        createdById: payload.userId,
        dedupeSalt: id,
      })
    }

    return NextResponse.json({ clearance: c })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'View-only while previewing role' }, { status: 403 })
  }

  const clearance = await prisma.exitClearance.findUnique({ where: { id } })
  if (!clearance) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (clearance.status === 'COMPLETED') {
    return NextResponse.json({ error: 'Cannot cancel a completed clearance' }, { status: 400 })
  }

  await prisma.exitClearance.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
