/**
 * The two resignation letters in the HR inbox.
 *
 * Both people are already marked RESIGNED, which records that they left and
 * nothing about how: no letter, no date they gave, no acknowledgement, no trail
 * of what came back with them. Salman returned a laptop, office keys and other
 * company property through TCS with a tracking receipt to follow — that is
 * exactly the sort of thing someone asks about a year later.
 *
 * The reason is the person's own wording. Neither wrote anything against the
 * company and both said so explicitly; a summary would lose that, and it is the
 * part that matters if either is ever considered for rehire.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day))

const ROWS = [
  {
    name: 'Muhammad Salman Shahid',
    submittedAt: d(2026, 5, 31),
    lastDay: d(2026, 5, 31),
    reason:
      'Resigned from UI/UX Designer for personal and professional reasons, effective the '
      + 'same day. Grateful for the experience and learning gained with the team.',
    notes:
      'Company laptop returned through TCS with all project files and data on it, along '
      + 'with the office keys and other company belongings. TCS receipt and return details '
      + 'to follow within one to two days. HR acknowledged the same evening and asked for '
      + 'the tracking ID within 24 hours.',
  },
  {
    name: 'Momin Munir',
    submittedAt: d(2026, 4, 27),
    lastDay: d(2026, 5, 27),
    reason:
      'Resigned from Creative Marketing Associate for personal reasons. Wrote that the '
      + 'organisation had believed in him and given him room to grow, and that the decision '
      + 'was in no way a reflection of his experience here.',
    notes:
      'Committed to a smooth handover and to wrapping up his responsibilities before '
      + 'leaving. Accepted by HR the same afternoon; Iqra replied as his lead. Served to '
      + '27 May, which is the date his final salary was calculated against.',
  },
]

const fmt = (x) => x.toISOString().slice(0, 10)

;(async () => {
  const hr = await p.employee.findFirst({
    where: { employeeCode: 'CON-HR-032' }, select: { id: true },
  })

  let done = 0
  for (const r of ROWS) {
    const emp = await p.employee.findFirst({
      where: { fullName: r.name },
      select: { id: true, employeeCode: true, fullName: true, status: true, exitDate: true },
    })
    if (!emp) { console.log(`No employee record for ${r.name}`); continue }

    const existing = await p.resignation.findUnique({
      where: { employeeId: emp.id }, select: { id: true },
    })
    if (existing) {
      console.log(`${emp.fullName} — already recorded`)
      continue
    }

    console.log(`${APPLY ? 'ADD ' : 'would add'}  ${emp.employeeCode.padEnd(14)} ${emp.fullName.padEnd(24)}`
      + ` submitted ${fmt(r.submittedAt)}  last day ${fmt(r.lastDay)}`)
    done++
    if (!APPLY) continue

    await p.resignation.create({
      data: {
        employeeId: emp.id,
        submittedAt: r.submittedAt,
        intendedLastDay: r.lastDay,
        reason: r.reason,
        managerAckedAt: r.submittedAt,
        managerAckedById: hr ? hr.id : null,
        managerNotes: r.notes,
        status: 'ACKNOWLEDGED',
      },
    })

    // The exit date is the day they actually stopped, and payroll reads it.
    if (!emp.exitDate) {
      await p.employee.update({ where: { id: emp.id }, data: { exitDate: r.lastDay } })
      console.log(`      exit date set to ${fmt(r.lastDay)}`)
    }
  }

  console.log(`\n${ROWS.length} letters, ${done} ${APPLY ? 'recorded' : 'to record'}.`)
  if (!APPLY && done) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
