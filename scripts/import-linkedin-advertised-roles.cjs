/**
 * Roles advertised on LinkedIn before the Job Requests sheet started.
 *
 * The Job Requests tab only goes back to 19 June. The LinkedIn payments tab
 * goes back to February and carries six roles that were recruited for with no
 * request row behind them — the hiring happened, the paperwork started later.
 *
 * Dates are the first day each role was advertised. Nobody is recorded as the
 * requester: the payments tab does not say who asked, and attributing a
 * requisition to a manager who did not raise it is worse than leaving it blank.
 *
 * Vacancies default to 1 and are marked unconfirmed in the note. The sheet
 * never recorded a headcount, and one is the safe reading of a single advert —
 * but it is a reading, not a fact, so it says so.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day))

const ROWS = [
  { title: 'Business Development Executive', from: d(2026, 2, 5), to: d(2026, 2, 13) },
  { title: 'Project Coordinator', from: d(2026, 2, 9), to: d(2026, 2, 11) },
  { title: 'Shopify Developer', from: d(2026, 2, 11), to: d(2026, 2, 25) },
  { title: 'Meta Ads Expert', from: d(2026, 2, 11), to: d(2026, 2, 13) },
  { title: 'Financial Analyst', from: d(2026, 2, 19), to: d(2026, 2, 26) },
  { title: 'Graphic Designer - UIUX', from: d(2026, 3, 10), to: d(2026, 3, 11) },
]

const fmt = (x) => x.toISOString().slice(0, 10)

;(async () => {
  let added = 0
  for (const r of ROWS) {
    const dup = await p.jobRequisition.findFirst({
      where: { title: r.title },
      select: { id: true },
    })
    if (dup) { console.log(`${r.title} — already recorded`); continue }

    console.log((APPLY ? 'ADD ' : 'would add')
      + `  ${r.title.padEnd(32)} ${fmt(r.from)} → ${fmt(r.to)}  CLOSED  ·  1 vacancy (unconfirmed)`)
    added++
    if (!APPLY) continue

    await p.jobRequisition.create({
      data: {
        title: r.title,
        type: 'FULL_TIME',
        vacancies: 1,
        status: 'CLOSED',
        requestReason: 'GROWTH',
        requestNote:
          'Reconstructed from the LinkedIn job-post payments tab, which is the '
          + 'only record of this role — it predates the Job Requests sheet. '
          + 'Requester unknown, and the headcount was never written down, so one '
          + 'vacancy is assumed from the single advert rather than known.',
        postedDate: r.from,
        closingDate: r.to,
        createdAt: r.from,
      },
    })
  }

  console.log(`\n${ROWS.length} read, ${added} ${APPLY ? 'added' : 'to add'}.`)
  if (!APPLY && added) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
