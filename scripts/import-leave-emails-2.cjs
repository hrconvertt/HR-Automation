/**
 * Second batch of leave and work-from-home requests from the HR inbox,
 * April to June 2026.
 *
 * Same rules as the first batch: the reason is what the person wrote, illness
 * is SICK and everything else CASUAL however sympathetic, and a WFH day is
 * worked rather than taken.
 *
 * Three of these are worth reading twice:
 *
 *  - Rayyan asked to work remotely on six separate exam days, not for a block.
 *    Recorded as six one-day WFH records, because 1-11 June as a range would
 *    have marked him remote on days he was in the office.
 *  - Momin's sister's wedding is three WFH days followed by two of leave. He
 *    set it out that way himself.
 *  - Salman wrote on a Sunday evening asking for leave "tomorrow", so the day
 *    is the Monday, not the day the email was sent.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day))

// name | category | type | from | to | reason
const ROWS = [
  ['Ali Shan', 'LEAVE', 'SICK', d(2026, 6, 12), d(2026, 6, 12),
    '102°F fever, low blood pressure and chills. Seeing the doctor after Friday prayer.'],

  ['Ali Hassan', 'LEAVE', 'CASUAL', d(2026, 6, 12), d(2026, 6, 12),
    'Important university exam/paper scheduled that day. Requested the evening before; '
    + 'lead copied.'],

  ['Ali Shan', 'LEAVE', 'SICK', d(2026, 6, 10), d(2026, 6, 10),
    'Fever, cough and sore throat. Prescription from Bin Sai Medical attached to the '
    + 'request.'],

  ['Tayyab Hussain', 'LEAVE', 'CASUAL', d(2026, 6, 3), d(2026, 6, 3),
    'Supplementary examination, and taking his father to the doctor on the every-two-days '
    + 'schedule he had already told HR about.'],

  // Six separate exam days, not a block — he was in the office in between.
  ...[1, 3, 4, 8, 10, 11].map((day) => [
    'Muhammad Rayyan', 'WFH', 'CASUAL', d(2026, 6, day), d(2026, 6, day),
    'Working remotely during the final examination period. Discussed in advance with '
    + 'Atta and his lead Momna. Available through working hours and attending meetings.',
  ]),

  ['Muzaffar Jamil', 'LEAVE', 'CASUAL', d(2026, 5, 15), d(2026, 5, 15),
    'Urgent personal work. Team lead already informed.'],

  ['Tayyab Hussain', 'LEAVE', 'CASUAL', d(2026, 5, 8), d(2026, 5, 8),
    'Mother unwell — taking her to the doctor. Asked despite knowing Friday leave is '
    + 'not normally allowed.'],

  ['Muhammad Irfan', 'LEAVE', 'CASUAL', d(2026, 5, 8), d(2026, 5, 8),
    'Urgent personal work needing immediate attention. Short notice apologised for.'],

  ['Sheikh Taha Adnan', 'LEAVE', 'CASUAL', d(2026, 5, 7), d(2026, 5, 7),
    'University project presentation taking most of the day. Lead copied.'],

  // Written Sunday evening for "tomorrow" — the day is the Monday.
  ['Muhammad Salman Shahid', 'LEAVE', 'SICK', d(2026, 5, 4), d(2026, 5, 4),
    'Serious stomach illness after a sudden change in food and water, confirmed by a '
    + 'doctor. Not in a condition to travel. Requested the evening before; lead copied.'],

  ['Usman Ali', 'LEAVE', 'CASUAL', d(2026, 4, 30), d(2026, 4, 30),
    'Family moving house — needed at home to help. Khawer and his lead Iqra had already '
    + 'approved it.'],

  // Sister's wedding: three days worked from home, then two taken as leave.
  ['Momin Munir', 'WFH', 'CASUAL', d(2026, 4, 20), d(2026, 4, 22),
    "Sister's wedding — working from home Monday to Wednesday and fully available "
    + 'through regular working hours.'],
  ['Momin Munir', 'LEAVE', 'CASUAL', d(2026, 4, 23), d(2026, 4, 24),
    "Sister's wedding — Thursday and Friday taken as leave. Pending work completed "
    + 'ahead of schedule and handed over.'],

  ['Muhammad Irfan', 'LEAVE', 'SICK', d(2026, 4, 24), d(2026, 4, 24),
    'Unwell — needed time off to rest and recover.'],
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

    // Nobody takes leave before they joined.
    if (from < emp.joiningDate) {
      skipped.push(`${emp.fullName.padEnd(24)} ${fmt(from)}  before joining date — skipped`)
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
      // The pooler is slow enough that the 5s default expires on a range.
    }, { timeout: 120000, maxWait: 120000 })
  }

  if (skipped.length) {
    console.log('\nSkipped:')
    skipped.forEach((s) => console.log('  ' + s))
  }
  if (missing.length) {
    console.log('\nNo employee record matched: ' + [...new Set(missing)].join(', '))
  }
  console.log(`\n${ROWS.length} requests read, ${created} ${APPLY ? 'added' : 'to add'}, `
    + `${skipped.length} skipped.`)
  if (!APPLY && created) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
