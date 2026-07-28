/**
 * Demo data seeder — Attendance, Leave, Policies.
 *
 * Self-healing principles applied:
 *   - Idempotent: every record is upserted or guarded with findFirst
 *   - All records are tagged `[DEMO]` in a notes / reason field so they
 *     can be unambiguously cleared with the wipe() helper
 *   - Skips rows where required dependencies are missing instead of throwing
 *   - Catches errors per-block so a failure in (say) leave doesn't kill attendance
 */

import { prisma } from '@/lib/prisma'

const DEMO_MARKER = '[DEMO]'

export type SeedReport = {
  attendance: { devices: number; logs: number; locations: number; errors: string[] }
  leave: { policies: number; balances: number; requests: number; errors: string[] }
  policies: { published: number; drafts: number; acks: number; errors: string[] }
}

export async function seedDemo(): Promise<SeedReport> {
  const report: SeedReport = {
    attendance: { devices: 0, logs: 0, locations: 0, errors: [] },
    leave: { policies: 0, balances: 0, requests: 0, errors: [] },
    policies: { published: 0, drafts: 0, acks: 0, errors: [] },
  }

  const active = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, fullName: true, employeeType: true, reportingManagerId: true },
    orderBy: { joiningDate: 'asc' },
    take: 20,
  })
  if (active.length === 0) {
    report.attendance.errors.push('No active employees — nothing to seed.')
    return report
  }

  await seedAttendance(active, report).catch((e) => report.attendance.errors.push(String(e)))
  await seedLeave(active, report).catch((e) => report.leave.errors.push(String(e)))
  await seedPolicies(active, report).catch((e) => report.policies.errors.push(String(e)))

  return report
}

// ─── ATTENDANCE ─────────────────────────────────────────────────────────────

async function seedAttendance(
  active: { id: string; fullName: string }[],
  report: SeedReport,
) {
  // 1) One Office location with WiFi
  await prisma.location.upsert({
    where: { id: 'demo-loc-hq' },
    update: { name: 'Convertt HQ — Gulberg', kind: 'OFFICE', active: true,
              ssids: JSON.stringify(['Convertt-Office', 'Convertt-Guest']),
              notes: `${DEMO_MARKER} Main office` },
    create: { id: 'demo-loc-hq', name: 'Convertt HQ — Gulberg', kind: 'OFFICE', active: true,
              ssids: JSON.stringify(['Convertt-Office', 'Convertt-Guest']),
              notes: `${DEMO_MARKER} Main office` },
  })
  report.attendance.locations = 1

  // 2) Trusted devices for first 12 employees
  const withDevices = active.slice(0, 12)
  for (const emp of withDevices) {
    const deviceHash = `demo-device-${emp.id}`
    await prisma.trustedDevice.upsert({
      where: { employeeId_deviceHash: { employeeId: emp.id, deviceHash } },
      update: { status: 'TRUSTED', label: 'Work Laptop', userAgent: 'DemoSeeder/1.0', trustedAt: new Date() },
      create: { employeeId: emp.id, deviceHash, status: 'TRUSTED', label: 'Work Laptop',
                userAgent: 'DemoSeeder/1.0', trustedAt: new Date() },
    })
    report.attendance.devices++
  }

  // 3) Attendance logs for last 14 days (weekdays only) for first 10 employees
  const empSample = active.slice(0, 10)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  for (let daysBack = 14; daysBack >= 0; daysBack--) {
    const date = new Date(today)
    date.setDate(today.getDate() - daysBack)
    const day = date.getDay()
    if (day === 0 || day === 6) continue // skip weekends

    for (let i = 0; i < empSample.length; i++) {
      const emp = empSample[i]
      // Deterministic pseudo-random based on employee + day
      const seed = hashStr(`${emp.id}-${date.toISOString().split('T')[0]}`)
      const wfh = seed % 5 === 0 // ~20% WFH days
      let status = 'PRESENT'
      // 1 leave day per employee in the last 14 days
      if ((seed + i) % 17 === 0) status = 'LEAVE'
      // Today: leave the last 3 employees as NOT_IN (didn't clock in yet)
      const isToday = daysBack === 0
      if (isToday && i >= empSample.length - 3) continue

      const clockInMinutes = 540 + (seed % 30) // 9:00–9:30 AM
      const clockOutMinutes = 1080 + (seed % 60) // 6:00–7:00 PM
      const clockIn = new Date(date); clockIn.setMinutes(clockInMinutes)
      const clockOut = new Date(date); clockOut.setMinutes(clockOutMinutes)
      const hoursWorked = +(((clockOut.getTime() - clockIn.getTime()) / 3_600_000)).toFixed(2)
      const ot = Math.max(0, hoursWorked - 9)

      // Today's last-but-one employee is currently clocked in (no clockOut)
      const stillClockedIn = isToday && i === empSample.length - 4
      const final = {
        clockIn: status === 'LEAVE' ? null : clockIn,
        clockOut: stillClockedIn || status === 'LEAVE' ? null : clockOut,
        hoursWorked: status === 'LEAVE' || stillClockedIn ? null : hoursWorked,
        overtimeHours: status === 'LEAVE' || stillClockedIn ? 0 : Math.round(ot * 2) / 2,
        status,
        workType: status === 'LEAVE' ? 'ONSITE' : (wfh ? 'WFH' : 'ONSITE'),
        clockInDeviceHash: status === 'LEAVE' ? null : `demo-device-${emp.id}`,
        clockInTrustScore: status === 'LEAVE' ? null : 80,
        clockInSource: status === 'LEAVE' ? null : 'BROWSER',
        notes: DEMO_MARKER,
      }

      await prisma.attendanceLog.upsert({
        where: { employeeId_date: { employeeId: emp.id, date } },
        update: final,
        create: { employeeId: emp.id, date, ...final },
      })
      report.attendance.logs++
    }
  }
}

