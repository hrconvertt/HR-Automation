/**
 * The three earlier hiring requests from the Job Requests sheet.
 *
 * Loaded so the recruiting module holds the year's actual history rather than
 * starting from the QA Engineer role — time-to-fill and source quality have
 * nothing to average over otherwise.
 *
 * Two judgements worth stating:
 *
 *  - The Creative Marketing request ran 19-30 June and Laiba Mannan joined on
 *    13 July as Creative Marketing Associate. That is the same role filled, so
 *    it goes in as FILLED rather than CLOSED.
 *  - Column B is truncated in the sheet. "Creative Marketin..." is safe —
 *    Laiba's designation is exactly Creative Marketing Associate. "Business
 *    Partners..." is not: it could be Partnership Manager, Partnerships
 *    Executive or something else, and nobody has that title today. It goes in
 *    as read, flagged, for someone to finish.
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
    title: 'Creative Marketing Associate',
    requestedBy: 'Iqra Naveed',
    raised: d(2026, 6, 19),
    closed: d(2026, 6, 30),
    status: 'FILLED',
    note: 'Filled by Laiba Mannan, who joined on 13 July 2026 in this role.',
  },
  {
    title: 'Business Partnerships & Growth Executive',
    requestedBy: 'Syed Asghar',
    raised: d(2026, 6, 22),
    closed: d(2026, 6, 30),
    status: 'CLOSED',
    note: 'Full title taken from the LinkedIn job-post tab, where the same role '
      + 'was advertised on 22-24 June.',
  },
  {
    title: 'CRO Strategist',
    requestedBy: 'Syed Asghar',
    raised: d(2026, 6, 29),
    closed: d(2026, 7, 6),
    status: 'CLOSED',
    note: 'Has its own JD tab in the sourcing sheet.',
  },
]

const fmt = (x) => x.toISOString().slice(0, 10)

;(async () => {
  let added = 0
  for (const r of ROWS) {
    const by = await p.employee.findFirst({
      where: { fullName: r.requestedBy },
      select: { id: true, departmentId: true, fullName: true },
    })
    if (!by) { console.log(`${r.requestedBy} not found — skipped ${r.title}`); continue }

    const dup = await p.jobRequisition.findFirst({
      where: { title: r.title, requestedById: by.id },
      select: { id: true },
    })
    if (dup) { console.log(`${r.title} — already recorded`); continue }

    console.log((APPLY ? 'ADD ' : 'would add')
      + `  ${r.title.padEnd(30)} ${r.requestedBy.padEnd(14)} `
      + `${fmt(r.raised)} → ${fmt(r.closed)}  ${r.status}`
      )
    added++
    if (!APPLY) continue

    await p.jobRequisition.create({
      data: {
        title: r.title,
        departmentId: by.departmentId,
        type: 'FULL_TIME',
        vacancies: 1,
        status: r.status,
        requestedById: by.id,
        requestReason: 'GROWTH',
        requestNote: r.note,
        postedDate: r.raised,
        closingDate: r.closed,
        decidedAt: r.raised,
        createdAt: r.raised,
      },
    })
  }

  console.log(`\n${ROWS.length} read, ${added} ${APPLY ? 'added' : 'to add'}.`)
  if (!APPLY && added) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
