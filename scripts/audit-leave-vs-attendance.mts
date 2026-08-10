/**
 * Do the leave records and the attendance sheet agree?
 *
 * The attendance grid is the source Convertt actually keeps day to day. A
 * leave record that says someone was away on a day the grid marks them present
 * is wrong, and it is wrong in a way that costs them — it charges a leave
 * balance and, on a Friday or Monday, offers up a sandwich deduction against
 * somebody who was at their desk.
 *
 * Reports three kinds of disagreement:
 *
 *   PRESENT     the leave covers a working day the grid marks present
 *   NO RECORD   the grid marks leave with no leave record behind it
 *   TEST        a record whose reason looks like scaffolding rather than a fact
 *
 * Read-only. Pass --delete-present to remove approved leave records whose every
 * working day is marked present, restoring the balance they charged.
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()
const DELETE = process.argv.includes('--delete-present')

const key = (d: Date) => d.toISOString().slice(0, 10)
const TEST_REASON = /^\s*(test|testing|asdf|xyz|dummy|sample|abc)\s*$/i

;(async () => {
  const leaves = await p.leaveRequest.findMany({
    where: { status: 'APPROVED', category: 'LEAVE' },
    select: {
      id: true, employeeId: true, fromDate: true, toDate: true, days: true,
      leaveType: true, reason: true,
      employee: { select: { fullName: true } },
    },
    orderBy: { fromDate: 'desc' },
  })

  const logs = await p.attendanceLog.findMany({
    select: { employeeId: true, date: true, status: true },
  })
  const byDay = new Map<string, string>()
  for (const l of logs) byDay.set(`${l.employeeId}|${key(l.date)}`, l.status)

  const clashes: typeof leaves = []
  const partial: Array<{ l: (typeof leaves)[number]; present: string[] }> = []
  const tests: typeof leaves = []

  for (const l of leaves) {
    if (l.reason && TEST_REASON.test(l.reason)) tests.push(l)

    const present: string[] = []
    let working = 0
    const cur = new Date(l.fromDate)
    const end = new Date(l.toDate)
    while (cur <= end) {
      const dow = cur.getUTCDay()
      if (dow !== 0 && dow !== 6) {
        working++
        const st = byDay.get(`${l.employeeId}|${key(cur)}`)
        if (st === 'PRESENT' || st === 'WFH') present.push(key(cur))
      }
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    if (working > 0 && present.length === working) clashes.push(l)
    else if (present.length > 0) partial.push({ l, present })
  }

  console.log(`=== ${clashes.length} leave records where the grid says PRESENT every day ===`)
  for (const l of clashes) {
    console.log(`  ${l.employee.fullName.padEnd(22)} ${key(l.fromDate)}`
      + `${key(l.fromDate) !== key(l.toDate) ? ` → ${key(l.toDate)}` : ''}`
      + `  ${l.leaveType.padEnd(7)} ${String(l.days).padStart(4)}d  "${(l.reason ?? '').slice(0, 40)}"`)
  }

  console.log(`\n=== ${partial.length} records present on SOME days ===`)
  for (const { l, present } of partial) {
    console.log(`  ${l.employee.fullName.padEnd(22)} ${key(l.fromDate)} → ${key(l.toDate)}`
      + `  present on ${present.join(', ')}`)
  }

  console.log(`\n=== ${tests.length} records with a scaffolding reason ===`)
  for (const l of tests) {
    console.log(`  ${l.employee.fullName.padEnd(22)} ${key(l.fromDate)}  "${l.reason}"`)
  }

  // Attendance marked leave with nothing behind it.
  const leaveDays = logs.filter((l) => l.status === 'LEAVE' || l.status === 'HALF_DAY')
  const covered = new Set<string>()
  for (const l of leaves) {
    const cur = new Date(l.fromDate)
    const end = new Date(l.toDate)
    while (cur <= end) {
      covered.add(`${l.employeeId}|${key(cur)}`)
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
  }
  const orphans = leaveDays.filter((l) => !covered.has(`${l.employeeId}|${key(l.date)}`))
  console.log(`\n=== ${orphans.length} attendance leave days with no leave record ===`)
  const names = new Map((await p.employee.findMany({ select: { id: true, fullName: true } }))
    .map((e) => [e.id, e.fullName]))
  for (const o of orphans.slice(0, 40)) {
    console.log(`  ${(names.get(o.employeeId) ?? o.employeeId).padEnd(22)} ${key(o.date)} ${o.status}`)
  }
  if (orphans.length > 40) console.log(`  … and ${orphans.length - 40} more`)

  if (!DELETE) {
    console.log('\nRead-only. Pass --delete-present to remove the records in the first list.')
    await p.$disconnect()
    return
  }

  for (const l of clashes) {
    // Give the balance back before the record goes.
    const bal = await p.leaveBalance.findFirst({
      where: { employeeId: l.employeeId, leaveType: l.leaveType, year: l.fromDate.getUTCFullYear() },
    })
    if (bal) {
      const used = Math.max(0, bal.used - l.days)
      await p.leaveBalance.update({
        where: { id: bal.id }, data: { used, remaining: bal.allocated - used },
      })
    }
    await p.sandwichDeduction.deleteMany({ where: { leaveRequestId: l.id } })
    await p.leaveRequest.delete({ where: { id: l.id } })
    console.log(`  removed  ${l.employee.fullName} ${key(l.fromDate)}`)
  }
  console.log(`\n${clashes.length} removed, balances restored.`)
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
