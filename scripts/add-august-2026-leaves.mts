/**
 * The August 2026 leaves that the attendance grid already marks but no leave
 * record explains.
 *
 * The grid had L cells for Iqra, Tahreem, Taha and Tayyab with nothing behind
 * them — so the days were counted as leave but could not say what kind, why,
 * or who approved them. Each record below comes from the request Tahreem
 * showed me: two emails, one WhatsApp message, and one annual leave she gave
 * the dates for herself.
 *
 * Tayyab's Monday also gets a sandwich deduction. He wrote at 11:28 on the
 * morning of the day itself, which is not prior notice, so section 5 applies —
 * Saturday and Sunday come with it, three unpaid days. The warning is drafted,
 * not sent; sending is a decision for the Sandwich Deductions screen.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   npx tsx scripts/add-august-2026-leaves.mts
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '@prisma/client'
import { countWorkingDays, bracketsWeekendsFor } from '../src/lib/leave-days'
import { assessSandwich, sandwichAmount } from '../src/lib/sandwich'
import { fullMonthNetFor, buildWarning, pkr } from '../src/lib/sandwich-server'

const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

interface Entry {
  name: string
  from: string
  to: string
  type: 'SICK' | 'CASUAL' | 'ANNUAL' | 'UNPAID'
  reason: string
  /** Apply the sandwich rule — only where notice genuinely was not given. */
  sandwich?: boolean
}

const ENTRIES: Entry[] = [
  {
    name: 'Iqra Naveed',
    from: '2026-08-01',
    to: '2026-08-28',
    type: 'ANNUAL',
    reason: 'Annual leave — four weeks, agreed in advance with HR.',
  },
  {
    name: 'Sheikh Taha Adnan',
    from: '2026-08-05',
    to: '2026-08-05',
    type: 'SICK',
    reason:
      'Unwell and unable to come in. Emailed HR at 2:20 PM on the day, copying Iqra, '
      + 'and offered to catch up on pending work on return. Approved by HR the same evening.',
  },
  {
    name: 'Tahreem Waheed',
    from: '2026-08-06',
    to: '2026-08-06',
    type: 'SICK',
    reason:
      'Throat infection. Requested leave from her lead by WhatsApp at 12:13 PM on the day.',
  },
  {
    name: 'Tayyab Hussain',
    from: '2026-08-10',
    to: '2026-08-10',
    type: 'SICK',
    reason:
      'Flu, severe headache and weakness since the previous night, with vomiting that morning. '
      + 'Emailed HR at 11:28 AM on the day requesting leave.',
    sandwich: true,
  },
]

