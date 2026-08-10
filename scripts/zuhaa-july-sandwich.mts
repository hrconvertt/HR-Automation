/**
 * Zuhaa Shafi — Thursday 9 and Friday 10 July 2026, and the sandwich that
 * follows from the Friday.
 *
 * The record as it stood said one day, Friday, "reason not yet recorded", and
 * Thursday was still marked present. Tahreem's account is that she was away
 * both days and told neither HR nor her lead, so:
 *
 *   - Thursday is corrected from present to leave and the record covers both
 *     days rather than one.
 *   - The Friday opens a sandwich window under leave policy section 5:
 *     Friday, Saturday and Sunday, three unpaid days off pay.
 *
 * The leave still charges her casual balance and the sandwich charges pay.
 * Those are two different charges for the same Friday, which is what the
 * policy intends — the day costs a leave day and the weekend costs money.
 *
 * The warning is drafted, not sent. Sending is a decision, and it belongs on
 * the Sandwich Deductions screen where it can be read first.
 *
 * Dry run by default. Pass --apply to write.
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '@prisma/client'
import { countWorkingDays, bracketsWeekendsFor } from '../src/lib/leave-days'
import { assessSandwich, sandwichAmount } from '../src/lib/sandwich'
import { fullMonthNetFor, buildWarning, pkr } from '../src/lib/sandwich-server'

const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const NAME = 'Zuhaa Shafi'
const FROM = '2026-07-09'   // Thursday
const TO = '2026-07-10'     // Friday
const REASON =
  'Away Thursday and Friday without informing HR or her lead beforehand. '
  + 'The Friday brings the sandwich rule with it — see the deduction recorded against it.'

;(async () => {
  const emp = await p.employee.findFirst({
    where: { fullName: NAME },
    select: { id: true, fullName: true, email: true },
  })
  if (!emp) { console.log(`No employee called "${NAME}".`); return }

  const from = new Date(`${FROM}T00:00:00`)
  const to = new Date(`${TO}T00:00:00`)

  const holidays = await p.holiday.findMany({
    where: { date: { gte: from, lte: to } }, select: { date: true },
  })
  const holidayDates = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)))

  // Widened by a day at each end. The stored dates are UTC midnight and these
  // are local midnight, so an exact-boundary comparison misses by the offset.
  const searchFrom = new Date(from); searchFrom.setDate(searchFrom.getDate() - 1)
  const searchTo = new Date(to); searchTo.setDate(searchTo.getDate() + 1)
  const existing = await p.leaveRequest.findFirst({
    where: { employeeId: emp.id, fromDate: { lte: searchTo }, toDate: { gte: searchFrom } },
  })
  if (!existing) { console.log('No leave record found around those dates.'); return }

  const days = countWorkingDays(from, to, {
    holidayDates, bracketWeekends: bracketsWeekendsFor(existing.leaveType),
  })
  const delta = days - existing.days

  console.log(`${APPLY ? 'EDIT' : 'would edit'}  ${emp.fullName}`)
  console.log(`   dates  ${existing.fromDate.toISOString().slice(0, 10)} → ${existing.toDate.toISOString().slice(0, 10)}`
    + `   becomes  ${FROM} → ${TO}`)
  console.log(`   days   ${existing.days} becomes ${days}  (${delta >= 0 ? '+' : ''}${delta} on the ${existing.leaveType} balance)`)
  console.log(`   reason set, Thursday corrected from present to leave`)

  const s = assessSandwich(from, to, { holidayDates })
  const month = from.getMonth() + 1
  const year = from.getFullYear()
  const net = await fullMonthNetFor(emp.id, year, month)
  const m = sandwichAmount(net, year, month, s.days)
  const w = s.windows[0]

  console.log(`   sandwich  ${w.trigger.toLowerCase()} ${w.triggerDate} → ${s.days} unpaid days `
    + `${s.dates.join(', ')}`)
  console.log(`             net ${pkr(net)} ÷ ${m.divisor} days = ${pkr(m.perDay)}/day `
    + `× ${s.days} = ${pkr(m.amount)}`)

  if (!APPLY) { console.log('\nDry run. Re-run with --apply to write.'); return }

  await p.leaveRequest.update({
    where: { id: existing.id },
    data: { fromDate: from, toDate: to, days, reason: REASON },
  })

  if (delta !== 0) {
    const bal = await p.leaveBalance.findFirst({
      where: { employeeId: emp.id, leaveType: existing.leaveType, year },
    })
    if (bal) {
      const used = Math.max(0, bal.used + delta)
      await p.leaveBalance.update({
        where: { id: bal.id },
        data: { used, remaining: bal.allocated - used },
      })
      console.log(`   balance  ${existing.leaveType} used ${bal.used} → ${used}`)
    }
  }

  // Thursday was recorded present. It was not.
  const cursor = new Date(from)
  while (cursor <= to) {
    const dow = cursor.getDay()
    const key = cursor.toISOString().slice(0, 10)
    if (dow !== 0 && dow !== 6 && !holidayDates.has(key)) {
      const dayDate = new Date(cursor)
      const data = {
        status: 'LEAVE',
        workType: 'ONSITE',
        hoursWorked: 0,
        notes: `Auto-written from approved leave (${existing.leaveType})`,
      }
      await p.attendanceLog.upsert({
        where: { employeeId_date: { employeeId: emp.id, date: dayDate } },
        update: data,
        create: { employeeId: emp.id, date: dayDate, ...data },
      })
    }
    cursor.setDate(cursor.getDate() + 1)
  }

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
    leaveType: existing.leaveType,
    informed: false,
  })

  await p.sandwichDeduction.upsert({
    where: {
      employeeId_triggerDate: {
        employeeId: emp.id, triggerDate: new Date(`${w.triggerDate}T00:00:00`),
      },
    },
    update: {},
    create: {
      employeeId: emp.id,
      leaveRequestId: existing.id,
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
      note: 'Away Thursday and Friday with no notice to HR or her lead.',
      warningSubject: warning.subject,
      warningBody: warning.body,
    },
  })

  console.log('\nDone. Warning drafted — send it from Leave → Sandwich Deductions.')
  console.log('─'.repeat(72))
  console.log(warning.subject)
  console.log('─'.repeat(72))
  console.log(warning.body)
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
