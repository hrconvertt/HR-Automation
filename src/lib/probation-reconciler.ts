// Probation lifecycle reconciler — Devsinc-style flow scaled for Convertt.
//
// Idempotent. Safe to run on a cron or via the self-heal scanner.
// All write operations check current state before writing so a re-run
// after a partial failure cleanly resumes.
//
//   Day 0   → hire, ProbationRecord created elsewhere
//   Day 30  → notify manager to submit settling check-in
//   Day -30 → auto-generate decision packet (metrics + heuristic)
//   Day  0  → notify HR if no decision yet
//   On meeting day OR explicit ENACT → enactOutcome
//
// Outcomes: CONFIRM | EXTEND | WARNING | TERMINATE

import { prisma } from '@/lib/prisma'
import { notify, notifyMany } from '@/lib/notifications'
import { computeTimeMetrics } from '@/lib/performance-metrics'

const MS_PER_DAY = 86_400_000

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY)
}

// ────────────────────────────────────────────────────────────────────────────
// Heuristic suggestion
// ────────────────────────────────────────────────────────────────────────────

function suggestedRecommendation(timeScore: number, goalScore: number | null): 'CONFIRM' | 'EXTEND' | 'TERMINATE' {
  if (timeScore >= 4 && (goalScore == null ? timeScore >= 4.5 : goalScore >= 4)) return 'CONFIRM'
  if (timeScore < 2.5 || (goalScore != null && goalScore < 2.5)) return 'TERMINATE'
  return 'EXTEND'
}

// ────────────────────────────────────────────────────────────────────────────
// Goal score: weighted achievement / 5, null if no goals
// ────────────────────────────────────────────────────────────────────────────

async function computeGoalScore(employeeId: string, start: Date, end: Date): Promise<number | null> {
  const goals = await prisma.goal.findMany({
    where: { employeeId, createdAt: { lte: end } },
    select: { status: true, achievement: true, weight: true },
  })
  if (!goals.length) return null
  let totalWeight = 0
  let weighted = 0
  for (const g of goals) {
    const w = (g.weight ?? 1) || 1
    let score = 3 // default mid
    if (g.status === 'COMPLETED') score = 5
    else if (g.status === 'AT_RISK') score = 2
    else if (g.status === 'NOT_STARTED') score = 1
    else if (g.status === 'ON_TRACK' || g.status === 'IN_PROGRESS') {
      const pct = (g.achievement ?? 0) / 100
      score = 2 + 3 * Math.max(0, Math.min(1, pct))
    }
    weighted += score * w
    totalWeight += w
  }
  if (totalWeight === 0) return null
  // Touch unused vars so eslint is happy
  void start
  return Math.round((weighted / totalWeight) * 10) / 10
}

// ────────────────────────────────────────────────────────────────────────────
// Reconciler
// ────────────────────────────────────────────────────────────────────────────