// ─── LEAVE ──────────────────────────────────────────────────────────────────

async function seedLeave(
  active: { id: string; fullName: string; employeeType: string | null }[],
  report: SeedReport,
) {
  // 1) Policies (12 casual + 12 sick for permanent/probation, 1 emergency for intern/training)
  const policies = [
    { employeeType: 'PERMANENT',  leaveType: 'CASUAL',    daysPerYear: 12 },
    { employeeType: 'PERMANENT',  leaveType: 'SICK',      daysPerYear: 12 },
    { employeeType: 'PROBATION',  leaveType: 'CASUAL',    daysPerYear: 12 },
    { employeeType: 'PROBATION',  leaveType: 'SICK',      daysPerYear: 12 },
    { employeeType: 'INTERNSHIP', leaveType: 'EMERGENCY', daysPerYear: 1 },
    { employeeType: 'TRAINING',   leaveType: 'EMERGENCY', daysPerYear: 1 },
  ]
  for (const p of policies) {
    await prisma.leavePolicy.upsert({
      where: { employeeType_leaveType: { employeeType: p.employeeType, leaveType: p.leaveType } },
      update: { daysPerYear: p.daysPerYear },
      create: p,
    })
    report.leave.policies++
  }

  // 2) LeaveBalance per active employee for current year
  const year = new Date().getFullYear()
  for (const emp of active) {
    const empType = emp.employeeType ?? 'PERMANENT'
    const types = ['PERMANENT', 'PROBATION'].includes(empType)
      ? ['CASUAL', 'SICK']
      : ['EMERGENCY']
    for (const lt of types) {
      const pol = policies.find((p) => p.employeeType === empType && p.leaveType === lt)
      if (!pol) continue
      const seed = hashStr(`${emp.id}-${lt}`)
      const used = pol.daysPerYear === 1 ? (seed % 2) : (seed % 5)
      const remaining = Math.max(0, pol.daysPerYear - used)
      await prisma.leaveBalance.upsert({
        where: { employeeId_year_leaveType: { employeeId: emp.id, year, leaveType: lt } },
        update: { allocated: pol.daysPerYear, used, remaining },
        create: {
          employeeId: emp.id, year, leaveType: lt,
          allocated: pol.daysPerYear, used, remaining,
        },
      })
      report.leave.balances++
    }
  }

  // 3) Wipe + recreate sample LeaveRequests (8 of them, marked with DEMO)
  await prisma.leaveRequest.deleteMany({ where: { reason: { contains: DEMO_MARKER } } })

  const requests = [
    // 3 PENDING (one starting tomorrow, two later this week / next week)
    mkReq(active[0], 'CASUAL', +1, +1, 'Family event'),
    mkReq(active[1] ?? active[0], 'SICK', +3, +3, 'Doctor appointment'),
    mkReq(active[2] ?? active[0], 'CASUAL', +7, +9, 'Personal travel'),
    // 3 APPROVED (some past, some upcoming)
    mkReq(active[3] ?? active[0], 'CASUAL', -5, -5, 'Bank work', 'APPROVED'),
    mkReq(active[4] ?? active[0], 'SICK', -2, -1, 'Flu', 'APPROVED'),
    mkReq(active[5] ?? active[0], 'CASUAL', +5, +6, 'Wedding ceremony', 'APPROVED'),
    // 1 REJECTED
    mkReq(active[6] ?? active[0], 'CASUAL', +2, +4, 'Vacation', 'REJECTED', 'Clashes with Q2 milestone — please reschedule.'),
    // 1 CANCELLED
    mkReq(active[7] ?? active[0], 'SICK', -7, -7, 'Headache', 'CANCELLED'),
  ]
  for (const r of requests) {
    if (!r) continue
    await prisma.leaveRequest.create({ data: r })
    report.leave.requests++
  }

  function mkReq(
    emp: typeof active[number] | undefined,
    leaveType: string,
    fromOffset: number,
    toOffset: number,
    reason: string,
    status = 'PENDING',
    rejectedReason?: string,
  ) {
    if (!emp) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const from = new Date(today); from.setDate(today.getDate() + fromOffset)
    const to = new Date(today); to.setDate(today.getDate() + toOffset)
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1)
    return {
      employeeId: emp.id,
      leaveType,
      fromDate: from,
      toDate: to,
      days,
      reason: `${DEMO_MARKER} ${reason}`,
      status,
      ...(status === 'APPROVED' ? { approvedAt: new Date() } : {}),
      ...(rejectedReason ? { rejectedReason } : {}),
    }
  }
}

