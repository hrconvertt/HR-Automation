/**
 * Seed the Convertt position ladder.
 *
 * Idempotent: uses upsert keyed on (title, departmentId), so re-running
 * updates rather than duplicates.
 *
 * Usage:
 *   node scripts/seed-positions.cjs
 *
 * The Position model has a 10-level ladder:
 *   INTERN, JUNIOR, EXECUTIVE, ASSOCIATE, SENIOR, LEAD, MANAGER, HEAD, DIRECTOR, C_SUITE
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// (Title, Level, Department-Name)
const POSITIONS = [
  // UI/UX Design
  ['Intern UI/UX Designer',         'INTERN',     'UI/UX Design'],
  ['Junior UI/UX Designer',         'JUNIOR',     'UI/UX Design'],
  ['UI/UX Designer',                'EXECUTIVE',  'UI/UX Design'],
  ['Associate UI/UX Designer',      'ASSOCIATE',  'UI/UX Design'],
  ['Senior UI/UX Designer',         'SENIOR',     'UI/UX Design'],
  ['Lead UI/UX Designer',           'LEAD',       'UI/UX Design'],
  ['Head of UI/UX Design',          'HEAD',       'UI/UX Design'],

  // Web - Shopify
  ['Intern Shopify Developer',                      'INTERN',    'Web - Shopify'],
  ['Junior Shopify Developer',                      'JUNIOR',    'Web - Shopify'],
  ['Shopify Developer',                             'EXECUTIVE', 'Web - Shopify'],
  ['Senior Shopify Developer',                      'SENIOR',    'Web - Shopify'],
  ['Lead Senior Software Engineer',                 'LEAD',      'Web - Shopify'],
  ['Head of Client Servicing & Operations - Shopify','HEAD',     'Web - Shopify'],

  // Web - WordPress
  ['Junior WordPress Developer', 'JUNIOR',    'Web - WordPress'],
  ['WordPress Developer',        'EXECUTIVE', 'Web - WordPress'],
  ['Senior WordPress Developer', 'SENIOR',    'Web - WordPress'],

  // Media Team
  ['Junior Video Editor',             'JUNIOR',    'Media Team'],
  ['Video Editor',                    'EXECUTIVE', 'Media Team'],
  ['Senior Video Editor',             'SENIOR',    'Media Team'],
  ['Senior Graphics & UI Designer',   'SENIOR',    'Media Team'],

  // Marketing
  ['Marketing Associate', 'ASSOCIATE', 'Marketing'],
  ['Marketing Lead',      'LEAD',      'Marketing'],
  ['Head of Marketing',   'HEAD',      'Marketing'],

  // Business Development
  ['BD Executive',                                'EXECUTIVE', 'Business Development'],
  ['BD Associate',                                'ASSOCIATE', 'Business Development'],
  ['BD Manager',                                  'MANAGER',   'Business Development'],
  ['Head of Business Development & Marketing',    'HEAD',      'Business Development'],

  // Human Resources
  ['HR Intern',    'INTERN',    'Human Resources'],
  ['HR Associate', 'ASSOCIATE', 'Human Resources'],
  ['HR Manager',   'MANAGER',   'Human Resources'],
  ['Head of HR',   'HEAD',      'Human Resources'],

  // Finance
  ['Finance Analyst', 'EXECUTIVE', 'Finance'],
  ['Finance Manager', 'MANAGER',   'Finance'],
  ['CFO',             'C_SUITE',   'Finance'],

  // Admin
  ['Office Boy',                 'JUNIOR',    'Admin'],
  ['Admin Executive',            'EXECUTIVE', 'Admin'],
  ['Head of Administration',     'HEAD',      'Admin'],

  // CTO Office
  ['CTO', 'C_SUITE', 'CTO Office'],

  // Executive
  ['COO', 'C_SUITE', 'Executive'],
  ['CEO', 'C_SUITE', 'Executive'],
]

// Department name -> code/seed mapping. If a department doesn't exist
// yet we'll create a stub so the position can still be attached.
const DEPT_CODES = {
  'UI/UX Design': 'UIUX',
  'Web - Shopify': 'WBS',
  'Web - WordPress': 'WBW',
  'Media Team': 'MEDIA',
  'Marketing': 'MKT',
  'Business Development': 'BD',
  'Human Resources': 'HR',
  'Finance': 'FIN',
  'Admin': 'ADM',
  'CTO Office': 'CTO',
  'Executive': 'EXEC',
}

async function findOrCreateDept(name) {
  const existing = await prisma.department.findFirst({ where: { name } })
  if (existing) return existing
  const code = DEPT_CODES[name] ?? name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return prisma.department.create({ data: { name, code } })
}

async function main() {
  console.log(`Seeding ${POSITIONS.length} positions...`)
  let created = 0
  let updated = 0
  for (const [title, level, deptName] of POSITIONS) {
    const dept = await findOrCreateDept(deptName)
    const existing = await prisma.position.findFirst({
      where: { title, departmentId: dept.id },
    })
    if (existing) {
      await prisma.position.update({
        where: { id: existing.id },
        data: { level, active: true },
      })
      updated++
    } else {
      await prisma.position.create({
        data: { title, level, departmentId: dept.id, active: true },
      })
      created++
    }
    process.stdout.write('.')
  }
  console.log(`\nDone. Created ${created}, updated ${updated}.`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
