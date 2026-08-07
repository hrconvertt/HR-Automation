/**
 * LinkedIn job-post spend, recorded now so it is not lost while the module is
 * still to be built.
 *
 * There is no JobPostSpend table yet. Rather than let the sheet be the only
 * record for another week, the rows go into Config under
 * `linkedin_job_post_spend` as JSON, and each requisition gets its own total
 * written onto it. When the table exists it reads this key and the data is
 * already here — nobody re-types 28 rows.
 *
 * Amounts are AED, as the sheet has them. Free posts are recorded as 0 rather
 * than dropped: knowing a role was advertised at no cost is a fact about that
 * role, and dropping it would make cost-per-hire look better than it was.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

// role | start | end | daily AED | paid AED  (0 = free post)
const SPEND = [
  ['Shopify Developer', null, null, 0, 0],
  ['Shopify Developer', null, null, 0, 0],
  ['Business Development Executive', '2026-02-05', '2026-02-05', 0, 0],
  ['Business Development Executive', '2026-02-05', '2026-02-09', 38, 190],
  ['Project Coordinator', '2026-02-09', '2026-02-11', 37, 185],
  ['Shopify Developer', '2026-02-11', '2026-02-13', 37, 148],
  ['Business Development Executive', '2026-02-11', '2026-02-13', 38, 152],
  ['Meta Ads Expert', null, null, 0, 0],
  ['Financial Analyst', '2026-02-19', '2026-02-19', 0, 0],
  ['Shopify Developer', '2026-02-24', '2026-02-25', 0, 0],
  ['Financial Analyst', '2026-02-25', '2026-02-26', 0, 0],
  ['Graphic Designer - UIUX', '2026-03-10', '2026-03-11', 0, 0],
  ['Creative Marketing Associate', '2026-06-22', '2026-06-22', 0, 0],
  ['Business Partnerships & Growth Executive', '2026-06-22', '2026-06-23', 0, 0],
  ['Business Partnerships & Growth Executive', '2026-06-23', '2026-06-24', 29, 60.9],
  ['CRO Strategist', '2026-06-29', '2026-06-29', 0, 0],
  ['CRO Strategist', '2026-07-01', '2026-07-02', 37, 74],
  ['Creative Marketing Associate', '2026-07-01', '2026-07-01', 0, 0],
  ['Creative Marketing Associate', '2026-07-02', '2026-07-03', 37, 74],
  ['CRO Strategist', '2026-07-06', '2026-07-07', 37, 74],
  ['Creative Marketing Associate', '2026-07-06', '2026-07-07', 0, 0],
  ['Creative Marketing Associate', '2026-07-06', '2026-07-07', 37, 74],
  ['CRO Strategist', '2026-07-08', '2026-07-08', 0, 0],
  ['Creative Marketing Associate', '2026-07-09', '2026-07-10', 0, 0],
  ['CRO Strategist', '2026-07-09', '2026-07-10', 37, 104],
  ['CRO Strategist', '2026-07-13', '2026-07-13', 0, 0],
  ['Creative Marketing Associate', '2026-07-13', '2026-07-14', 37, 106],
  ['Creative Marketing Associate', '2026-07-15', '2026-07-16', 37, null], // still active in the sheet
]

;(async () => {
  const rows = SPEND.map(([role, from, to, daily, paid]) => ({
    role, platform: 'LINKEDIN', from, to, currency: 'AED',
    dailyAmount: daily, paid,
  }))

  const byRole = new Map()
  for (const r of rows) {
    const cur = byRole.get(r.role) ?? { posts: 0, paid: 0, unknown: 0 }
    cur.posts++
    if (r.paid == null) cur.unknown++
    else cur.paid += r.paid
    byRole.set(r.role, cur)
  }

  console.log('Spend by role (AED):')
  for (const [role, t] of [...byRole].sort((a, b) => b[1].paid - a[1].paid)) {
    console.log(`  ${role.padEnd(42)} ${String(t.posts).padStart(2)} posts  `
      + `AED ${t.paid.toFixed(2).padStart(8)}`
      + (t.unknown ? `  (+${t.unknown} still running)` : ''))
  }
  const total = [...byRole.values()].reduce((n, t) => n + t.paid, 0)
  console.log(`  ${''.padEnd(42)} ${String(rows.length).padStart(2)} posts  AED ${total.toFixed(2).padStart(8)} total`)

  if (!APPLY) { console.log('\nDry run. Re-run with --apply to write.'); return }

  await p.config.upsert({
    where: { key: 'linkedin_job_post_spend' },
    update: { value: JSON.stringify(rows) },
    create: { key: 'linkedin_job_post_spend', value: JSON.stringify(rows) },
  })

  // And onto each requisition, so the spend is visible on the role itself.
  let tagged = 0
  for (const [role, t] of byRole) {
    const req = await p.jobRequisition.findFirst({
      where: { title: role }, select: { id: true, requestNote: true },
    })
    if (!req) continue
    const line = `LinkedIn: ${t.posts} post${t.posts === 1 ? '' : 's'}, `
      + `AED ${t.paid.toFixed(2)} spent${t.unknown ? ' so far' : ''}.`
    if ((req.requestNote ?? '').includes('LinkedIn:')) continue
    await p.jobRequisition.update({
      where: { id: req.id },
      data: { requestNote: [req.requestNote, line].filter(Boolean).join(' ') },
    })
    tagged++
  }

  console.log(`\nRecorded ${rows.length} posts to config, ${tagged} requisitions tagged.`)
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
