/**
 * Demo data for the Recruiting module.
 *
 * Everything created here carries isDemo = true and can be removed in one go:
 *   node scripts/seed-recruiting-demo.cjs --clear
 *
 * Roles and screening criteria mirror the real "Sourcing JD & Recruitment"
 * workbook (UI/UX Designer, Meta Ads Expert, Shopify Developer) so the pipeline
 * looks like the work the team actually does. The candidates are invented.
 *
 * Run:
 *   node scripts/seed-recruiting-demo.cjs           # create
 *   node scripts/seed-recruiting-demo.cjs --clear   # delete demo rows only
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})

const CLEAR = process.argv.includes('--clear')

async function warmUp(attempts = 6) {
  for (let i = 1; i <= attempts; i++) {
    try { await prisma.$queryRaw`SELECT 1`; return } catch (e) {
      if (i === attempts) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000)
const daysAhead = (n) => new Date(Date.now() + n * 86400000)

// ─── requisitions ───────────────────────────────────────────────────────────

const REQUISITIONS = [
  {
    key: 'uiux',
    title: 'UI/UX Designer',
    deptCode: 'UIUX',
    positionLevel: 'ASSOCIATE',
    type: 'FULL_TIME',
    vacancies: 2,
    salaryMin: 65000,
    salaryMax: 85000,
    scoreThreshold: 60,
    requirements: 'Figma, Adobe XD, web design portfolio, 1+ year experience',
    jdStatus: 'POSTED',
    jdContent: `## UI/UX Designer

We are looking for a UI/UX Designer to join the design team in Lahore.

**What you'll do**
- Design web and mobile interfaces from wireframe through to hand-off
- Work directly with developers to ship what you design
- Contribute to and extend the design system

**What we're looking for**
- 1+ year designing digital products
- Strong Figma skills; Adobe XD a plus
- A portfolio with at least a few end-to-end web projects
- Comfortable working onsite in Lahore`,
    knockouts: [
      { type: 'MIN_YEARS', value: '1', isHard: true },
      { type: 'SKILL', value: 'Figma', isHard: true },
      { type: 'LOCATION', value: 'Lahore', isHard: false },
      { type: 'MIN_EDUCATION', value: 'BACHELORS', isHard: false },
    ],
  },
  {
    key: 'meta',
    title: 'Meta Ads Expert',
    deptCode: 'MRK',
    positionLevel: 'EXECUTIVE',
    type: 'FULL_TIME',
    vacancies: 1,
    salaryMin: 50000,
    salaryMax: 70000,
    scoreThreshold: 65,
    requirements: 'Meta Ads Manager, Pixel setup, campaign optimisation, 6 months+ hands-on',
    jdStatus: 'POSTED',
    jdContent: `## Meta Ads Expert

Own paid social for our own brands and for client accounts.

**What you'll do**
- Plan, launch and optimise Facebook and Instagram campaigns
- Set up and debug Meta Pixel and conversion tracking
- Report on ROAS, CTR and CPC, and act on what the numbers say

**What we're looking for**
- 6 months to 1 year running Meta Ads hands-on
- Comfortable in Ads Manager, not just boosting posts
- A/B testing and audience-building experience
- Lead-gen or eCommerce campaign exposure preferred`,
    knockouts: [
      { type: 'SKILL', value: 'Meta Ads Manager', isHard: true },
      { type: 'MIN_YEARS', value: '1', isHard: false },
      { type: 'WORK_AUTH', value: 'PK', isHard: true },
    ],
  },
  {
    key: 'shopify',
    title: 'Shopify Developer',
    deptCode: 'WBS',
    positionLevel: 'SENIOR',
    type: 'FULL_TIME',
    vacancies: 1,
    salaryMin: 90000,
    salaryMax: 130000,
    scoreThreshold: 70,
    requirements: 'Shopify theme development, Liquid, JavaScript, custom app integration',
    jdStatus: 'JD_APPROVED',
    jdContent: `## Shopify Developer

Build and maintain Shopify storefronts for eCommerce clients.

**What you'll do**
- Develop and customise Shopify themes in Liquid
- Integrate third-party apps and build custom sections
- Own site performance and Core Web Vitals

**What we're looking for**
- 3+ years building on Shopify
- Strong Liquid, JavaScript and CSS
- Experience migrating stores between platforms is a plus`,
    knockouts: [
      { type: 'SKILL', value: 'Shopify', isHard: true },
      { type: 'MIN_YEARS', value: '3', isHard: true },
    ],
  },
]

// ─── candidates ─────────────────────────────────────────────────────────────
// stage spread is deliberate: a full funnel with a couple of knockout failures
// and one silver-medalist, so every part of the module has something to show.

const CANDIDATES = [
  // ── UI/UX Designer ──
  {
    req: 'uiux', fullName: 'Hira Saleem', email: 'hira.saleem@example.com', phone: '0301-1234567',
    currentCompany: 'Netsol Technologies', currentRole: 'Product Designer', experience: 3,
    stage: 'OFFER', source: 'LINKEDIN', matchScore: 91, knockoutStatus: 'PASSED',
    yearsExperience: 3, educationLevel: 'BACHELORS', location: 'Lahore', workAuthorization: 'PK',
    skills: ['Figma', 'Adobe XD', 'Design systems', 'Prototyping', 'User research'],
    scoreReason: 'Strong semantic match on design-system and end-to-end web work; 3y vs 1y floor; Figma + XD both present. Portfolio shows 12 shipped web projects.',
    daysAgo: 26,
    interviews: [
      { round: 1, type: 'VIDEO', daysAgo: 18, duration: 45, rating: 4.5, result: 'PASS', feedback: 'Excellent portfolio walkthrough. Clear reasoning on trade-offs.' },
      { round: 2, type: 'ONSITE', daysAgo: 9, duration: 60, rating: 4.0, result: 'PASS', feedback: 'Design exercise handled well. Good fit with the team.' },
    ],
    offer: { salary: 82000, status: 'PENDING', joinInDays: 21 },
  },
  {
    req: 'uiux', fullName: 'Bilal Tanveer', email: 'bilal.tanveer@example.com', phone: '0333-2345678',
    currentCompany: 'Arbisoft', currentRole: 'UI Designer', experience: 2,
    stage: 'INTERVIEW', source: 'LINKEDIN', matchScore: 78, knockoutStatus: 'PASSED',
    yearsExperience: 2, educationLevel: 'BACHELORS', location: 'Lahore', workAuthorization: 'PK',
    skills: ['Figma', 'Web design', 'Wireframing'],
    scoreReason: 'Meets all must-haves. Mobile-heavy portfolio — fewer end-to-end web projects than the role asks for.',
    daysAgo: 14,
    interviews: [
      { round: 1, type: 'VIDEO', daysAhead: 2, duration: 45, result: null, feedback: null, rating: null },
    ],
  },
  {
    req: 'uiux', fullName: 'Ayesha Nadeem', email: 'ayesha.nadeem@example.com', phone: '0345-3456789',
    currentCompany: 'Freelance', currentRole: 'UI/UX Designer', experience: 1.5,
    stage: 'SCREENING', source: 'CAREERS_PAGE', matchScore: 68, knockoutStatus: 'PASSED',
    yearsExperience: 1, educationLevel: 'BACHELORS', location: 'Karachi', workAuthorization: 'PK',
    skills: ['Figma', 'Illustration', 'Branding'],
    scoreReason: 'Figma strong and portfolio is solid, but based in Karachi against an onsite Lahore role (soft criterion) and no dashboard work.',
    daysAgo: 8,
  },
  {
    req: 'uiux', fullName: 'Danish Iqbal', email: 'danish.iqbal@example.com', phone: '0300-4567890',
    currentCompany: 'Self-taught', currentRole: 'Graphic Designer', experience: 0.5,
    stage: 'REJECTED', source: 'PORTAL', matchScore: null, knockoutStatus: 'FAILED',
    yearsExperience: 0, educationLevel: 'DIPLOMA', location: 'Lahore', workAuthorization: 'PK',
    skills: ['Photoshop', 'Illustrator'],
    knockoutReasons: [
      { type: 'MIN_YEARS', reason: 'Under the 1-year minimum (0 years of product design experience)' },
      { type: 'SKILL', reason: 'No Figma experience listed' },
    ],
    scoreReason: null,
    daysAgo: 11,
  },
  {
    req: 'uiux', fullName: 'Sana Riaz', email: 'sana.riaz@example.com', phone: '0321-5678901',
    currentCompany: 'Systems Ltd', currentRole: 'Senior Product Designer', experience: 6,
    stage: 'REJECTED', source: 'REFERRAL', matchScore: 84, knockoutStatus: 'PASSED',
    yearsExperience: 6, educationLevel: 'MASTERS', location: 'Lahore', workAuthorization: 'PK',
    skills: ['Figma', 'Adobe XD', 'Design systems', 'Team leadership'],
    scoreReason: 'Excellent on every criterion but well above the band for this role — reached the final round and lost to a closer fit.',
    inTalentPool: true, poolTags: 'UI/UX,Senior,Strong,Silver medalist',
    poolReason: 'Final-round candidate for UI/UX Designer — re-engage for the next senior design opening.',
    daysAgo: 30,
    interviews: [
      { round: 1, type: 'VIDEO', daysAgo: 22, duration: 45, rating: 4.5, result: 'PASS', feedback: 'Very strong. Concern is level/comp fit rather than ability.' },
    ],
  },
  // ── Meta Ads Expert ──
  {
    req: 'meta', fullName: 'Usman Ghani', email: 'usman.ghani@example.com', phone: '0302-6789012',
    currentCompany: 'CrecenTech', currentRole: 'Meta Ads Specialist', experience: 2.5,
    stage: 'INTERVIEW', source: 'LINKEDIN', matchScore: 86, knockoutStatus: 'PASSED',
    yearsExperience: 2, educationLevel: 'BACHELORS', location: 'Lahore', workAuthorization: 'PK',
    skills: ['Meta Ads Manager', 'Meta Pixel', 'A/B testing', 'Lead generation', 'Audience targeting'],
    scoreReason: 'Hands-on Pixel, campaign optimisation and A/B testing; meets all must-haves plus several good-to-haves. 2.5 years relevant.',
    daysAgo: 12,
    interviews: [
      { round: 1, type: 'PHONE', daysAgo: 5, duration: 30, rating: 4.0, result: 'PASS', feedback: 'Knows the platform properly — talked through a real scaling decision.' },
      { round: 2, type: 'ONSITE', daysAhead: 3, duration: 60, result: null, feedback: null, rating: null },
    ],
  },
  {
    req: 'meta', fullName: 'Rabia Aslam', email: 'rabia.aslam@example.com', phone: '0313-7890123',
    currentCompany: 'Source Kode Solutions', currentRole: 'Performance Marketer', experience: 3,
    stage: 'SCREENING', source: 'LINKEDIN', matchScore: 74, knockoutStatus: 'PASSED',
    yearsExperience: 3, educationLevel: 'BACHELORS', location: 'Lahore', workAuthorization: 'PK',
    skills: ['Meta Ads Manager', 'Google Ads', 'GA4', 'Looker Studio'],
    scoreReason: 'Strong analytics and multi-channel background. No explicit eCommerce campaign work and no Blueprint certification — worth a call.',
    daysAgo: 6,
  },
  {
    req: 'meta', fullName: 'Zohaib Anwar', email: 'zohaib.anwar@example.com', phone: '0344-8901234',
    currentCompany: 'Karvaan.pk', currentRole: 'Digital Marketing Executive', experience: 1,
    stage: 'APPLIED', source: 'PORTAL', matchScore: 61, knockoutStatus: 'PASSED',
    yearsExperience: 1, educationLevel: 'BACHELORS', location: 'Islamabad', workAuthorization: 'PK',
    skills: ['Facebook Ads', 'SEO', 'Content marketing'],
    scoreReason: 'Ads exposure is real but broad rather than deep; no Pixel or conversion-tracking evidence in the CV.',
    daysAgo: 3,
  },
  {
    req: 'meta', fullName: 'Kamran Shah', email: 'kamran.shah@example.com', phone: '0311-9012345',
    currentCompany: 'Retail startup', currentRole: 'Shopify Store Manager', experience: 2,
    stage: 'REJECTED', source: 'PORTAL', matchScore: null, knockoutStatus: 'FAILED',
    yearsExperience: 2, educationLevel: 'BACHELORS', location: 'Lahore', workAuthorization: 'PK',
    skills: ['Shopify', 'Graphic design', 'Web development'],
    knockoutReasons: [
      { type: 'SKILL', reason: 'No hands-on Meta Ads Manager experience — applied to the wrong opening' },
    ],
    scoreReason: null,
    daysAgo: 9,
  },
  // ── Shopify Developer ──
  {
    req: 'shopify', fullName: 'Faisal Mehmood', email: 'faisal.mehmood@example.com', phone: '0322-0123456',
    currentCompany: 'Ecom agency (remote)', currentRole: 'Senior Shopify Developer', experience: 5,
    stage: 'HIRED', source: 'REFERRAL', matchScore: 94, knockoutStatus: 'PASSED',
    yearsExperience: 5, educationLevel: 'BACHELORS', location: 'Lahore', workAuthorization: 'PK',
    skills: ['Shopify', 'Liquid', 'JavaScript', 'Theme development', 'App integration'],
    scoreReason: 'Every must-have met with depth: 5 years on Shopify, custom Liquid themes, two platform migrations. Referred internally.',
    daysAgo: 45,
    interviews: [
      { round: 1, type: 'TECHNICAL', daysAgo: 34, duration: 60, rating: 4.5, result: 'PASS', feedback: 'Strong Liquid knowledge. Debugged the sample theme issue quickly.' },
      { round: 2, type: 'HR', daysAgo: 27, duration: 30, rating: 4.0, result: 'PASS', feedback: 'Notice period 30 days. Comp expectations within band.' },
    ],
    offer: { salary: 125000, status: 'ACCEPTED', joinInDays: -5 },
  },
  {
    req: 'shopify', fullName: 'Hamza Yousaf', email: 'hamza.yousaf@example.com', phone: '0335-1234509',
    currentCompany: 'Webworks', currentRole: 'Frontend Developer', experience: 3,
    stage: 'SCREENING', source: 'LINKEDIN', matchScore: 71, knockoutStatus: 'PASSED',
    yearsExperience: 3, educationLevel: 'BACHELORS', location: 'Faisalabad', workAuthorization: 'PK',
    openToRemote: true,
    skills: ['JavaScript', 'React', 'Shopify', 'CSS'],
    scoreReason: 'Shopify work is present but secondary to React. Meets the 3-year bar; theme-level depth unclear from the CV.',
    daysAgo: 5,
  },
  {
    req: 'shopify', fullName: 'Nida Farooq', email: 'nida.farooq@example.com', phone: '0306-2345610',
    currentCompany: 'Freelance', currentRole: 'WordPress Developer', experience: 4,
    stage: 'REJECTED', source: 'PORTAL', matchScore: null, knockoutStatus: 'FAILED',
    yearsExperience: 4, educationLevel: 'BACHELORS', location: 'Lahore', workAuthorization: 'PK',
    skills: ['WordPress', 'PHP', 'WooCommerce'],
    knockoutReasons: [
      { type: 'SKILL', reason: 'WooCommerce rather than Shopify — no Liquid or Shopify theme experience' },
    ],
    scoreReason: null,
    daysAgo: 7,
  },
  {
    req: 'shopify', fullName: 'Ahmed Raza', email: 'ahmed.raza@example.com', phone: '0308-3456721',
    currentCompany: 'Systems Ltd', currentRole: 'Full Stack Developer', experience: 4,
    stage: 'APPLIED', source: 'CAREERS_PAGE', matchScore: 66, knockoutStatus: 'PASSED',
    yearsExperience: 4, educationLevel: 'BACHELORS', location: 'Lahore', workAuthorization: 'PK',
    skills: ['JavaScript', 'Node.js', 'Shopify', 'REST APIs'],
    scoreReason: 'Solid engineer with some Shopify exposure; storefront/theme specialism is thinner than the role needs.',
    daysAgo: 2,
  },
]

// ─── run ────────────────────────────────────────────────────────────────────

async function clear() {
  const reqs = await prisma.jobRequisition.findMany({ where: { isDemo: true }, select: { id: true } })
  const reqIds = reqs.map((r) => r.id)
  const cands = await prisma.candidate.findMany({
    where: { OR: [{ isDemo: true }, { requisitionId: { in: reqIds } }] },
    select: { id: true },
  })
  const candIds = cands.map((c) => c.id)

  const offers = await prisma.jobOffer.deleteMany({ where: { candidateId: { in: candIds } } })
  const ints = await prisma.interview.deleteMany({ where: { candidateId: { in: candIds } } })
  const cs = await prisma.candidate.deleteMany({ where: { id: { in: candIds } } })
  const ks = await prisma.knockoutCriterion.deleteMany({ where: { requisitionId: { in: reqIds } } })
  const rs = await prisma.jobRequisition.deleteMany({ where: { id: { in: reqIds } } })
  console.log(`cleared — requisitions ${rs.count}, knockouts ${ks.count}, candidates ${cs.count}, interviews ${ints.count}, offers ${offers.count}`)
}

async function seed() {
  const depts = await prisma.department.findMany({ select: { id: true, code: true } })
  const deptId = (code) => depts.find((d) => d.code === code)?.id ?? null

  const hr = await prisma.employee.findFirst({ where: { employeeCode: 'CON-HR-001' }, select: { id: true } })
  const interviewers = await prisma.employee.findMany({
    where: { status: 'ACTIVE' }, select: { id: true }, take: 3,
  })
  const interviewerIds = JSON.stringify(interviewers.map((e) => e.id))

  const reqIdByKey = {}
  for (const r of REQUISITIONS) {
    const created = await prisma.jobRequisition.create({
      data: {
        title: r.title,
        departmentId: deptId(r.deptCode),
        positionLevel: r.positionLevel,
        type: r.type,
        vacancies: r.vacancies,
        description: r.jdContent.split('\n\n')[1] ?? null,
        requirements: r.requirements,
        salaryMin: r.salaryMin,
        salaryMax: r.salaryMax,
        postedDate: daysAgo(30),
        closingDate: daysAhead(15),
        status: 'OPEN',
        requestedById: hr?.id ?? null,
        requestReason: 'GROWTH',
        requestNote: 'Demo requisition — safe to delete.',
        jdContent: r.jdContent,
        jdStatus: r.jdStatus,
        jdGeneratedAt: daysAgo(32),
        jdApprovedAt: daysAgo(31),
        scoreThreshold: r.scoreThreshold,
        isDemo: true,
        knockoutCriteria: { create: r.knockouts },
      },
      select: { id: true },
    })
    reqIdByKey[r.key] = created.id
    console.log(`  requisition: ${r.title}`)
  }

  let nCand = 0, nInt = 0, nOffer = 0
  for (const c of CANDIDATES) {
    const created = await prisma.candidate.create({
      data: {
        requisitionId: reqIdByKey[c.req],
        fullName: c.fullName,
        email: c.email,
        phone: c.phone,
        currentCompany: c.currentCompany,
        currentRole: c.currentRole,
        experience: c.experience,
        stage: c.stage,
        source: c.source,
        matchScore: c.matchScore ?? null,
        scoreReason: c.scoreReason ?? null,
        knockoutStatus: c.knockoutStatus,
        knockoutReasons: c.knockoutReasons ? JSON.stringify(c.knockoutReasons) : null,
        workAuthorization: c.workAuthorization,
        yearsExperience: c.yearsExperience,
        educationLevel: c.educationLevel,
        location: c.location,
        openToRemote: c.openToRemote ?? false,
        skills: JSON.stringify(c.skills),
        inTalentPool: c.inTalentPool ?? false,
        poolTags: c.poolTags ?? null,
        poolReason: c.poolReason ?? null,
        poolAddedAt: c.inTalentPool ? daysAgo(c.daysAgo - 2) : null,
        notes: 'Demo candidate — safe to delete.',
        isDemo: true,
        createdAt: daysAgo(c.daysAgo),
      },
      select: { id: true },
    })
    nCand++

    for (const iv of c.interviews ?? []) {
      await prisma.interview.create({
        data: {
          candidateId: created.id,
          round: iv.round,
          type: iv.type,
          scheduledAt: iv.daysAhead ? daysAhead(iv.daysAhead) : daysAgo(iv.daysAgo),
          duration: iv.duration,
          interviewerIds,
          meetingLink: iv.type === 'VIDEO' || iv.type === 'PHONE' ? 'https://meet.google.com/demo-link' : null,
          notes: iv.daysAhead ? 'Scheduled — panel confirmed.' : null,
          feedback: iv.feedback,
          rating: iv.rating,
          result: iv.result,
        },
      })
      nInt++
    }

    if (c.offer) {
      await prisma.jobOffer.create({
        data: {
          candidateId: created.id,
          offerDate: daysAgo(Math.max(1, c.daysAgo - 20)),
          salary: c.offer.salary,
          joiningDate: daysAhead(c.offer.joinInDays),
          status: c.offer.status,
          statusChangedAt: c.offer.status === 'ACCEPTED' ? daysAgo(10) : null,
          expiryDate: daysAhead(7),
        },
      })
      nOffer++
    }
  }
  console.log(`\ncreated — requisitions ${REQUISITIONS.length}, candidates ${nCand}, interviews ${nInt}, offers ${nOffer}`)
}

async function main() {
  await warmUp()
  if (CLEAR) { await clear(); await prisma.$disconnect(); return }

  const existing = await prisma.jobRequisition.count({ where: { isDemo: true } })
  if (existing > 0) {
    console.log(`${existing} demo requisition(s) already present — clearing first so nothing is duplicated.`)
    await clear()
  }
  await seed()
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
