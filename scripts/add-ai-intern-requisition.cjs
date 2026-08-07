/**
 * AI Intern — one requisition, and the free job post that went with it.
 *
 * Dates are deliberately left empty on the post. Tahreem is filling those in
 * herself, and a guessed date on a payments record is worse than a blank one.
 * Budget and paid are both 0 because the post was free, which is a fact she
 * gave; blank would have meant "not known".
 *
 * Platform is LinkedIn — every one of the 28 recorded posts went there — and
 * is editable from the row if this one did not.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const TITLE = 'AI Intern'

;(async () => {
  const existing = await p.jobRequisition.findFirst({ where: { title: TITLE }, select: { id: true } })
  if (existing) { console.log(`"${TITLE}" already exists — nothing to do.`); return }

  console.log(`${APPLY ? 'ADD ' : 'would add'}  requisition  ${TITLE}  ·  INTERNSHIP  ·  1 vacancy  ·  OPEN`)
  console.log(`${APPLY ? 'ADD ' : 'would add'}  job post     LinkedIn · free · no dates`)

  if (!APPLY) { console.log('\nDry run. Re-run with --apply to write.'); return }

  const req = await p.jobRequisition.create({
    data: {
      title: TITLE,
      type: 'INTERNSHIP',
      vacancies: 1,
      status: 'OPEN',
      requestReason: 'GROWTH',
      requestNote: 'Added by HR.',
    },
    select: { id: true },
  })

  await p.jobPosting.create({
    data: {
      requisitionId: req.id,
      platform: 'LINKEDIN',
      trackingToken: `LN-AIINTERN-${Date.now().toString(36).toUpperCase()}`,
      postedAt: null,
      closedAt: null,
      budget: 0,
      cost: 0,
      currency: 'AED',
      status: 'ACTIVE',
      notes: 'Free post. Dates to be filled in by HR.',
    },
  })

  console.log(`\nDone. Requisition ${req.id}, one free post with the dates left blank.`)
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
