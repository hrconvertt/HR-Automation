/**
 * Seed the 2026 leave balances.
 *
 * Every salary slip prints dashes under Leave Details because there is no
 * balance row to read — not a template problem, an empty table. The issued
 * slips show 12 / 12 / 24, and Zuhaa's June slip shows Sick 12 / 1 / 11, so
 * the figures are per leave type with what has been taken already deducted.
 *
 * Convertt policy is 12 casual + 12 sick. Annual is carried as its own line of
 * 24 on the slip rather than as the sum — Zuhaa's sick day comes off Sick and
 * leaves Annual at 24 — so it is seeded the same way.
 *
 * No pro-rating for joiners. Zuhaa joined on 1 June and her slip still shows
 * the full 12 / 12 / 24, so that is the rule Convertt uses.
 *
 * `used` is counted from approved leave actually recorded for the year, so
 * re-running this cannot inflate anyone's remaining days.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const YEAR = 2026
const ALLOCATION = { CASUAL: 12, SICK: 12, ANNUAL: 24 }

;(async () => {
  const emps = await p.employee.findMany({
    where: { status: { in: ['ACTIVE', 'PROBATION'] } },
    select: { id: true, employeeCode: true, fullName: true },
    orderBy: { fullName: 'asc' },
  })

  // Everything approved and taken this year, by person and type. WFH is not
  // leave and must not come off a balance.
  const taken = await p.leaveRequest.findMany({
    where: {
      status: 'APPROVED',
      category: 'LEAVE',
      fromDate: { gte: new Date(Date.UTC(YEAR, 0, 1)) },
      toDate: { lte: new Date(Date.UTC(YEAR, 11, 31, 23, 59, 59)) },
    },
    select: { employeeId: true, leaveType: true, days: true },
  })
  const used = new Map()
  for (const t of taken) {
    const k = t.employeeId + '::' + t.leaveType
    used.set(k, (used.get(k) ?? 0) + t.days)
  }

  let written = 0
  for (const e of emps) {
    const parts = []
    for (const [type, allocated] of Object.entries(ALLOCATION)) {
      const u = used.get(e.id + '::' + type) ?? 0
      const remaining = Math.max(0, allocated - u)
      parts.push(`${type[0]}${type.slice(1).toLowerCase()} ${allocated}/${u || '-'}/${remaining}`)

      if (!APPLY) continue
      const existing = await p.leaveBalance.findFirst({
        where: { employeeId: e.id, leaveType: type, year: YEAR },
        select: { id: true },
      })
      const data = { allocated, used: u, remaining }
      if (existing) await p.leaveBalance.update({ where: { id: existing.id }, data })
      else await p.leaveBalance.create({ data: { employeeId: e.id, leaveType: type, year: YEAR, ...data } })
    }
    written++
    console.log(`${APPLY ? 'SET ' : 'would set'}  ${e.employeeCode.padEnd(14)} ${e.fullName.padEnd(24)} ${parts.join('   ')}`)
  }

  console.log(`\n${written} employees, three balances each, ${APPLY ? 'written' : 'to write'}.`)
  if (!APPLY) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
