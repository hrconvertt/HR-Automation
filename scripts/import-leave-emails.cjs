/**
 * Leave and work-from-home requests taken from the HR inbox.
 *
 * Each row is one email, transcribed rather than summarised — the reason is
 * what the person actually wrote, because "sick" a year later tells you
 * nothing and the difference between a fever and a bereavement matters when
 * anyone looks back at a pattern.
 *
 * Two things this is careful about:
 *
 *  - Leave and WFH are not the same request. A WFH day is worked: it spends no
 *    balance and the attendance for it reads present-from-home, not L. Several
 *    of these emails contain both — Ahsan took the day of his grandmother's
 *    death as leave and worked from home the next; Abdullah's Umrah leave has
 *    WFH days either side of it.
 *  - Sick and casual draw on separate balances. Illness is SICK. An exam, a
 *    family emergency, a bereavement, a hospital run for someone else — those
 *    are CASUAL, however sympathetic the reason.
 *
 * Anything the email does not actually say is not invented: two threads name no
 * dates and are listed at the end for someone to fill in rather than guessed at.
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
  ['Usman Ali', 'LEAVE', 'CASUAL', d(2026, 7, 30), d(2026, 7, 30),
    'Emergency at home — could not come to the office. Short notice apologised for.'],

  ['Ali Shan', 'LEAVE', 'CASUAL', d(2026, 7, 29), d(2026, 7, 29),
    "Grandmother's health very bad — took her to hospital, so could not come in."],

  ['Zuhaa Shafi', 'LEAVE', 'SICK', d(2026, 7, 28), d(2026, 7, 28),
    'Sudden illness since the previous day — high fever with severe flu and vomiting. '
    + 'Not fit to work or travel. Approved by HR the same afternoon; lead was copied.'],

  ['Laiba Mannan', 'LEAVE', 'SICK', d(2026, 7, 28), d(2026, 7, 28),
    'Severe ear infection. Prescription attached to the request. Lead had already '
    + 'approved; available by phone for anything urgent.'],

  ['Muhammad Irfan', 'LEAVE', 'CASUAL', d(2026, 7, 28), d(2026, 7, 28),
    'University examination. Requested in advance and discussed with the team lead.'],
  ['Muhammad Irfan', 'LEAVE', 'CASUAL', d(2026, 7, 31), d(2026, 7, 31),
    'University examination. Requested in advance with 28 July, in the same email.'],

  ['Umer Afzal', 'LEAVE', 'CASUAL', d(2026, 7, 24), d(2026, 7, 24),
    'Important work to be taken care of at home. Resuming the next working day.'],

  ['Tayyab Hussain', 'LEAVE', 'SICK', d(2026, 7, 23), d(2026, 7, 23),
    'High fever and a cold since the previous night. Team lead informed. '
    + 'Approved by HR the same day.'],

  ['Muzaffar Jamil', 'LEAVE', 'CASUAL', d(2026, 7, 16), d(2026, 7, 16),
    'Close friend passed away — day taken to attend to personal matters.'],

  ['Sheikh Taha Adnan', 'LEAVE', 'SICK', d(2026, 7, 8), d(2026, 7, 8),
    'Unwell — not in a state to focus on work or perform responsibilities. Lead copied.'],

  ['Muzaffar Jamil', 'WFH', 'CASUAL', d(2026, 7, 8), d(2026, 7, 8),
    'Urgent personal matter — unable to come to the office. Available through regular '
    + 'working hours, attending all scheduled meetings.'],

  ['Sheikh Taha Adnan', 'LEAVE', 'CASUAL', d(2026, 7, 7), d(2026, 7, 7),
    'University examination 1:00 PM to 5:00 PM. Examination date sheet attached. Lead copied.'],

  ['Muhammad Ahsan', 'LEAVE', 'CASUAL', d(2026, 7, 2), d(2026, 7, 2),
    'Sudden passing of his grandmother — travelled home urgently. Approved by HR as '
    + 'emergency leave.'],
  ['Muhammad Ahsan', 'WFH', 'CASUAL', d(2026, 7, 3), d(2026, 7, 3),
    'Working from home the day after travelling for the bereavement, as offered in the '
    + 'same request.'],

  ['Ali Shan', 'WFH', 'CASUAL', d(2026, 7, 1), d(2026, 7, 1),
    'Unwell with diarrhoea and difficult to travel in, so worked from home rather than '
    + 'taking the day off. Approved as WFH.'],

  // Umrah — leave with work-from-home days either side, all in one email and all
  // confirmed in HR's reply.
  ['Abdullah Shafiq', 'WFH', 'CASUAL', d(2026, 6, 19), d(2026, 6, 19),
    'Working from home the working day before departing for Umrah.'],
  ['Abdullah Shafiq', 'LEAVE', 'ANNUAL', d(2026, 6, 22), d(2026, 7, 6),
    'Umrah — departing 22 June, returning 6 July. Approved by HR.'],
  ['Abdullah Shafiq', 'WFH', 'CASUAL', d(2026, 7, 7), d(2026, 7, 8),
    'Working from home for the two days after returning from Umrah, back on site 9 July.'],

  ['Zuhaa Shafi', 'LEAVE', 'SICK', d(2026, 6, 15), d(2026, 6, 15),
    'Unwell with fever and severe throat pain. Sent to her team lead and forwarded to HR.'],
]

// Emails that ask for leave without saying which days. Guessing a date here
// would put a mark on someone's attendance on no evidence at all.
const UNRESOLVED = [
  ['Ali Hassan', 'Wed 15 Jul 2026, 7:18 PM',
    'Requests two days of leave for examinations but names neither date. Sent on a '
    + 'Wednesday evening, so 16-17 July is likely — likely is not a record.'],
  ['Tayyab Hussain', 'Mon 22 Jun 2026, 1:36 PM',
    'Tells HR about board exams on 3 June, 10 June, 22 June and 2 July with the date '
    + 'sheet attached, but does not request leave for any of them. Exams ran 9:00-12:00, '
    + 'so some may have been half days or none at all.'],
]

const fmt = (x) => x.toISOString().slice(0, 10)

/** Working days between two dates, weekends excluded. */
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
  let fixed = 0
  const skipped = []
  const missing = []
  const mismatched = []

  for (const [name, category, leaveType, from, to, reason] of ROWS) {
    const emp = await p.employee.findFirst({
      where: { fullName: name },
      select: { id: true, employeeCode: true, fullName: true, reportingManagerId: true },
    })
    if (!emp) { missing.push(name); continue }

    const dup = await p.leaveRequest.findFirst({
      where: { employeeId: emp.id, category, fromDate: from },
      select: { id: true, leaveType: true, reason: true },
    })
    if (dup) {
      // The row exists but was reconstructed from attendance, which knew the day
      // and not the reason — so it came through as Casual. The email says
      // otherwise, and Casual and Sick draw on different balances, so a wrong
      // type here is a wrong charge rather than a wrong label.
      const retype = category === 'LEAVE' && dup.leaveType !== leaveType
      const unconfirmed = (dup.reason ?? '').includes('not yet recorded')
      if (retype || unconfirmed) {
        console.log(`${APPLY ? 'FIX ' : 'would fix'}  ${emp.fullName.padEnd(22)} ${fmt(from)}  `
          + (retype ? `${dup.leaveType} → ${leaveType}` : 'reason from the email'))
        if (APPLY) {
          await p.leaveRequest.update({
            where: { id: dup.id },
            data: { ...(retype ? { leaveType } : {}), reason },
          })
        }
        fixed++
        continue
      }
      skipped.push(`${emp.fullName.padEnd(22)} ${fmt(from)}  ${category}  already recorded`)
      continue
    }

    const days = countDays(from, to)
    console.log(`${APPLY ? 'ADD ' : 'would add'}  ${emp.fullName.padEnd(22)} `
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

      // Attendance for each working day in the range. A WFH day is worked.
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
    })
  }

  if (skipped.length) {
    console.log('\nAlready in the system:')
    skipped.forEach((s) => console.log('  ' + s))
  }
  if (missing.length) {
    console.log('\nNo employee record matched: ' + [...new Set(missing)].join(', '))
  }
  if (mismatched.length) {
    console.log('\nAttendance disagrees with the request:')
    mismatched.forEach((s) => console.log('  ' + s))
  }

  console.log('\nNot recorded — the email does not say which days:')
  UNRESOLVED.forEach(([n, when, why]) => console.log(`  ${n} (${when})\n    ${why}`))

  console.log(`\n${ROWS.length} requests read, ${created} ${APPLY ? 'added' : 'to add'}, `
    + `${fixed} corrected, ${skipped.length} already correct, ${UNRESOLVED.length} needing dates.`)
  if (!APPLY && created) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
