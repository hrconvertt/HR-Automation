import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { getPayrollConfig } from '@/lib/config'
import { dayKey } from '@/lib/date-utils'
import {
  scoreClockIn,
  ensureDeviceRecord,
  extractClientIp,
  type ClientContext,
} from '@/lib/attendance-security'
import { notifyMany } from '@/lib/notifications'

/**
 * Sum the worked-time across multiple IN/OUT pairs in a day.
 * Robust to missing OUT (last punch is IN â†’ not yet counted, returns 0 for that session).
 */
// (was: isoDay â€” now provided by `dayKey` in @/lib/date-utils)

function sumSessionPairs(punches: { type: string; timestamp: Date }[]): number {
  let total = 0
  let openIn: Date | null = null
  for (const p of punches) {
    if (p.type === 'IN') openIn = p.timestamp
    else if (p.type === 'OUT' && openIn) {
      total += p.timestamp.getTime() - openIn.getTime()
      openIn = null
    }
  }
  return total
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve effective role (HR can preview)
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const previewRole =
    user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  const myEmpId = user.employee?.id ?? null

  // Build employee-scope filter for this role
  // EMPLOYEE: only self
  // MANAGER: self + direct reports
  // HR / EXECUTIVE: everyone
  const employeeScope = (): Record<string, unknown> => {
    if (effectiveRole === 'EMPLOYEE' && myEmpId) return { id: myEmpId }
    if (effectiveRole === 'MANAGER' && myEmpId) {
      return { OR: [{ id: myEmpId }, { reportingManagerId: myEmpId }] }
    }
    return {} // HR / EXECUTIVE see all
  }
  const empFilter = employeeScope()

  const { searchParams } = new URL(request.url)
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const isSummary = searchParams.get('summary') === 'true'
  const isOvertime = searchParams.get('overtime') === 'true'
  const employeeId = searchParams.get('employeeId') ?? ''

  const isToday = searchParams.get('today') === 'true'
  if (isToday) {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const todayEnd = new Date(); todayEnd.setHours(23,59,59,999)

    // EOD cutoff: past this hour, anyone without a punch and not on leave/holiday
    // is treated as Absent. Configurable via PayrollConfig.endOfDayHour.
    const cfg = await getPayrollConfig()
    const isAfterEOD = new Date().getHours() >= cfg.endOfDayHour
    const isWeekendToday = todayStart.getDay() === 0 || todayStart.getDay() === 6
    // Holiday today?
    const holidayToday = await prisma.holiday.findFirst({
      where: { date: { gte: todayStart, lte: todayEnd }, type: 'PUBLIC' },
      select: { id: true },
    })

    const [activeEmps, todayLogs, todayPunches] = await Promise.all([
      prisma.employee.findMany({
        where: { status: 'ACTIVE', ...empFilter },
        select: { id: true, employeeCode: true, fullName: true, department: { select: { name: true } } },
        orderBy: { fullName: 'asc' },
      }),
      prisma.attendanceLog.findMany({
        where: {
          date: { gte: todayStart, lte: todayEnd },
          employee: empFilter,
        },
        include: { employee: { select: { employeeCode: true, fullName: true, department: { select: { name: true } } } } },
      }),
      prisma.attendancePunch.findMany({
        where: { date: { gte: todayStart, lte: todayEnd } },
        orderBy: { timestamp: 'asc' },
      }),
    ])

    const logMap = new Map(todayLogs.map(l => [l.employeeId, l]))
    const punchesByEmp = new Map<string, { type: string; timestamp: Date; workType: string | null }[]>()
    for (const p of todayPunches) {
      const arr = punchesByEmp.get(p.employeeId) ?? []
      arr.push({ type: p.type, timestamp: p.timestamp, workType: p.workType })
      punchesByEmp.set(p.employeeId, arr)
    }

    const allRecords = activeEmps.map(emp => {
      const log = logMap.get(emp.id)
      const punches = punchesByEmp.get(emp.id) ?? []
      const latest = punches[punches.length - 1]
      const isCurrentlyIn = latest?.type === 'IN'
      const sessionCount = punches.filter((p) => p.type === 'IN').length

      // Derive an effective status, applying the auto-Absent rule for today:
      //   - If explicit log status is set, use it.
      //   - Else if employee has punches, they're PRESENT.
      //   - Else (no log, no punches): NOT_IN during the workday, ABSENT after EOD.
      //   - Holidays and weekends are excluded from the auto-Absent flip.
      let effectiveStatus = log?.status ?? 'NOT_IN'
      if (!log?.status && punches.length === 0) {
        if (isAfterEOD && !isWeekendToday && !holidayToday) {
          effectiveStatus = 'ABSENT'
        }
      }

      return {
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        fullName: emp.fullName,
        department: emp.department?.name ?? 'â€”',
        clockIn: log?.clockIn ?? null,
        clockOut: isCurrentlyIn ? null : (log?.clockOut ?? null),
        status: effectiveStatus,
        workType: latest?.workType ?? log?.workType ?? 'ONSITE',
        hoursWorked: log?.hoursWorked ?? null,
        punches: punches.map((p) => ({
          type: p.type, timestamp: p.timestamp, workType: p.workType,
        })),
        sessionCount,
        isCurrentlyIn,
      }
    })

    const todayStats = {
      present: allRecords.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length,
      late: 0, // deprecated â€” no longer surfaced to UI
      absent: allRecords.filter(r => r.status === 'ABSENT').length,
      notYetIn: allRecords.filter(r => r.status === 'NOT_IN').length,
      wfh: allRecords.filter(r => r.workType === 'WFH' && r.clockIn).length,
      leave: allRecords.filter(r => r.status === 'LEAVE').length,
      total: allRecords.length,
    }

    return NextResponse.json({ todayStats, logs: allRecords })
  }

  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0)

  // Overtime logs view â€” records with overtimeHours > 0
  if (isOvertime) {
    const logs = await prisma.attendanceLog.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        overtimeHours: { gt: 0 },
        employee: empFilter,
        ...(employeeId ? { employeeId } : {}),
      },
      include: { employee: { select: { fullName: true, employeeCode: true } } },
      orderBy: [{ date: 'desc' }],
    })

    return NextResponse.json({
      logs: logs.map((l) => ({
        id: l.id,
        employeeId: l.employeeId,
        fullName: l.employee.fullName,
        date: l.date,
        clockIn: l.clockIn,
        clockOut: l.clockOut,
        hoursWorked: l.hoursWorked,
        overtimeHours: l.overtimeHours,
        overtimeApproved: l.overtimeApproved,
        status: l.status,
        workType: l.workType,
      })),
    })
  }

  if (isSummary) {
    const employees = await prisma.employee.findMany({
      where: { status: 'ACTIVE', ...empFilter },
      select: { id: true, employeeCode: true, fullName: true },
      orderBy: { fullName: 'asc' },
    })

    const [logs, holidays, leaveRequests] = await Promise.all([
      prisma.attendanceLog.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          employee: empFilter,
          ...(employeeId ? { employeeId } : {}),
        },
      }),
      prisma.holiday.findMany({
        where: { type: 'PUBLIC', date: { gte: startDate, lte: endDate } },
        select: { date: true },
      }),
      prisma.leaveRequest.findMany({
        where: {
          status: 'APPROVED',
          fromDate: { lte: endDate },
          toDate: { gte: startDate },
          employee: empFilter,
        },
        select: { employeeId: true, fromDate: true, toDate: true },
      }),
    ])

    const holidayKeys = new Set(holidays.map((h) => dayKey(h.date)))
    const today = new Date(); today.setHours(0, 0, 0, 0)

    // Walk all weekdays in the period (up to yesterday â€” today doesn't auto-absent)
    const weekdaysInPeriod: Date[] = []
    {
      const cur = new Date(startDate); cur.setHours(0,0,0,0)
      while (cur <= endDate && cur < today) {
        const d = cur.getDay()
        if (d !== 0 && d !== 6 && !holidayKeys.has(dayKey(cur))) {
          weekdaysInPeriod.push(new Date(cur))
        }
        cur.setDate(cur.getDate() + 1)
      }
    }

    const summaryData = employees.map((emp) => {
      const empLogs = logs.filter((l) => l.employeeId === emp.id)
      const presentDays = new Set(
        empLogs.filter((l) => l.status === 'PRESENT' || l.status === 'LATE').map((l) => dayKey(l.date)),
      )
      const explicitAbsentDays = new Set(
        empLogs.filter((l) => l.status === 'ABSENT').map((l) => dayKey(l.date)),
      )
      // Build approved-leave date set for this emp
      const leaveDays = new Set<string>()
      for (const lv of leaveRequests.filter((l) => l.employeeId === emp.id)) {
        const cur = new Date(lv.fromDate); cur.setHours(0,0,0,0)
        const end = new Date(lv.toDate); end.setHours(0,0,0,0)
        while (cur <= end) { leaveDays.add(dayKey(cur)); cur.setDate(cur.getDate() + 1) }
      }
      // Auto-absent = past weekday with no log AND not on leave
      let autoAbsent = 0
      for (const wd of weekdaysInPeriod) {
        const k = dayKey(wd)
        if (presentDays.has(k) || explicitAbsentDays.has(k) || leaveDays.has(k)) continue
        autoAbsent++
      }
      const totalOT = empLogs.reduce((sum, l) => sum + (l.overtimeHours ?? 0), 0)
      const approvedOT = empLogs.filter((l) => l.overtimeApproved).reduce((sum, l) => sum + (l.overtimeHours ?? 0), 0)
      return {
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        fullName: emp.fullName,
        present: empLogs.filter((l) => l.status === 'PRESENT').length,
        // Combined explicit + inferred absent so the Monthly Report aligns with the Calendar
        absent: explicitAbsentDays.size + autoAbsent,
        late: empLogs.filter((l) => l.status === 'LATE').length,
        leave: empLogs.filter((l) => l.status === 'LEAVE').length,
        totalOvertimeHours: totalOT,
        approvedOvertimeHours: approvedOT,
        pendingOvertimeHours: totalOT - approvedOT,
      }
    })

    return NextResponse.json({ summary: summaryData })
  }

  const logs = await prisma.attendanceLog.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      employee: empFilter,
      ...(employeeId ? { employeeId } : {}),
    },
    include: { employee: { select: { fullName: true, employeeCode: true } } },
    orderBy: [{ date: 'asc' }],
  })

  return NextResponse.json({ logs })
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // NOTE: clock-in always logs against the *logged-in user's own* Employee record,
  // never against the role they're previewing. So preview-mode restrictions don't
  // apply here â€” the punch is unambiguous regardless of which view they're using.

  // Look up user's actual employee id (token can be stale after data re-imports)
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  const myEmpId = user?.employee?.id ?? null

  try {
    const body = await request.json()
    const {
      action,
      employeeId: bodyEmployeeId,
      date,
      workType: bodyWorkType,
      clientContext,
    } = body as {
      action: string
      employeeId?: string
      date?: string
      workType?: string
      clientContext?: ClientContext
    }

    // â”€â”€ Authorisation: who is this punch FOR? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Only HR_ADMIN may punch on behalf of another employee. Everyone else
    // is locked to their own record, regardless of what they send in the body.
    let empId: string
    if (bodyEmployeeId && bodyEmployeeId !== myEmpId) {
      if (payload.role !== 'HR_ADMIN') {
        return NextResponse.json(
          { error: 'You can only clock in or out for yourself.' },
          { status: 403 },
        )
      }
      empId = bodyEmployeeId
    } else {
      if (!myEmpId) return NextResponse.json({ error: 'No employee linked' }, { status: 400 })
      empId = myEmpId
    }

    const now = new Date()
    const logDate = date ? new Date(date) : new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const workType = bodyWorkType ?? 'ONSITE'
    const ip = extractClientIp(request.headers)
    const ctx: ClientContext = clientContext ?? {}

    if (action === 'CLOCK_IN') {
      // â”€â”€ Multi-punch: check the latest punch of the day â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const latestPunch = await prisma.attendancePunch.findFirst({
        where: { employeeId: empId, date: logDate },
        orderBy: { timestamp: 'desc' },
      })
      if (latestPunch && latestPunch.type === 'IN') {
        return NextResponse.json({
          error: 'You are already clocked in. Clock out first if you need to take a break.',
        }, { status: 400 })
      }
      const isResume = !!latestPunch && latestPunch.type === 'OUT'

      // â”€â”€ Trust scoring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // HR / manual entries (where bodyEmployeeId is for someone else) bypass scoring
      const isManualEntry = bodyEmployeeId && bodyEmployeeId !== myEmpId
      let scoring = null as Awaited<ReturnType<typeof scoreClockIn>> | null
      if (!isManualEntry) {
        if (ctx.deviceHash) {
          await ensureDeviceRecord({
            employeeId: empId,
            deviceHash: ctx.deviceHash,
            userAgent: ctx.userAgent,
          })
        }
        scoring = await scoreClockIn({ employeeId: empId, ip, ctx })

        if (scoring.decision === 'BLOCKED') {
          // Notify HR + reporting manager + the employee
          const emp = await prisma.employee.findUnique({
            where: { id: empId },
            select: { reportingManagerId: true, fullName: true },
          })
          const hrEmpIds = (
            await prisma.user.findMany({
              where: { role: 'HR_ADMIN' },
              select: { employee: { select: { id: true } } },
            })
          )
            .map((u) => u.employee?.id)
            .filter((x): x is string => !!x)
          const recipients = [...hrEmpIds]
          if (emp?.reportingManagerId) recipients.push(emp.reportingManagerId)
          await notifyMany(recipients, {
            type: 'ANOMALY',
            title: 'Clock-in blocked',
            message: `${emp?.fullName ?? 'Employee'}: ${scoring.reason ?? 'security check failed'}`,
            link: '/dashboard/attendance',
          })
          return NextResponse.json(
            {
              error: scoring.reason ?? 'Clock-in blocked by security policy',
              code: 'CLOCK_IN_BLOCKED',
              trustScore: scoring.score,
              flags: scoring.flags,
            },
            { status: 403 },
          )
        }
      }

      const cfg = await getPayrollConfig()
      // We still record lateMinutes for HR audit, but the status is always PRESENT
      const isAfterThreshold =
        now.getHours() > cfg.lateThresholdHour ||
        (now.getHours() === cfg.lateThresholdHour && now.getMinutes() > cfg.lateThresholdMinute)
      const lateMinutes = isAfterThreshold
        ? (now.getHours() - cfg.lateThresholdHour) * 60 + (now.getMinutes() - cfg.lateThresholdMinute)
        : 0

      // 1) Record the punch event
      await prisma.attendancePunch.create({
        data: {
          employeeId: empId,
          date: logDate,
          type: 'IN',
          timestamp: now,
          workType,
          ipAddress: ip,
          deviceHash: ctx.deviceHash ?? null,
          trustScore: scoring?.score ?? null,
          riskFlags: scoring?.flags?.length ? JSON.stringify(scoring.flags) : null,
          source: isManualEntry ? 'MANUAL' : 'BROWSER',
        },
      })

      // 2) Upsert the day summary row. On RESUME, keep original clockIn + clear clockOut.
      const log = await prisma.attendanceLog.upsert({
        where: { employeeId_date: { employeeId: empId, date: logDate } },
        update: {
          // Re-opening the day after a break â€” clockOut becomes null again so UI shows "clocked in"
          clockOut: null,
          // Self-heal: if the day was marked ABSENT (e.g. HR manual entry or
          // auto-absent flip after EOD) but the employee actually clocked back
          // in, flip status back to PRESENT. Don't override LEAVE / HOLIDAY.
          status: 'PRESENT',
          // Keep original first-IN of the day in clockIn; just update fields on resume
          workType,
          clockOutIp: null,
          clockOutDeviceHash: null,
          clockOutLat: null,
          clockOutLng: null,
          clockOutTrustScore: null,
        },
        create: {
          employeeId: empId,
          date: logDate,
          clockIn: now,
          status: 'PRESENT',
          lateMinutes: lateMinutes > 0 ? lateMinutes : 0,
          workType,
          ipAddress: ip,
          clockInIp: ip,
          clockInDeviceHash: ctx.deviceHash ?? null,
          clockInLat: ctx.lat ?? null,
          clockInLng: ctx.lng ?? null,
          clockInSsid: ctx.ssid ?? null,
          clockInLocationId: scoring?.matchedLocationId ?? null,
          clockInTrustScore: scoring?.score ?? null,
          clockInRiskFlags: scoring?.flags?.length ? JSON.stringify(scoring.flags) : null,
          clockInSource: isManualEntry ? 'MANUAL' : 'BROWSER',
        },
      })

      // Manager-review path: notify manager but allow clock-in
      if (scoring?.decision === 'MANAGER_REVIEW') {
        const emp = await prisma.employee.findUnique({
          where: { id: empId },
          select: { reportingManagerId: true, fullName: true },
        })
        if (emp?.reportingManagerId) {
          await notifyMany([emp.reportingManagerId], {
            type: 'ANOMALY',
            title: 'Clock-in flagged for review',
            message: `${emp.fullName}: ${scoring.reason ?? 'low trust score'}`,
            link: '/dashboard/attendance',
          })
        }
      }

      return NextResponse.json({
        message:
          scoring?.decision === 'MANAGER_REVIEW'
            ? `${isResume ? 'Resumed' : 'Clocked in'} â€” flagged for manager review`
            : isResume
              ? 'Resumed from break'
              : 'Clocked in successfully',
        log,
        isResume,
        trustScore: scoring?.score ?? null,
        flags: scoring?.flags ?? [],
        decision: scoring?.decision ?? 'AUTO_OK',
      })
    }

    if (action === 'CLOCK_OUT') {
      const latestPunch = await prisma.attendancePunch.findFirst({
        where: { employeeId: empId, date: logDate },
        orderBy: { timestamp: 'desc' },
      })
      const existing = await prisma.attendanceLog.findFirst({
        where: { employeeId: empId, date: logDate },
      })
      if (!latestPunch || !existing) {
        return NextResponse.json({ error: 'No clock-in record found for today.' }, { status: 400 })
      }
      if (latestPunch.type !== 'IN') {
        return NextResponse.json({ error: 'You are already clocked out. Tap Check In to resume.' }, { status: 400 })
      }

      // Score the clock-out (lighter touch â€” no block, just record)
      let outScore: number | null = null
      if (!bodyEmployeeId || bodyEmployeeId === myEmpId) {
        const s = await scoreClockIn({ employeeId: empId, ip, ctx })
        outScore = s.score
      }

      // 1) Record the OUT punch
      await prisma.attendancePunch.create({
        data: {
          employeeId: empId,
          date: logDate,
          type: 'OUT',
          timestamp: now,
          workType: existing.workType,
          ipAddress: ip,
          deviceHash: ctx.deviceHash ?? null,
          trustScore: outScore,
          source: bodyEmployeeId && bodyEmployeeId !== myEmpId ? 'MANUAL' : 'BROWSER',
        },
      })

      // 2) Recompute total hours from ALL session pairs
      const allPunches = await prisma.attendancePunch.findMany({
        where: { employeeId: empId, date: logDate },
        orderBy: { timestamp: 'asc' },
      })
      const totalMs = sumSessionPairs(allPunches)
      const hoursWorked = totalMs / 3_600_000
      const cfg = await getPayrollConfig()
      const rawOvertime = Math.max(0, hoursWorked - cfg.standardHoursPerDay)
      const overtimeHours = Math.round(rawOvertime * 2) / 2

      const log = await prisma.attendanceLog.update({
        where: { id: existing.id },
        data: {
          clockOut: now,
          hoursWorked: Math.round(hoursWorked * 100) / 100,
          overtimeHours,
          clockOutIp: ip,
          clockOutDeviceHash: ctx.deviceHash ?? null,
          clockOutLat: ctx.lat ?? null,
          clockOutLng: ctx.lng ?? null,
          clockOutTrustScore: outScore,
        },
      })
      const sessionCount = allPunches.filter((p) => p.type === 'OUT').length
      return NextResponse.json({
        message: sessionCount > 1
          ? `Clocked out â€” ${sessionCount} sessions today, ${hoursWorked.toFixed(1)}h total`
          : `Clocked out â€” ${hoursWorked.toFixed(1)}h today`,
        log,
        totalHours: Math.round(hoursWorked * 100) / 100,
        sessionCount,
      })
    }

    // Manual HR entry
    const { status } = body
    const log = await prisma.attendanceLog.upsert({
      where: { employeeId_date: { employeeId: empId, date: logDate } },
      update: { status: status ?? 'PRESENT' },
      create: {
        employeeId: empId,
        date: logDate,
        status: status ?? 'PRESENT',
        workType,
      },
    })

    return NextResponse.json({ log })
  } catch (error) {
    console.error('[POST /api/attendance]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
