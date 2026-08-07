/**
 * Move the LinkedIn job-post spend out of the Config blob and into JobPosting
 * rows, so Job Post Payments reads real rows that can be edited one at a time.
 *
 * The 28 rows went into `Config.linkedin_job_post_spend` as JSON because there
 * was nowhere else to put them. JobPosting now carries budget, currency and
 * closedAt, so it can hold them properly.
 *
 * Two rows deserve a note:
 *
 *   - Three posts have no dates at all (two Shopify Developer, one Meta Ads
 *     Expert). The sheet did not record them. postedAt is left null rather
 *     than guessed — a blank is the truth there.
 *
 *   - "Creative Marketing Associate" is two separate requisitions, closing
 *     30 Jun and 31 Jul. A post is attached to the earliest requisition of
 *     that title whose closing date is still ahead of the post, which puts
 *     the 22 Jun post on the June role and the July ones on the July role.
 *
 * Idempotent: tracking tokens are fixed (LN-SHEET-01 …), so a second run
 * updates rather than duplicates. Dry run by default; pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

;(async () => {
  const cfg = await p.config.findUnique({ where: { key: 'linkedin_job_post_spend' } })
  if (!cfg?.value) { console.log('No linkedin_job_post_spend config — nothing to migrate.'); return }
  const rows = JSON.parse(cfg.value)

  const reqs = await p.jobRequisition.findMany({
    select: { id: true, title: true, closingDate: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  /** Earliest requisition of this title still open on the day of the post. */
  function pickRequisition(title, postedAt) {
    const same = reqs.filter((r) => r.title === title)
    if (same.length <= 1) return same[0] ?? null
    if (!postedAt) return same[same.length - 1]
    const when = new Date(postedAt).getTime()
    const live = same
      .filter((r) => r.closingDate && r.closingDate.getTime() >= when)
      .sort((a, b) => a.closingDate.getTime() - b.closingDate.getTime())
    return live[0] ?? same[same.length - 1]
  }

  let n = 0
  let unmatched = 0
  for (const [i, r] of rows.entries()) {
    const req = pickRequisition(r.role, r.from)
    if (!req) { console.log(`  ! no requisition for "${r.role}"`); unmatched++; continue }

    const token = `LN-SHEET-${String(i + 1).padStart(2, '0')}`
    const data = {
      requisitionId: req.id,
      platform: r.platform || 'LINKEDIN',
      postedAt: r.from ? new Date(r.from) : null,
      closedAt: r.to ? new Date(r.to) : null,
      budget: r.dailyAmount ?? null,
      cost: r.paid,                       // null = still running
      currency: r.currency || 'AED',
      status: r.paid == null ? 'ACTIVE' : 'CLOSED',
      notes: 'Imported from the LinkedIn payments sheet.',
    }

    console.log(
      `  ${token}  ${r.role.padEnd(42)} `
      + `${(r.from ?? '—').padEnd(10)} → ${(r.to ?? '—').padEnd(10)} `
      + `budget ${String(r.dailyAmount ?? '—').padStart(4)}  `
      + `paid ${r.paid == null ? 'running' : String(r.paid)}`
      + (req.closingDate ? `   [closes ${req.closingDate.toISOString().slice(0, 10)}]` : ''),
    )
    n++
    if (!APPLY) continue

    await p.jobPosting.upsert({
      where: { trackingToken: token },
      update: data,
      create: { ...data, trackingToken: token },
    })
  }

  const paid = rows.reduce((s, r) => s + (r.paid ?? 0), 0)
  console.log(`\n${n} posts${unmatched ? `, ${unmatched} unmatched` : ''}, AED ${paid.toFixed(2)} billed.`)
  if (!APPLY) console.log('Dry run. Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