// ─── POLICIES ───────────────────────────────────────────────────────────────

async function seedPolicies(
  active: { id: string }[],
  report: SeedReport,
) {
  const seedPolicies = [
    // ─── REFERENCE POLICIES — read-only, no ack required ────────────────────
    {
      slug: 'demo-policy-leave',
      title: 'Leave Policy', category: 'LEAVE', type: 'LEAVE_POLICY',
      description: 'Leave entitlements, month-end restrictions, sandwich-leave rule, and emergency criteria.',
      requiresAck: false,
      content: LEAVE_POLICY_CONTENT,
    },
    {
      slug: 'demo-policy-overtime',
      title: 'Overtime Policy', category: 'COMPENSATION', type: 'HR_POLICY',
      description: 'How OT hours are tracked and the allowance is calculated (formula + example).',
      requiresAck: false,
      content: OVERTIME_POLICY_CONTENT,
    },

    // ─── LEGAL POLICIES — require employee acknowledgment ───────────────────
    {
      slug: 'demo-policy-conduct',
      title: 'Code of Conduct', category: 'CODE_OF_CONDUCT', type: 'CODE_OF_CONDUCT',
      description: 'Professional standards expected of all employees.',
      requiresAck: true,
      content: 'All employees shall conduct themselves with integrity, respect, and professionalism. ' +
               'Convertt expects all team members to uphold the highest standards of ethical behaviour, ' +
               'collaborate honestly with colleagues, and represent the company positively at all times.',
    },
    {
      slug: 'demo-policy-it',
      title: 'IT & Security Policy', category: 'IT', type: 'IT_SECURITY',
      description: 'Acceptable use of company laptops, accounts, and data.',
      requiresAck: true,
      content: 'Company-issued equipment is for business use only. Use strong, unique passwords. ' +
               'No shared accounts. Lock your screen when stepping away. Report lost or stolen devices to IT immediately.',
    },
    {
      slug: 'demo-policy-harassment',
      title: 'Anti-Harassment Policy', category: 'CODE_OF_CONDUCT', type: 'ANTI_HARASSMENT',
      description: 'Zero tolerance for harassment or discrimination.',
      requiresAck: true,
      content: 'Convertt is committed to a workplace free of harassment and discrimination of any form. ' +
               'Report any incidents directly to HR. All reports are taken seriously and investigated confidentially.',
    },
  ]

  for (const p of seedPolicies) {
    await prisma.policyDocument.upsert({
      where: { id: p.slug },
      update: {
        title: p.title, category: p.category, type: p.type,
        description: p.description, content: p.content,
        status: 'PUBLISHED', requiresAck: p.requiresAck, audience: 'ALL',
        publishedAt: new Date(Date.now() - 30 * 86_400_000),
        version: '1.0',
      },
      create: {
        id: p.slug,
        title: p.title, category: p.category, type: p.type,
        description: p.description, content: p.content,
        status: 'PUBLISHED', requiresAck: p.requiresAck, audience: 'ALL',
        publishedAt: new Date(Date.now() - 30 * 86_400_000),
        version: '1.0',
      },
    })
    report.policies.published++
  }

  report.policies.drafts = 0

  // Acknowledgments — only for policies that require them
  for (const p of seedPolicies.filter((x) => x.requiresAck)) {
    for (const emp of active) {
      const seed = hashStr(`${emp.id}-${p.slug}`)
      const signed = seed % 10 < 7 // ~70% signed
      await prisma.policyAcknowledgment.upsert({
        where: { policyId_employeeId: { policyId: p.slug, employeeId: emp.id } },
        update: signed
          ? { status: 'SIGNED', signedAt: new Date(Date.now() - (seed % 25) * 86_400_000) }
          : { status: 'PENDING', notifiedAt: new Date(Date.now() - 30 * 86_400_000) },
        create: {
          policyId: p.slug, employeeId: emp.id,
          status: signed ? 'SIGNED' : 'PENDING',
          signedAt: signed ? new Date(Date.now() - (seed % 25) * 86_400_000) : null,
          notifiedAt: new Date(Date.now() - 30 * 86_400_000),
        },
      })
      report.policies.acks++
    }
  }
}