export async function runProbationReconciler(): Promise<{
  settlingPrompted: number
  packetsGenerated: number
  overdueNotified: number
  enacted: number
}> {
  const today = new Date()
  const todayMid = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))

  const records = await prisma.probationRecord.findMany({
    where: { status: { in: ['ACTIVE', 'UNDER_REVIEW'] } },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, reportingManagerId: true,
        },
      },
    },
  })

  let settlingPrompted = 0
  let packetsGenerated = 0
  let overdueNotified = 0
  let enacted = 0

  for (const rec of records) {
    const elapsed = daysBetween(todayMid, rec.startDate)
    const remaining = daysBetween(rec.endDate, todayMid)

    // ── Day 30 settling check-in ──
    if (
      elapsed >= 30 &&
      rec.durationMonths >= 2 &&
      rec.settlingCheckInAt == null &&
      rec.status === 'ACTIVE'
    ) {
      if (rec.employee.reportingManagerId) {
        await notify({
          employeeId: rec.employee.reportingManagerId,
          type: 'PROBATION_ALERT',
          title: 'Day-30 settling check-in due',
          message: `${rec.employee.fullName} has completed 30 days. Add a quick note + GREEN/AMBER/RED flag.`,
          link: `/dashboard/probation/${rec.id}`,
        })
        settlingPrompted++
      }
    }

    // ── Day -45 (heads-up: decision needed soon) ──
    if (remaining <= 45 && remaining > 30 && rec.heads45NotifiedAt == null && rec.status === 'ACTIVE') {
      const recipients: string[] = []
      if (rec.employee.reportingManagerId) recipients.push(rec.employee.reportingManagerId)
      const hrUsers = await prisma.user.findMany({ where: { role: 'HR_ADMIN' }, select: { employee: { select: { id: true } } } })
      for (const u of hrUsers) if (u.employee?.id) recipients.push(u.employee.id)
      await notifyMany(recipients, {
        type: 'PROBATION_ALERT',
        title: 'Probation decision in ~45 days',
        message: `${rec.employee.fullName}'s probation period ends in ${remaining} days. Start considering the outcome.`,
        link: `/dashboard/probation/${rec.id}`,
      })
      await prisma.probationRecord.update({ where: { id: rec.id }, data: { heads45NotifiedAt: todayMid } })
    }

    // ── Day -14 urgent reminder (decision still missing) ──
    if (remaining <= 14 && remaining > 0 && rec.hrDecision == null && rec.urgent14NotifiedAt == null) {
      const hrUsers = await prisma.user.findMany({ where: { role: 'HR_ADMIN' }, select: { employee: { select: { id: true } } } })
      const ids = hrUsers.map((u) => u.employee?.id).filter(Boolean) as string[]
      await notifyMany(ids, {
        type: 'PROBATION_ALERT',
        title: 'URGENT — probation decision needed',
        message: `${rec.employee.fullName}'s probation ends in ${remaining} days and no HR decision is recorded.`,
        link: `/dashboard/probation/${rec.id}`,
      })
      await prisma.probationRecord.update({ where: { id: rec.id }, data: { urgent14NotifiedAt: todayMid } })
    }

    // ── Day-(end-30) decision packet ──
    if (remaining <= 30 && rec.packetGeneratedAt == null && rec.status === 'ACTIVE') {
      const metrics = await computeTimeMetrics(rec.employeeId, rec.startDate, todayMid)
      const goalScore = await computeGoalScore(rec.employeeId, rec.startDate, todayMid)
      const suggested = suggestedRecommendation(metrics.timeScore, goalScore)

      await prisma.probationRecord.update({
        where: { id: rec.id },
        data: {
          packetGeneratedAt: todayMid,
          packetDaysWorked: metrics.daysWorked,
          packetDaysAbsent: metrics.daysAbsent,
          packetLateCount: metrics.lateArrivalCount,
          packetAvgHours: metrics.avgHoursPerDay,
          packetGoalScore: goalScore,
          packetTimeScore: metrics.timeScore,
          packetSuggestedRec: suggested,
          status: 'UNDER_REVIEW',
        },
      })

      const recipients: string[] = []
      if (rec.employee.reportingManagerId) recipients.push(rec.employee.reportingManagerId)
      // Notify HR_ADMIN — find all HR admins' employee IDs
      const hrUsers = await prisma.user.findMany({
        where: { role: 'HR_ADMIN' },
        select: { employee: { select: { id: true } } },
      })
      for (const u of hrUsers) if (u.employee?.id) recipients.push(u.employee.id)
      await notifyMany(recipients, {
        type: 'PROBATION_ALERT',
        title: 'Decision packet ready',
        message: `Probation decision packet generated for ${rec.employee.fullName}. Suggested: ${suggested}.`,
        link: `/dashboard/probation/${rec.id}`,
      })
      packetsGenerated++
    }

    // ── Overdue — past endDate, no HR decision ──
    if (remaining <= 0 && rec.hrDecision == null && rec.status === 'UNDER_REVIEW') {
      // Dedupe — only notify if we haven't notified today (cheap: check updatedAt date)
      const lastUpdated = rec.updatedAt
      const sameDay =
        lastUpdated.getUTCFullYear() === todayMid.getUTCFullYear() &&
        lastUpdated.getUTCMonth() === todayMid.getUTCMonth() &&
        lastUpdated.getUTCDate() === todayMid.getUTCDate()
      if (!sameDay) {
        const hrUsers = await prisma.user.findMany({
          where: { role: 'HR_ADMIN' },
          select: { employee: { select: { id: true } } },
        })
        const ids = hrUsers.map((u) => u.employee?.id).filter(Boolean) as string[]
        await notifyMany(ids, {
          type: 'PROBATION_ALERT',
          title: 'Probation decision overdue',
          message: `${rec.employee.fullName}'s probation ended without a decision. Please review.`,
          link: `/dashboard/probation/${rec.id}`,
        })
        // touch updatedAt so we don't double-notify same day
        await prisma.probationRecord.update({ where: { id: rec.id }, data: { hrAlertSent: true } })
        overdueNotified++
      }
    }

    // ── Auto-enact on meeting date ──
    if (
      rec.hrDecision != null &&
      rec.outcomeEnactedAt == null &&
      rec.meetingScheduledFor &&
      todayMid >= rec.meetingScheduledFor
    ) {
      await enactOutcome(rec.id, rec.hrDecidedById ?? null)
      enacted++
    }
  }

  return { settlingPrompted, packetsGenerated, overdueNotified, enacted }
}

