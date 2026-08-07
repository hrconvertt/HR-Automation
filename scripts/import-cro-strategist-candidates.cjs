/**
 * The CRO Strategist screening tab, and two headcount corrections.
 *
 * Five candidates were screened in the sheet against gates the JD sets — 4+
 * years CRO, 20+ live A/B tests run end to end, 2+ years GA4, 2+ years Shopify
 * optimisation. Those are the must-haves, and the sheet's column headers state
 * them, so the score below is worked from the sheet's own assessments rather
 * than invented.
 *
 * Two corrections you gave: Graphic Designer - UIUX was two people and both
 * were filled; Business Development Executive was one and filled. Both were
 * imported as CLOSED with one vacancy assumed, which was the wrong reading.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

// Verdict bands from the cv-screening skill: STRONG 80+, SHORTLIST 55-79,
// MAYBE 40-54, PASS under 40. Failing a must-have caps the score near 50.
const CANDIDATES = [
  {
    fullName: 'Ali Masoomi',
    email: 'ali.trileconversion@gmail.com',
    phone: '+92 304 5166183',
    location: 'Lahore, Pakistan',
    currentCompany: 'CRO Consulting Practice (self-employed)',
    yearsExperience: 7,
    score: 88,
    stage: 'SCREENING',
    reason:
      'STRONG. Clears every gate: 7-8 years CRO across 50+ Shopify brands, 50+ '
      + 'A/B programmes, 7+ years GA4 and Shopify as a primary platform. '
      + 'Intelligems, VWO, ABConvert, Optimizely. The one open question is that '
      + 'he works client-side and not full time, so availability needs '
      + 'confirming on the call.',
  },
  {
    fullName: 'Sundus Tariq',
    email: 'sundustariq09@gmail.com',
    phone: '+92 331 8544391',
    location: 'Lahore, Pakistan',
    currentCompany: 'ANCORRD (CMO)',
    yearsExperience: 11,
    score: 72,
    stage: 'SCREENING',
    reason:
      'SHORTLIST. 11 years and real results — £7.4M+ sales at 3.5-4.5% CVR, '
      + 'Google Optimize, Optimizely, Unbounce, Hotjar. But CRO is part of a CMO '
      + 'toolkit rather than the specialism, and the A/B count is "multiple" '
      + 'rather than a number, so the 20+ gate is unproven.',
  },
  {
    fullName: 'Moiz Malik',
    email: 'moizmalik21@gmail.com',
    phone: '+92 342 4451688',
    location: 'Lahore, Pakistan',
    currentCompany: 'The Vertical (Team Lead — Performance Marketing)',
    yearsExperience: 3,
    score: 38,
    stage: 'REJECTED',
    reason:
      'PASS. Fails two must-haves. 2-3 years of CRO named inside paid media '
      + 'rather than dedicated, and the A/B testing described is creative and '
      + 'ad-level, not site experimentation. No Shopify, no VWO, Optimizely or '
      + 'Convert.',
  },
  {
    fullName: 'Taimoor Malik',
    email: 'taimoormalik256@gmail.com',
    phone: '+92 348 9444718',
    location: 'Lahore / Islamabad, Pakistan',
    currentCompany: 'App in Snap Pvt Ltd (Business Analyst)',
    yearsExperience: 2,
    score: 34,
    stage: 'REJECTED',
    reason:
      'PASS. 1-2 years of A/B testing in a SaaS product context rather than '
      + 'ecommerce CRO, a handful of tests against the 20+ needed, and no '
      + 'Shopify at all. Analytics is there — GA4, Clarity, Mixpanel — but the '
      + 'experimentation platforms are not.',
  },
  {
    fullName: 'Yashal Waseem',
    email: 'yashal_waseem_1@hotmail.com',
    phone: '+92 335 4480663',
    location: 'Lahore, Pakistan',
    currentCompany: 'Giant Group (Digital Marketing Coordinator)',
    yearsExperience: 1,
    score: 22,
    stage: 'REJECTED',
    reason:
      'PASS. 0-1 years — landing page conversion improvement mentioned once, no '
      + 'A/B testing programme, no GA4 as a dedicated skill, no Shopify and no '
      + 'CRO tooling named.',
  },
]

;(async () => {
  // ── Headcount corrections ──────────────────────────────────────────────
  const fixes = [
    { title: 'Graphic Designer - UIUX', vacancies: 2, status: 'FILLED' },
    { title: 'Business Development Executive', vacancies: 1, status: 'FILLED' },
  ]
  for (const f of fixes) {
    const r = await p.jobRequisition.findFirst({ where: { title: f.title }, select: { id: true } })
    if (!r) { console.log(`${f.title} — not found`); continue }
    console.log((APPLY ? 'FIX  ' : 'would fix ') + `${f.title} → ${f.vacancies} vacancies, ${f.status}`)
    if (APPLY) {
      await p.jobRequisition.update({
        where: { id: r.id },
        data: { vacancies: f.vacancies, status: f.status },
      })
    }
  }

  // ── CRO Strategist candidates ──────────────────────────────────────────
  const cro = await p.jobRequisition.findFirst({
    where: { title: 'CRO Strategist' }, select: { id: true },
  })
  if (!cro) { console.log('\nCRO Strategist requisition not found.'); return }

  console.log('')
  let added = 0
  for (const c of CANDIDATES) {
    const dup = await p.candidate.findFirst({
      where: { requisitionId: cro.id, email: c.email }, select: { id: true },
    })
    if (dup) { console.log(`${c.fullName} — already recorded`); continue }

    console.log((APPLY ? 'ADD ' : 'would add')
      + `  ${c.fullName.padEnd(16)} ${String(c.score).padStart(3)}/100  ${c.stage}`)
    added++
    if (!APPLY) continue

    await p.candidate.create({
      data: {
        requisitionId: cro.id,
        fullName: c.fullName,
        email: c.email,
        phone: c.phone,
        currentCompany: c.currentCompany,
        yearsExperience: c.yearsExperience,
        experience: c.yearsExperience,
        stage: c.stage,
        source: 'LINKEDIN',
        matchScore: c.score,
        scoreReason: c.reason,
        notes: `Location: ${c.location}. Screened against the JD's four gates: `
          + '4+ yrs CRO, 20+ live A/B tests run end to end, 2+ yrs GA4, 2+ yrs '
          + 'Shopify optimisation.',
        knockoutStatus: c.score >= 55 ? 'PASSED' : 'FAILED',
        workAuthorization: 'PK',
      },
    })
  }

  console.log(`\n${CANDIDATES.length} screened, ${added} ${APPLY ? 'added' : 'to add'}.`)
  if (!APPLY && added) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
