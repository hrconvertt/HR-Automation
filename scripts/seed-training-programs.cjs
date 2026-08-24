/**
 * Seed the Training & Development catalogue with a starter set of programs
 * across all five categories. Idempotent: skips any program whose title
 * already exists, so it is safe to re-run.
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// title, type, duration (hours), optional provider, description
const PROGRAMS = [
  // ── Technical ──
  ['Learning Claude & Claude Code', 'TECHNICAL', 12, null, 'Using Claude and Claude Code for day-to-day work and productivity.'],
  ['Prompt Engineering Basics', 'TECHNICAL', 6, null, 'Writing effective prompts for AI tools.'],
  ['React & Next.js Bootcamp – Batch 3', 'TECHNICAL', 40, null, 'Building modern web apps with React and Next.js.'],
  ['SQL & Databases Fundamentals', 'TECHNICAL', 16, null, 'Querying and modelling relational data.'],
  ['Git & Version Control', 'TECHNICAL', 8, null, 'Branching, merging and collaborating with Git.'],
  ['AWS / Cloud Essentials', 'TECHNICAL', 20, null, 'Core cloud concepts and AWS services.'],
  ['Excel for HR & Ops', 'TECHNICAL', 10, null, 'Formulas, pivot tables and reporting for HR and operations.'],
  ['Figma for Designers', 'TECHNICAL', 12, null, 'UI design and prototyping in Figma.'],
  ['API Integration & Postman', 'TECHNICAL', 8, null, 'Consuming and testing REST APIs.'],
  ['Cybersecurity Awareness (Technical)', 'TECHNICAL', 6, null, 'Secure coding and threat awareness for technical staff.'],

  // ── Soft skills ──
  ['Business Communication & Email Etiquette', 'SOFT_SKILLS', 6, null, 'Clear, professional written and verbal communication.'],
  ['Leadership 101', 'SOFT_SKILLS', 12, null, 'Foundations of leading a team, for new team leads.'],
  ['Time & Task Management', 'SOFT_SKILLS', 4, null, 'Prioritisation and personal productivity.'],
  ['Client Handling & Professionalism', 'SOFT_SKILLS', 6, null, 'Managing client relationships and expectations.'],
  ['Presentation & Public Speaking', 'SOFT_SKILLS', 8, null, 'Delivering confident presentations.'],
  ['Conflict Resolution', 'SOFT_SKILLS', 4, null, 'Handling disagreements constructively.'],
  ['Teamwork & Collaboration', 'SOFT_SKILLS', 4, null, 'Working effectively across teams.'],
  ['Giving & Receiving Feedback', 'SOFT_SKILLS', 4, null, 'Practical feedback skills for everyone.'],

  // ── Compliance (mandatory) ──
  ['Anti-Harassment & Workplace Conduct 2026', 'COMPLIANCE', 3, null, 'Mandatory annual anti-harassment and conduct training.'],
  ['Data Protection & Confidentiality (NDA)', 'COMPLIANCE', 2, null, 'Handling confidential company and client data.'],
  ['Code of Conduct Acknowledgement', 'COMPLIANCE', 1, null, 'Review and acknowledge the company Code of Conduct.'],
  ['Workplace Health & Safety', 'COMPLIANCE', 2, null, 'Office safety and emergency procedures.'],
  ['Anti-Bribery & Ethics', 'COMPLIANCE', 2, null, 'Ethical conduct and anti-bribery policy.'],
  ['IT & Acceptable Use Policy', 'COMPLIANCE', 1, null, 'Responsible use of company systems and devices.'],
  ['Leave & Attendance Policy Sign-off', 'COMPLIANCE', 1, null, 'Understand and acknowledge the leave and attendance policy.'],

  // ── Onboarding (new joiners) ──
  ['Convertt Orientation – Welcome & Culture', 'ONBOARDING', 3, null, 'Company introduction, values and culture.'],
  ['HR Policy Walkthrough', 'ONBOARDING', 2, null, 'Key HR policies every new joiner should know.'],
  ['Tools & Systems Setup', 'ONBOARDING', 2, null, 'Email, HR portal and communication tools setup.'],
  ['Meet the Teams & Org Structure', 'ONBOARDING', 1, null, 'Who does what, and how teams fit together.'],
  ['First 90 Days Plan', 'ONBOARDING', 2, null, 'Goals and milestones for the first three months.'],
  ['Probation Expectations & KPIs', 'ONBOARDING', 1, null, 'What success looks like during probation.'],

  // ── External (sponsored / vendor-led) ──
  ['PMP / Project Management Certification', 'EXTERNAL', 35, 'PMI', 'External project management certification.'],
  ['Google Data Analytics (Coursera)', 'EXTERNAL', 60, 'Coursera', 'External data analytics professional certificate.'],
  ['Digital Marketing Certification', 'EXTERNAL', 30, 'External provider', 'External digital marketing course.'],
  ['Industry Conference / Seminar', 'EXTERNAL', 8, 'External', 'Attendance at an industry conference or seminar.'],
  ['Vendor Product Training', 'EXTERNAL', 6, 'Vendor', 'Product training delivered by a vendor.'],
  ['English Language / IELTS Prep', 'EXTERNAL', 40, 'External provider', 'External English language / IELTS preparation.'],
]

async function main() {
  let created = 0, skipped = 0
  for (const [title, type, duration, provider, description] of PROGRAMS) {
    const existing = await prisma.trainingProgram.findFirst({ where: { title } })
    if (existing) { skipped++; continue }
    await prisma.trainingProgram.create({
      data: { title, type, duration, provider: provider ?? null, description },
    })
    created++
  }
  console.log(`Training programs — created ${created}, skipped ${skipped} (already present).`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