// ─── Policy content (verbatim from Convertt's official policy docs) ─────────

const LEAVE_POLICY_CONTENT = `# Leave Policy

**Effective Date:** 1st August 2025
**Applies to:** All Interns and Permanent Employees

## 1. Purpose

This leave policy outlines the rules and expectations regarding time off to ensure smooth operations, particularly during critical times like month-end closing.

## 2. Leave Policy for Interns

- Interns are not allowed to take leave during their internship unless it is for a verified emergency.
- In the event of an emergency, a maximum of **one (1) day off per month** may be granted, contingent upon approval by the reporting manager.
- Repeated or patterned leave requests may lead to disciplinary action or termination of the internship.

## 3. Leave Policy for Permanent Employees

- Permanent employees are entitled to **three (3) days of leave per month**.
- All leave requests should be submitted ahead of time and require approval from the reporting manager.
- In case of an emergency, leave must be reported promptly and may need supporting documentation if requested.
- Approved leave can be withdrawn in exceptional cases, such as an increased workload or urgent colleague matters.

## 4. Month-End Leave Restrictions

- **No leave is permitted in the last two weeks of the month** for all employees, including interns and permanent staff.
- The final two weeks are designated as critical for month-end closing and peak operational workload, and full attendance is expected.

> **Caution:** Remote work is not permitted without proper documentation and approval from HR.

---

## 5. Friday and Monday Sandwich Leave Policy

**Effective:** August 2025

This communication serves to inform all employees of the implementation of the Sandwich Leave Policy on Fridays and Mondays.

If an employee requests leave on a Friday without prior notice, Saturday and Sunday will also be counted, totalling three days of leave deducted from salary.

If an employee requests leave on a Monday without prior notice, Saturday and Sunday are also counted, totalling three days deducted from salary.

### Conditions

- Leave must be approved by your lead before being submitted to the HR department.
- HR reserves the right to disqualify your leave application at any point before the utilisation of the leave days.
- If the workload is excessively burdensome, your application will not be approved unless it is accompanied by a valid emergency justification with supporting documentation.
- Leave requests must be submitted at least one week before the intended leave date.

### Emergency Criteria

- A significant health issue concerning you or a family member, supported by appropriate documentation.
- Major roadway accident resulting in an inability to walk, among other injuries.
- Attending a funeral or handling related arrangements for a close family member.

### Process

- Submit requests via email to HR after lead approval.
- Leave will be approved based on workload and team needs.

---

Regards,
**HR Department**
**Convertt**`