;(async () => {
  for (const e of ENTRIES) {
    const emp = await p.employee.findFirst({
      where: { fullName: e.name },
      select: { id: true, fullName: true, email: true },
    })
    if (!emp) { console.log(`  ! no employee called "${e.name}"`); continue }

    const from = new Date(`${e.from}T00:00:00`)
    const to = new Date(`${e.to}T00:00:00`)

    const holidays = await p.holiday.findMany({
      where: { date: { gte: from, lte: to } },
      select: { date: true },
    })
    const holidayDates = new Set(
      holidays.map((h) => h.date.toISOString().slice(0, 10)),
    )
    const days = countWorkingDays(from, to, {
      holidayDates, bracketWeekends: bracketsWeekendsFor(e.type),
    })

    const clash = await p.leaveRequest.findFirst({
      where: { employeeId: emp.id, fromDate: { lte: to }, toDate: { gte: from } },
      select: { id: true, fromDate: true, toDate: true, leaveType: true },
    })
    if (clash) {
      console.log(`  = ${e.name} already has a record covering ${e.from} `
        + `(${clash.fromDate.toISOString().slice(0, 10)} → ${clash.toDate.toISOString().slice(0, 10)}, ${clash.leaveType})`)
      continue
    }

    console.log(`${APPLY ? 'ADD ' : 'would add'}  ${e.name.padEnd(20)} ${e.from} → ${e.to}  `
      + `${String(days).padStart(4)}d  ${e.type}`)

    if (!APPLY) {
      if (e.sandwich) {
        const s = assessSandwich(from, to, { holidayDates })
        const net = await fullMonthNetFor(emp.id)
        const m = sandwichAmount(net, from.getFullYear(), from.getMonth() + 1, s.days)
        console.log(`        sandwich: ${s.days} unpaid days ${s.dates.join(', ')} `
          + `· net ${pkr(net)} ÷ ${m.divisor} = ${pkr(m.perDay)}/day · ${pkr(m.amount)}`)
      }
      continue
    }

    const leave = await p.leaveRequest.create({
      data: {
        employeeId: emp.id,
        category: 'LEAVE',
        leaveType: e.type,
        fromDate: from,
        toDate: to,
        days,
        reason: e.reason,
        status: 'APPROVED',
        approvedAt: new Date(`${e.from}T12:00:00`),
      },
      select: { id: true },
    })

    // Charge the balance, the same way an approval would.
    const year = from.getFullYear()
    const bal = await p.leaveBalance.findFirst({
      where: { employeeId: emp.id, leaveType: e.type, year },
    })
    if (bal) {
      const used = bal.used + days
      await p.leaveBalance.update({
        where: { id: bal.id },
        data: { used, remaining: bal.allocated - used },
      })
    }

    // Attendance for every working day in the range.
    const cursor = new Date(from)
    let written = 0
    while (cursor <= to) {
      const dow = cursor.getDay()
      const key = cursor.toISOString().slice(0, 10)
      if (dow !== 0 && dow !== 6 && !holidayDates.has(key)) {
        const dayDate = new Date(cursor)
        const data = {
          status: 'LEAVE',
          workType: 'ONSITE',
          hoursWorked: 0,
          notes: `Auto-written from approved leave (${e.type})`,
        }
        await p.attendanceLog.upsert({
          where: { employeeId_date: { employeeId: emp.id, date: dayDate } },
          update: data,
          create: { employeeId: emp.id, date: dayDate, ...data },
        })
        written++
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    console.log(`        ${written} attendance days written`)

    if (!e.sandwich) continue

    const s = assessSandwich(from, to, { holidayDates })
    if (s.windows.length === 0) { console.log('        no Friday or Monday — no sandwich'); continue }
    const net = await fullMonthNetFor(emp.id)
    const month = from.getMonth() + 1
    const m = sandwichAmount(net, year, month, s.days)
    const w = s.windows[0]
    const warning = buildWarning({
      fullName: emp.fullName,
      trigger: w.trigger,
      triggerDate: w.triggerDate,
      dates: s.dates,
      days: s.days,
      amount: m.amount,
      perDayAmount: m.perDay,
      divisorDays: m.divisor,
      month,
      year,
      leaveType: e.type,
      informed: false,
    })
    await p.sandwichDeduction.upsert({
      where: { employeeId_triggerDate: { employeeId: emp.id, triggerDate: new Date(`${w.triggerDate}T00:00:00`) } },
      update: {},
      create: {
        employeeId: emp.id,
        leaveRequestId: leave.id,
        trigger: w.trigger,
        triggerDate: new Date(`${w.triggerDate}T00:00:00`),
        dates: JSON.stringify(s.dates),
        days: s.days,
        month,
        year,
        fullMonthNet: net,
        divisorDays: m.divisor,
        perDayAmount: m.perDay,
        amount: m.amount,
        status: 'APPLIED',
        note: 'Same-day notice on the morning itself — no prior notice to HR or lead.',
        warningSubject: warning.subject,
        warningBody: warning.body,
      },
    })
    console.log(`        sandwich applied: ${s.days} unpaid days · ${pkr(m.perDay)}/day · ${pkr(m.amount)}`)
  }

  if (!APPLY) console.log('\nDry run. Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
