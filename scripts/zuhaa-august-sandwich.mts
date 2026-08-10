/**
 * Zuhaa Shafi — Thursday 6 and Friday 7 August 2026.
 *
 * A second unnotified absence, same shape as the July one: away Thursday and
 * Friday, nobody told. The Friday opens the window, so Friday, Saturday and
 * Sunday are the unpaid days. The July deduction stands untouched.
 *
 * Dates are built with Date.UTC. The earlier scripts used local midnight,
 * which is 19:00Z the day before here, and put five records a day out.
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { PrismaClient } from '@prisma/client'
import { assessSandwich, sandwichAmount } from '../src/lib/sandwich'
import { fullMonthNetFor, buildWarning, pkr } from '../src/lib/sandwich-server'

const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

const FROM = utc(2026, 8, 6)   // Thursday
const TO = utc(2026, 8, 7)     // Friday

const emp = await p.employee.findFirstOrThrow({
  where: { fullName: 'Zuhaa Shafi' }, select: { id: true, fullName: true },
})

const clash = await p.leaveRequest.findFirst({
  where: { employeeId: emp.id, fromDate: { lte: TO }, toDate: { gte: FROM } },
  select: { id: true, fromDate: true, toDate: true },
})
if (clash) {
  console.log(`Already a record covering those days: ${clash.fromDate.toISOString().slice(0,10)} → ${clash.toDate.toISOString().slice(0,10)}`)
  await p.$disconnect()
} else {
  const s = assessSandwich(FROM, TO)
  const net = await fullMonthNetFor(emp.id, 2026, 8)
  const m = sandwichAmount(net, 2026, 8, s.days)
  const w = s.windows[0]

  console.log(`${APPLY ? 'ADD ' : 'would add'}  leave    Thu 06 → Fri 07 Aug 2026  CASUAL  2 days`)
  console.log(`${APPLY ? 'ADD ' : 'would add'}  sandwich ${w.trigger.toLowerCase()} ${w.triggerDate} → ${s.days} unpaid days ${s.dates.join(', ')}`)
  console.log(`          net ${pkr(net)} ÷ ${m.divisor} = ${pkr(m.perDay)}/day × ${s.days} = ${pkr(m.amount)}`)

  if (APPLY) {
    const leave = await p.leaveRequest.create({
      data: {
        employeeId: emp.id, category: 'LEAVE', leaveType: 'CASUAL',
        fromDate: FROM, toDate: TO, days: 2, status: 'APPROVED',
        approvedAt: new Date(),
        reason: 'Away Thursday and Friday without informing HR or her lead beforehand.',
      },
      select: { id: true },
    })
    const bal = await p.leaveBalance.findFirst({
      where: { employeeId: emp.id, leaveType: 'CASUAL', year: 2026 },
    })
    if (bal) {
      const used = bal.used + 2
      await p.leaveBalance.update({ where: { id: bal.id }, data: { used, remaining: bal.allocated - used } })
      console.log(`          balance  CASUAL used ${bal.used} → ${used}`)
    }
    for (const d of [utc(2026, 8, 6), utc(2026, 8, 7)]) {
      const data = { status: 'LEAVE', workType: 'ONSITE', hoursWorked: 0, notes: 'Auto-written from approved leave (CASUAL)' }
      await p.attendanceLog.upsert({
        where: { employeeId_date: { employeeId: emp.id, date: d } },
        update: data, create: { employeeId: emp.id, date: d, ...data },
      })
    }
    const warn = buildWarning({
      fullName: emp.fullName, trigger: w.trigger, triggerDate: w.triggerDate,
      dates: s.dates, days: s.days, amount: m.amount, perDayAmount: m.perDay,
      divisorDays: m.divisor, month: 8, year: 2026, leaveType: 'CASUAL',
      informed: false, leaveFrom: '2026-08-06', leaveTo: '2026-08-07',
    })
    await p.sandwichDeduction.create({
      data: {
        employeeId: emp.id, leaveRequestId: leave.id, trigger: w.trigger,
        triggerDate: utc(2026, 8, 7), dates: JSON.stringify(s.dates), days: s.days,
        month: 8, year: 2026, fullMonthNet: net, divisorDays: m.divisor,
        perDayAmount: m.perDay, amount: m.amount, status: 'APPLIED',
        note: 'Away Thursday and Friday with no notice to HR or her lead.',
        warningSubject: warn.subject, warningBody: warn.body,
      },
    })
    console.log('\n' + warn.subject + '\n')
    console.log(warn.body.split('\n').slice(2, 11).join('\n'))
  } else {
    console.log('\nDry run. Re-run with --apply to write.')
  }
  await p.$disconnect()
}