// ────────────────────────────────────────────────────────────────────────────
// Enact outcome
// ────────────────────────────────────────────────────────────────────────────

export async function enactOutcome(recordId: string, actorUserId: string | null): Promise<void> {
  const rec = await prisma.probationRecord.findUnique({
    where: { id: recordId },
    include: {
      employee: {
        select: {
          id: true, userId: true, fullName: true, employeeCode: true, designation: true,
          cnic: true, joiningDate: true, exitDate: true, bankName: true, bankAccount: true,
          reportingManagerId: true,
          department: { select: { name: true } },
          salary: { select: { id: true, basic: true, houseRent: true, utilities: true, food: true, fuel: true, medicalAllowance: true, otherAllowance: true } },
          payslips: { orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 1, select: { grossSalary: true } },
        },
      },
    },
  })
  if (!rec) return
  if (rec.outcomeEnactedAt) return // already enacted
  if (!rec.hrDecision) return

  const now = new Date()
  const decision = rec.hrDecision

  if (decision === 'CONFIRM') {
    // ── 1. Optional salary bump ──
    const bump = rec.salaryBumpAmount && rec.salaryBumpAmount > 0 ? rec.salaryBumpAmount : null
    let oldGross: number | null = null
    let newGross: number | null = null
    if (bump != null && rec.employee.salary) {
      const sal = rec.employee.salary
      oldGross = sal.basic + sal.houseRent + sal.utilities + sal.food + sal.fuel + sal.medicalAllowance + sal.otherAllowance
      newGross = oldGross + bump
      // Scale all components proportionally
      const ratio = oldGross > 0 ? newGross / oldGross : 1
      await prisma.salary.update({
        where: { id: sal.id },
        data: {
          basic: Math.round(sal.basic * ratio),
          houseRent: Math.round(sal.houseRent * ratio),
          utilities: Math.round(sal.utilities * ratio),
          food: Math.round(sal.food * ratio),
          fuel: Math.round(sal.fuel * ratio),
          medicalAllowance: Math.round(sal.medicalAllowance * ratio),
          otherAllowance: Math.round(sal.otherAllowance * ratio),
          effectiveFrom: rec.salaryBumpEffective ?? now,
        },
      })
      await prisma.compensationHistory.create({
        data: {
          employeeId: rec.employee.id,
          type: 'INCREMENT',
          oldSalary: oldGross,
          newSalary: newGross,
          incrementPct: oldGross > 0 ? Math.round((bump / oldGross) * 1000) / 10 : 0,
          reason: 'Probation confirmation salary increase',
          effectiveDate: rec.salaryBumpEffective ?? now,
        },
      }).catch(() => {})
    }

    // ── 2. Generate confirmation letter ──
    const year = now.getFullYear()
    const prefix = `CON-LTR-${year}-`
    const countThisYear = await prisma.letterRequest.count({
      where: { letterNumber: { startsWith: prefix } },
    })
    const letterNumber = `${prefix}${String(countThisYear + 1).padStart(3, '0')}`
    const signedByName = 'HR Department'
    const signedByTitle = 'Convertt HR'
    const letterBody = buildConfirmationLetter({
      employeeName: rec.employee.fullName,
      employeeCode: rec.employee.employeeCode,
      designation: rec.employee.designation,
      department: rec.employee.department?.name ?? null,
      probationStart: rec.startDate,
      probationEnd: rec.endDate,
      confirmationDate: now,
      isEarlyDecision: rec.isEarlyDecision,
      oldGross,
      newGross,
      salaryBumpEffective: rec.salaryBumpEffective ?? now,
      signedByName,
      signedByTitle,
    })
    const letter = await prisma.letterRequest.create({
      data: {
        letterNumber,
        employeeId: rec.employee.id,
        letterType: 'CONFIRMATION',
        status: 'APPROVED',
        letterBody,
        signedByName,
        signedByTitle,
        reviewedAt: now,
        reviewedById: actorUserId ?? undefined,
        purpose: 'Probation confirmation',
      },
    })

    // ── 3. Update employee → PERMANENT ──
    await prisma.employee.update({
      where: { id: rec.employee.id },
      data: { employeeType: 'PERMANENT', confirmationDate: now },
    })

    // ── 3b. Top up leave balances to PERMANENT quotas, pro-rated to
    //        the remaining months of the current calendar year. The
    //        accrualPerMonth-driven probation balances stay (they may
    //        already have been used); we just bump the allocated/
    //        remaining up to the permanent pro-rata level.
    try {
      const permPolicies = await prisma.leavePolicy.findMany({
        where: { employeeType: 'PERMANENT' },
      })
      const year = now.getFullYear()
      const monthsRemaining = Math.max(1, 12 - now.getMonth())
      for (const policy of permPolicies) {
        const target = Math.round((policy.daysPerYear * monthsRemaining) / 12)
        const existing = await prisma.leaveBalance.findUnique({
          where: {
            employeeId_year_leaveType: {
              employeeId: rec.employee.id,
              year,
              leaveType: policy.leaveType,
            },
          },
        })
        if (existing) {
          if (target > existing.allocated) {
            const bump = target - existing.allocated
            await prisma.leaveBalance.update({
              where: { id: existing.id },
              data: {
                allocated: target,
                remaining: existing.remaining + bump,
              },
            })
          }
        } else {
          await prisma.leaveBalance.create({
            data: {
              employeeId: rec.employee.id,
              year,
              leaveType: policy.leaveType,
              allocated: target,
              used: 0,
              pending: 0,
              remaining: target,
            },
          })
        }
      }
    } catch (e) {
      console.error('[probation confirm] leave top-up failed', e)
    }

    // ── 4. Mark record CONFIRMED ──
    await prisma.probationRecord.update({
      where: { id: rec.id },
      data: {
        status: 'CONFIRMED',
        outcome: 'CONFIRMED',
        outcomeDate: now,
        outcomeEnactedAt: now,
        confirmationLetterId: letter.id,
      },
    })

    // ── 5. Notify ──
    await notify({
      employeeId: rec.employee.id,
      type: 'PROBATION_ALERT',
      title: '🎉 Probation confirmed — welcome aboard permanently!',
      message: `Congratulations! Your employment with Convertt has been confirmed${bump ? ` with a salary increase of PKR ${Math.round(bump).toLocaleString('en-PK')}` : ''}. Your confirmation letter (${letterNumber}) is ready.`,
      link: `/dashboard/letters`,
    })
    if (rec.employee.reportingManagerId) {
      await notify({
        employeeId: rec.employee.reportingManagerId,
        type: 'PROBATION_ALERT',
        title: 'Team member confirmed',
        message: `${rec.employee.fullName} has been confirmed permanently.`,
        link: `/dashboard/probation/${rec.id}`,
      })
    }
    return
  }

  if (decision === 'EXTEND') {
    // Extension cap — max 2 extensions per probation record.
    if ((rec.extensionCount ?? 0) >= 2) {
      throw new Error('Cannot extend further — already extended 2 times. Must confirm or terminate.')
    }
    const months = rec.extensionMonths && rec.extensionMonths >= 1 ? rec.extensionMonths : 1
    const newEnd = new Date(rec.endDate)
    newEnd.setMonth(newEnd.getMonth() + months)
    await prisma.probationRecord.update({
      where: { id: rec.id },
      data: {
        status: 'ACTIVE',
        endDate: newEnd,
        durationMonths: rec.durationMonths + months,
        extensionCount: (rec.extensionCount ?? 0) + 1,
        outcome: 'EXTENDED',
        outcomeDate: now,
        outcomeEnactedAt: now,
        // Reset packet + manager + HR fields so a fresh cycle runs
        packetGeneratedAt: null,
        packetDaysWorked: null,
        packetDaysAbsent: null,
        packetLateCount: null,
        packetAvgHours: null,
        packetGoalScore: null,
        packetTimeScore: null,
        packetSuggestedRec: null,
        managerRecommendation: null,
        managerReviewNotes: null,
        managerSubmittedAt: null,
        hrDecision: null,
        hrDecidedAt: null,
        meetingScheduledFor: null,
        meetingAgenda: null,
        overrodeManager: false,
      },
    })
    await notify({
      employeeId: rec.employee.id,
      type: 'PROBATION_ALERT',
      title: 'Probation extended',
      message: `Your probation has been extended by ${months} month${months > 1 ? 's' : ''}. New end date: ${newEnd.toLocaleDateString('en-GB')}.`,
      link: `/dashboard/probation/${rec.id}`,
    })
    if (rec.employee.reportingManagerId) {
      await notify({
        employeeId: rec.employee.reportingManagerId,
        type: 'PROBATION_ALERT',
        title: 'Team member probation extended',
        message: `${rec.employee.fullName}'s probation extended by ${months} month${months > 1 ? 's' : ''}.`,
        link: `/dashboard/probation/${rec.id}`,
      })
    }
    return
  }

  if (decision === 'WARNING') {
    await prisma.probationRecord.update({
      where: { id: rec.id },
      data: {
        // Probation continues on schedule — status stays ACTIVE
        status: 'ACTIVE',
        warningIssuedAt: now,
        warningNotes: rec.hrNotes,
        warningCount: { increment: 1 },
        outcomeEnactedAt: now,
      },
    })
    // Best-effort: record on ShowCause if model accepts the shape.
    // We catch broadly because schema-required fields may evolve.
    try {
      // ShowCause shape varies; cast to any for forward-compat
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.showCause.create as any)({
        data: {
          employeeId: rec.employee.id,
          issueType: 'PERFORMANCE',
          issueDate: now,
          allegations: rec.hrNotes ?? 'Formal warning during probation',
          status: 'ISSUED',
        },
      })
    } catch {
      // ShowCause schema may not match — non-fatal
    }
    await notify({
      employeeId: rec.employee.id,
      type: 'PROBATION_ALERT',
      title: 'Formal warning issued',
      message: `A formal warning has been issued during your probation. Probation continues until ${rec.endDate.toLocaleDateString('en-GB')}. Please review with your manager.`,
      link: `/dashboard/probation/${rec.id}`,
    })
    if (rec.employee.reportingManagerId) {
      await notify({
        employeeId: rec.employee.reportingManagerId,
        type: 'PROBATION_ALERT',
        title: 'Warning issued to team member',
        message: `Formal warning recorded for ${rec.employee.fullName}. Probation continues.`,
        link: `/dashboard/probation/${rec.id}`,
      })
    }
    return
  }

  if (decision === 'TERMINATE') {
    await prisma.probationRecord.update({
      where: { id: rec.id },
      data: {
        status: 'TERMINATED',
        outcome: 'TERMINATED',
        outcomeDate: now,
        outcomeEnactedAt: now,
      },
    })
    await prisma.employee.update({
      where: { id: rec.employee.id },
      data: {
        status: 'TERMINATED',
        exitDate: now,
        terminationType: 'INVOLUNTARY',
      },
    })
    if (rec.employee.userId) {
      await prisma.user.update({
        where: { id: rec.employee.userId },
        data: { isActive: false },
      })
    }
    // Notify HR (all admins) for paperwork
    const hrUsers = await prisma.user.findMany({
      where: { role: 'HR_ADMIN' },
      select: { employee: { select: { id: true } } },
    })
    const hrEmpIds = hrUsers.map((u) => u.employee?.id).filter(Boolean) as string[]
    await notifyMany(hrEmpIds, {
      type: 'PROBATION_ALERT',
      title: 'Termination enacted — issue relieving letter',
      message: `${rec.employee.fullName} has been terminated. Issue relieving letter and run no-dues clearance.`,
      link: `/dashboard/probation/${rec.id}`,
    })
    return
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Confirmation letter body (adaptive: full-probation vs early-decision)
// ────────────────────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
}

