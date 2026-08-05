/**
 * Third batch of leave and work-from-home requests, March to April 2026.
 *
 * Same rules as before. Two things this batch turns on:
 *
 *  - Rayyan's April request is a genuine block — he says "nine consecutive days
 *    of remote office work", 9 to 21 April, and his own list covers the two
 *    days off in the middle. That is a range, unlike his June one, which named
 *    six separate days with office days between them.
 *  - Ahsan appears three times and only one is leave. Fever on 17 March, the
 *    post-Eid ticket on 24 March and the return from the family emergency on
 *    30 March were all days he worked from home — he says so each time, and one
 *    of them lists what he had already delivered that morning. Marking those as
 *    leave would take days off a balance for days he worked.
 *
 * "Tayoshi Shinji" is Tayyab Hussain writing from his iCloud address.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day))

const ROWS = [
  ['Umar Ameen', 'LEAVE', 'CASUAL', d(2026, 4, 20), d(2026, 4, 20),
    'Emergency — unable to come to the office. Resuming as soon as possible.'],

  ['Ali Hassan', 'LEAVE', 'CASUAL', d(2026, 4, 16), d(2026, 4, 16),
    'Urgent personal matter needing immediate attention. Approved by HR the same day; '
    + 'lead copied.'],

  // Sent from his iCloud address under the name Tayoshi Shinji.
  ['Tayyab Hussain', 'LEAVE', 'CASUAL', d(2026, 4, 9), d(2026, 4, 9),
    'Taking his father to CMH for a worsening severe eye infection — appointment that day '
    + 'and he had to go with him.'],

  ['Ali Hassan', 'LEAVE', 'CASUAL', d(2026, 4, 9), d(2026, 4, 9),
    "Brother's engagement ceremony — presence required at the family event. Approved by "
    + 'HR and by Abdullah as lead.'],

  // A real block this time: nine consecutive days of remote work, his words.
  ['Muhammad Rayyan', 'WFH', 'CASUAL', d(2026, 4, 9), d(2026, 4, 21),
    'Working remotely 9 to 21 April for midterm examinations — nine consecutive days of '
    + 'remote office work, papers on the 9th, 13th, 14th, 15th, 16th, 20th and 21st.'],

  ['Muhammad Ahsan', 'WFH', 'CASUAL', d(2026, 3, 30), d(2026, 3, 30),
    'Travelling back to Lahore after an emergency at home — delivered part of the work in '
    + 'the morning and completed the rest on arriving.'],

  ['Momin Munir', 'LEAVE', 'SICK', d(2026, 3, 27), d(2026, 3, 27),
    'Unwell — one day only. Medical certificate attached to the request.'],

  ['Muhammad Ahsan', 'WFH', 'CASUAL', d(2026, 3, 24), d(2026, 3, 24),
    'Could not get a return ticket for the third day of Eid in the post-Eid rush — '
    + 'travelling back to Lahore that night, so worked from home and joined the office '
    + 'the next day.'],

  ['Muhammad Usman Saeed', 'LEAVE', 'CASUAL', d(2026, 3, 24), d(2026, 3, 24),
    'Sister admitted to hospital for two days and undergoing surgery that day — needed '
    + 'with the family.'],

  ['Abdullah Shafiq', 'LEAVE', 'CASUAL', d(2026, 3, 24), d(2026, 3, 25),
    "Close friend's wedding out of the city."],

  ['Muzaffar Jamil', 'WFH', 'CASUAL', d(2026, 3, 24), d(2026, 3, 26),
    'Working from home Tuesday to Thursday ahead of a wedding. Already agreed with Atta; '
    + 'approved by HR.'],
  ['Muzaffar Jamil', 'LEAVE', 'CASUAL', d(2026, 3, 27), d(2026, 3, 27),
    'Friday taken as leave to attend a wedding, requested in the same email as the three '
    + 'work-from-home days before it.'],

  ['Muhammad Ahsan', 'WFH', 'CASUAL', d(2026, 3, 17), d(2026, 3, 17),
    'Fever — worked from home rather than coming in. Atta informed.'],

  ['Usman Ali', 'LEAVE', 'CASUAL', d(2026, 3, 16), d(2026, 3, 16),
    'Heavy hailstones and severe weather in his area, transport limited and unsafe in the '
    + 'rain. Photograph of the conditions attached to the request.'],

  ['Muhammad Usman Saeed', 'LEAVE', 'SICK', d(2026, 3, 9), d(2026, 3, 9),
    'Fever. Abdullah informed as well.'],
]

const fmt = (x) => x.toISOString().slice(0, 10)

function countDays(from, to) {
  let n = 0
  const c = new Date(from)
  while (c <= to) {
    const w = c.getUTCDay()
    if (w !== 0 && w !== 6) n++
    c.setUTCDate(c.getUTCDate() + 1)
  }
  return n
}

;(async () => {
  const hr = await p.employee.findFirst({
    where: { employeeCode: 'CON-HR-032' }, select: { id: true },
  })

  let created = 0
  const skipped = []
  const missing = []

  for (const [name, category, leaveType, from, to, reason] of ROWS) {
    const emp = await p.employee.findFirst({
      where: { fullName: name },
      select: { id: true, fullName: true, joiningDate: true, reportingManagerId: true },
    })
    if (!emp) { missing.push(name); continue }
    if (from < emp.joiningDate) {
      skipped.push(`${emp.fullName.padEnd(24)} ${fmt(from)}  before joining date`)
      continue
    }

    const dup = await p.leaveRequest.findFirst({
      where: { employeeId: emp.id, category, fromDate: from },
      select: { id: true },
    })
    if (dup) {
      skipped.push(`${emp.fullName.padEnd(24)} ${fmt(from)}  ${category} already recorded`)
      continue
    }

    const days = countDays(from, to)
    console.log(`${APPLY ? 'ADD ' : 'would add'}  ${emp.fullName.padEnd(24)} `
      + `${fmt(from)}${fmt(from) === fmt(to) ? '           ' : ' → ' + fmt(to)}  `
      + `${category === 'WFH' ? 'WFH   ' : leaveType.padEnd(6)} ${days}d`)
    created++
    if (!APPLY) continue

    await p.$transaction(async (tx) => {
      await tx.leaveRequest.create({
        data: {
          employeeId: emp.id,
          category,
          leaveType,
          fromDate: from,
          toDate: to,
          days,
          reason,
          status: 'APPROVED',
          managerApprovedById: emp.reportingManagerId,
          managerApprovedAt: from,
          approvedById: hr ? hr.id : null,
          approvedAt: from,
          approvalComment: 'Requested by email to HR and approved.',
        },
      })

      const c = new Date(from)
      while (c <= to) {
        const w = c.getUTCDay()
        if (w !== 0 && w !== 6) {
          const day = new Date(c)
          const data = category === 'WFH'
            ? { status: 'PRESENT', workType: 'WFH', hoursWorked: 8,
                notes: 'Auto-written from approved work from home' }
            : { status: 'LEAVE', workType: 'ONSITE', hoursWorked: 0,
                notes: `Auto-written from approved leave (${leaveType})` }
          const log = await tx.attendanceLog.findFirst({
            where: { employeeId: emp.id, date: day }, select: { id: true },
          })
          if (log) await tx.attendanceLog.update({ where: { id: log.id }, data })
          else await tx.attendanceLog.create({ data: { employeeId: emp.id, date: day, ...data } })
        }
        c.setUTCDate(c.getUTCDate() + 1)
      }
    }, { timeout: 120000, maxWait: 120000 })
  }

  if (skipped.length) {
    console.log('\nSkipped:')
    skipped.forEach((s) => console.log('  ' + s))
  }
  if (missing.length) console.log('\nNo employee matched: ' + [...new Set(missing)].join(', '))
  console.log(`\n${ROWS.length} read, ${created} ${APPLY ? 'added' : 'to add'}, ${skipped.length} skipped.`)
  if (!APPLY && created) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