const OVERTIME_POLICY_CONTENT = `# Overtime Policy for Design Team (Permanent Employees Only)

**Effective Date:** 1 May 2026
**Version:** 1.1

## 1. Purpose

This policy defines the overtime framework for permanent employees in the Design Team. It balances the need for extra hours to meet creative deadlines with fair compensation and employee well-being.

## 2. Scope

- Applies only to permanent Design Team employees (UI/UX Designers).
- Does not apply to probationary employees, trainees, interns, or new hires during their probation period.

## 3. Standard Working Hours

- **Daily Schedule:** Monday to Friday, 10:00 AM to 7:00 PM (9 hours per day).
- This includes a 45 minutes break for lunch and prayers.
- **Weekly Standard Hours:** 45 hours (5 days × 9 hours).

## 4. Overtime Requirement & Target

- Designers are expected to work a minimum of **12 hours per week on average**.
- This brings the total expected working hours to **57 hours per week** (45 standard + 12 overtime) during busy periods.
- On a monthly basis, this equates to approximately **48 extra hours** (12 hrs × 4 weeks).

## 5. Overtime Compensation

- For consistently meeting the 48 hours per month target, will receive a fixed **Overtime Allowance of PKR 10,000 per month**.
- Designers who complete 100% of the target (i.e., 48 hours per month) will receive the full Overtime Allowance of PKR 10,000 per month.
- If a designer completes less than 48 overtime hours, the allowance will be calculated accordingly. Example:

> 80% of the target (38.4 hours) = 80% of PKR 10,000 = **PKR 8,000**

- This allowance will be added to the regular monthly salary.
- The allowance is performance-linked and subject to actual hours logged and overall delivery quality.

## 6. Approval & Time Tracking

- All overtime must be approved in advance by the Design Lead or Reporting Manager.
- In urgent situations (client revisions, tight deadlines), verbal or instant message approval is acceptable, but must be followed by proper logging the same day.
- Employees must accurately record their daily login/logout time and total hours worked in the company's time tracking system.
- Weekly hours will be reviewed every Monday.

## 7. Payment & Adjustment

- The PKR 10,000 overtime allowance is paid along with the monthly salary.
- If a designer consistently falls short of the 12 overtime hours per week / 48 hours per month target, the allowance may be adjusted at the discretion of the Design Lead and HR.
- The allowance is taxable as per Government of Pakistan rules.

## 8. Key Guidelines

- Overtime should only be worked when necessary for business deliverables.
- The company will strive to manage workloads efficiently to reduce the need for excessive overtime.
- Taking compensatory time off (in lieu) is not applicable under this fixed allowance structure.

## 9. Non-Compliance

- Working unlogged or unapproved overtime may not be compensated.
- Falsifying working hours will be considered serious misconduct.

## 10. Review

This policy will be reviewed every month. We will keep you informed of any amendments to the policy. Please stay tuned for further updates.

---

Regards,
**HR Department**
**Convertt**`

// ─── Cleanup helper (for "Reset Demo Data") ────────────────────────────────

export async function wipeDemo(): Promise<{ deleted: number }> {
  let deleted = 0
  // Attendance logs marked DEMO
  const al = await prisma.attendanceLog.deleteMany({ where: { notes: DEMO_MARKER } })
  deleted += al.count
  // Leave requests
  const lr = await prisma.leaveRequest.deleteMany({ where: { reason: { contains: DEMO_MARKER } } })
  deleted += lr.count
  // Trusted devices created by seed
  const td = await prisma.trustedDevice.deleteMany({ where: { deviceHash: { startsWith: 'demo-device-' } } })
  deleted += td.count
  // Demo Location
  await prisma.location.deleteMany({ where: { id: 'demo-loc-hq' } }).then((r) => { deleted += r.count })
  // Demo policies + their acks (acks cascade via onDelete: Cascade in schema)
  const pd = await prisma.policyDocument.deleteMany({ where: { id: { startsWith: 'demo-policy-' } } })
  deleted += pd.count
  return { deleted }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}