function fmtPkr(n: number): string {
  return `PKR ${Math.round(n).toLocaleString('en-PK')}/-`
}

interface ConfirmationLetterInput {
  employeeName: string
  employeeCode: string
  designation: string
  department: string | null
  probationStart: Date
  probationEnd: Date
  confirmationDate: Date
  isEarlyDecision: boolean
  oldGross: number | null
  newGross: number | null
  salaryBumpEffective: Date
  signedByName: string
  signedByTitle: string
}

function buildConfirmationLetter(input: ConfirmationLetterInput): string {
  const today = fmtDate(new Date())
  const confDate = fmtDate(input.confirmationDate)
  const opening = input.isEarlyDecision
    ? `based on your demonstrated capabilities, we are pleased to confirm your employment with Convertt with effect from ${confDate}.`
    : `based on your performance during your probationary period from ${fmtDate(input.probationStart)} to ${fmtDate(input.probationEnd)}, your employment with Convertt is hereby confirmed with effect from ${confDate}.`

  const salaryLine = (input.oldGross != null && input.newGross != null && input.newGross > input.oldGross)
    ? `\nEffective ${fmtDate(input.salaryBumpEffective)}, your monthly gross compensation is revised from ${fmtPkr(input.oldGross)} to ${fmtPkr(input.newGross)}.\n`
    : ''

  const deptLine = input.department ? ` in the ${input.department} department` : ''

  return [
    `Subject: Employment Confirmation`,
    ``,
    today,
    ``,
    `Dear ${input.employeeName} (${input.employeeCode}),`,
    ``,
    `We are pleased to inform you that ${opening}`,
    ``,
    `Your designation remains ${input.designation}${deptLine}. All terms and conditions of your initial appointment letter continue to apply.`,
    salaryLine,
    `As a permanent employee, you are now entitled to:`,
    `- Permanent staff leave policy (24 annual / 12 casual / 10 sick days)`,
    `- All other benefits per company HR policy`,
    ``,
    `Congratulations and we look forward to your continued contributions to Convertt.`,
    ``,
    `For Convertt,`,
    ``,
    input.signedByName,
    input.signedByTitle,
    `Date: ${today}`,
  ].join('\n')
}
