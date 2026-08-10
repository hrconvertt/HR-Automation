/**
 * Straighten the leave dates my import scripts stored an offset out.
 *
 * The system stores a leave day as UTC midnight. Those scripts built dates
 * with `new Date('2026-07-09T00:00:00')`, which is *local* midnight — 19:00Z
 * the previous day in Pakistan. Five records went in five hours early, which
 * reads as the day before everywhere the date is rendered in UTC: Zuhaa's
 * warning opened "Wednesday 08 July and Thursday 09 July" for an absence that
 * was Thursday and Friday.
 *
 * Anything not already at exactly 00:00:00.000Z is snapped to the nearest UTC
 * midnight. Records that were already right are untouched.
 *
 * Dry run by default. Pass --apply to write.
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const isUtcMidnight = (d: Date) =>
  d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0

/** Nearest UTC midnight — 19:00Z rounds forward to the day it was meant to be. */
function snap(d: Date): Date {
  const ms = 86_400_000
  return new Date(Math.round(d.getTime() / ms) * ms)
}

;(async () => {
  const leaves = await p.leaveRequest.findMany({
    select: { id: true, fromDate: true, toDate: true, employee: { select: { fullName: true } } },
  })
  let n = 0
  for (const l of leaves) {
    const badFrom = !isUtcMidnight(l.fromDate)
    const badTo = !isUtcMidnight(l.toDate)
    if (!badFrom && !badTo) continue
    const from = snap(l.fromDate)
    const to = snap(l.toDate)
    console.log(`${APPLY ? 'FIX ' : 'would fix'}  ${l.employee.fullName.padEnd(20)} `
      + `${l.fromDate.toISOString()} → ${from.toISOString()}   `
      + `${l.toDate.toISOString()} → ${to.toISOString()}`)
    n++
    if (APPLY) await p.leaveRequest.update({ where: { id: l.id }, data: { fromDate: from, toDate: to } })
  }

  const deds = await p.sandwichDeduction.findMany({
    select: { id: true, triggerDate: true, employee: { select: { fullName: true } } },
  })
  let m = 0
  for (const d of deds) {
    if (isUtcMidnight(d.triggerDate)) continue
    const t = snap(d.triggerDate)
    console.log(`${APPLY ? 'FIX ' : 'would fix'}  ${d.employee.fullName.padEnd(20)} `
      + `trigger ${d.triggerDate.toISOString()} → ${t.toISOString()}`)
    m++
    if (APPLY) await p.sandwichDeduction.update({ where: { id: d.id }, data: { triggerDate: t } })
  }

  // Attendance rows the same scripts wrote carry the same offset.
  const logs = await p.attendanceLog.findMany({
    where: { notes: { startsWith: 'Auto-written from approved' } },
    select: { id: true, date: true, employeeId: true },
  })
  let k = 0
  for (const a of logs) {
    if (isUtcMidnight(a.date)) continue
    const d = snap(a.date)
    // The target day may already have a row; if so this one is a duplicate.
    const clash = await p.attendanceLog.findUnique({
      where: { employeeId_date: { employeeId: a.employeeId, date: d } }, select: { id: true },
    })
    k++
    if (!APPLY) continue
    if (clash) await p.attendanceLog.delete({ where: { id: a.id } })
    else await p.attendanceLog.update({ where: { id: a.id }, data: { date: d } })
  }
  console.log(`\n${n} leave records, ${m} deductions, ${k} attendance rows.`)
  if (!APPLY) console.log('Dry run. Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
