/**
 * scripts/migrate-onboarding-tasks.js
 *
 * Convert legacy OnboardingChecklist booleans into OnboardingTask rows.
 * Idempotent — skips any checklist that already has tasks.
 *
 *   node scripts/migrate-onboarding-tasks.js
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// Mapping from the boolean column on OnboardingChecklist to a row spec.
const BOOLEAN_MAP = [
  { field: 'welcomeEmailSent',       title: 'Welcome email sent',         owner: 'HR',       category: 'PRE_ARRIVAL' },
  { field: 'firstDayCompleted',      title: 'Day 1 schedule completed',   owner: 'HR',       category: 'DAY_1' },
  { field: 'offerLetterIssued',      title: 'Offer letter issued',        owner: 'HR',       category: 'PRE_ARRIVAL' },
  { field: 'agreementSigned',        title: 'Employment agreement signed', owner: 'EMPLOYEE', category: 'WEEK_1_PAPERWORK' },
  { field: 'cnicCopied',             title: 'CNIC copy collected',        owner: 'HR',       category: 'WEEK_1_PAPERWORK' },
  { field: 'bankDetailsCollected',   title: 'Bank details collected',     owner: 'HR',       category: 'WEEK_1_PAPERWORK' },
  { field: 'educationDocsCopied',    title: 'Education documents copied', owner: 'HR',       category: 'WEEK_1_PAPERWORK' },
  { field: 'experienceLettersCopied',title: 'Experience letters copied',  owner: 'HR',       category: 'WEEK_1_PAPERWORK' },
  { field: 'ndaSigned',              title: 'NDA signed',                 owner: 'EMPLOYEE', category: 'WEEK_1_PAPERWORK' },
  { field: 'photoTaken',             title: 'Photo taken for badge',      owner: 'HR',       category: 'DAY_1' },
  { field: 'systemAccessGranted',    title: 'System access granted',      owner: 'IT',       category: 'WEEK_1_IT' },
  { field: 'equipmentIssued',        title: 'Equipment issued',           owner: 'IT',       category: 'DAY_1' },
  { field: 'introductionDone',       title: 'Team introductions',         owner: 'MANAGER',  category: 'DAY_1' },
]

async function main() {
  const checklists = await prisma.onboardingChecklist.findMany({
    include: { tasks: { select: { id: true } } },
  })
  console.log(`Found ${checklists.length} checklists`)

  let created = 0
  let skipped = 0

  for (const cl of checklists) {
    if (cl.tasks.length > 0) {
      skipped++
      continue
    }
    const now = new Date()
    const rows = BOOLEAN_MAP.map((m, idx) => ({
      checklistId: cl.id,
      title: m.title,
      owner: m.owner,
      category: m.category,
      orderIndex: idx,
      isComplete: Boolean(cl[m.field]),
      completedAt: cl[m.field] ? now : null,
    }))
    await prisma.onboardingTask.createMany({ data: rows })
    created += rows.length
    console.log(`  + ${cl.id}: created ${rows.length} tasks`)
  }

  console.log(`\nDone. created=${created} skipped=${skipped}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
