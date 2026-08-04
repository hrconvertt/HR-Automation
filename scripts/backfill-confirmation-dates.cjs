/**
 * Fill in missing confirmation dates.
 *
 * Convertt's probation is three months, so for anyone whose record has no
 * confirmation date the date is derivable: joining date plus three months. It
 * was blank on most records simply because nobody typed it in, and a blank
 * there means no employment letter can be generated and no probation record
 * knows when it ended.
 *
 * Only ACTIVE and PROBATION employees are touched. Someone who resigned or was
 * terminated during probation was never confirmed, and writing a confirmation
 * date for them would be inventing an event that did not happen.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const PROBATION_MONTHS = 3

const fmt = (d) => d.toISOString().slice(0, 10)

/** Joining date + n months, clamped when the day does not exist in the target month. */
function addMonths(date, n) {
  const d = new Date(date)
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + n)
  if (d.getUTCDate() < day) d.setUTCDate(0) // 31 Jan + 1 month -> 28/29 Feb
  return d
}

;(async () => {
  const emps = await p.employee.findMany({
    where: {
      confirmationDate: null,
      status: { in: ['ACTIVE', 'PROBATION'] },
    },
    select: {
      id: true, employeeCode: true, fullName: true,
      joiningDate: true, employeeType: true, status: true,
    },
    orderBy: { joiningDate: 'asc' },
  })

  const today = new Date()
  let written = 0
  const future = []

  for (const e of emps) {
    const conf = addMonths(e.joiningDate, PROBATION_MONTHS)
    const passed = conf <= today
    const line = `${e.employeeCode.padEnd(14)} ${e.fullName.padEnd(26)} joined ${fmt(e.joiningDate)} -> confirmed ${fmt(conf)}`
    if (!passed) {
      // Still inside probation — the date is a projection, not a fact.
      future.push(line + '   (still on probation)')
      continue
    }
    console.log((APPLY ? 'SET  ' : 'would set ') + line)
    written++
    if (APPLY) {
      await p.employee.update({ where: { id: e.id }, data: { confirmationDate: conf } })
    }
  }

  if (future.length) {
    console.log('\nSkipped — probation has not ended yet, so there is nothing to confirm:')
    future.forEach((f) => console.log('  ' + f))
  }

  console.log(`\n${emps.length} without a confirmation date, ${written} ${APPLY ? 'written' : 'to write'}.`)
  if (!APPLY && written) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
