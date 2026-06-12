/**
 * scripts/add-show-cause-policies.js
 * ───────────────────────────────────
 * Adds two PolicyDocument rows aligned with the Show Cause workflow:
 *
 *   1. Show Cause → Termination Eligibility (3-strike rule)
 *   2. Show Cause → Increment Eligibility (blocks next increment cycle)
 *
 * Idempotent on title — re-running updates content + bumps version.
 *
 * Run with DATABASE_URL set:
 *   node scripts/add-show-cause-policies.js
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const POLICIES = [
  {
    title: 'Show Cause → Termination Eligibility',
    category: 'CODE_OF_CONDUCT',
    type: 'CODE_OF_CONDUCT',
    description:
      'Three formal Show Cause Notices within 12 months make an employee eligible for termination.',
    content: `# Show Cause → Termination Eligibility

## Purpose
Establish a fair, predictable threshold at which repeated formal Show Cause Notices result in termination eligibility.

## Policy
Employees who receive **three (3) formal Show Cause Notices within a rolling 12-month period** become eligible for termination following Convertt's standard exit clearance procedures.

## Scope
- Applies to all permanent and probation employees.
- "Formal Show Cause Notice" means a notice issued by HR after the manager-meeting + HR-meeting workflow has been completed and escalation was warranted.
- Counted occurrences are only those with status \`ISSUED\`, \`RESPONDED\`, \`RESOLVED\`, or \`ESCALATED_TO_PIP\`.

## Process
1. HR maintains the running count of formal Show Causes per employee in the Performance module.
2. Upon issuance of the third notice within the rolling 12-month window, HR notifies the Co-Founder & Head of Administration.
3. Standard exit clearance (Lifecycle module) is initiated and includes:
   - Final settlement calculation
   - IT asset recovery
   - Knowledge transfer plan
   - Last-working-day determination
4. Termination type recorded as \`INVOLUNTARY\`.

## Notes
- The 12-month window is *rolling* — notices fall out of count once they age past 12 months.
- This policy does not replace zero-tolerance triggers (e.g. theft, harassment) which can warrant immediate termination outside this counting rule.

*Effective from policy publication date. Subject to revision at HR's discretion with Co-Founder approval.*`,
    version: '1.0',
    audience: 'ALL',
    requiresAck: true,
    status: 'PUBLISHED',
  },
  {
    title: 'Show Cause → Increment Eligibility',
    category: 'COMPENSATION',
    type: 'HR_POLICY',
    description:
      'A Show Cause Notice during probation or within 6 months post-confirmation blocks the next increment cycle.',
    content: `# Show Cause → Increment Eligibility

## Purpose
Tie compensation progression to consistent conduct and performance.

## Policy
Employees who receive a Show Cause Notice **during their probation period** or **within the first 6 months following confirmation** are **NOT eligible** for the next scheduled increment cycle.

Increment eligibility resumes **six (6) months after the Show Cause is formally resolved** (status = \`RESOLVED\`).

## Scope
- Applies to annual increments and promotion-driven increments.
- Does NOT apply to statutory adjustments (minimum wage, inflation parity) which are organisation-wide.

## Examples
| Scenario                                                                   | Eligibility                          |
|---------------------------------------------------------------------------|--------------------------------------|
| Show Cause issued in probation month 2, resolved in month 3                | Skip next increment. Eligible 6 mo post-resolution. |
| Show Cause issued 4 months after confirmation, resolved a month later      | Skip next increment. Eligible 6 mo post-resolution. |
| Show Cause issued 8 months after confirmation                              | Standard increment process applies. |
| Show Cause status \`ESCALATED_TO_PIP\`                                       | Increment paused until PIP outcome.  |

## Process
1. HR flags the employee record at the next compensation review cycle.
2. The Compensation panel displays a "Increment paused — Show Cause" badge on the employee profile.
3. Once the eligibility window passes, the badge clears and the employee re-enters the standard cycle.

## Notes
- This policy interacts with the Termination Eligibility policy. A third Show Cause within 12 months supersedes increment-blocking — it triggers termination eligibility instead.

*Effective from policy publication date. Subject to revision at HR's discretion with Co-Founder approval.*`,
    version: '1.0',
    audience: 'ALL',
    requiresAck: true,
    status: 'PUBLISHED',
  },
]

async function main() {
  console.log('=== Adding Show Cause policies ===')
  for (const p of POLICIES) {
    const existing = await prisma.policyDocument.findFirst({ where: { title: p.title } })
    if (existing) {
      // Bump minor version on re-run
      const v = parseFloat(existing.version || '1.0')
      const next = Number.isFinite(v) ? (v + 0.1).toFixed(1) : '1.1'
      await prisma.policyDocument.update({
        where: { id: existing.id },
        data: {
          ...p,
          version: next,
          publishedAt: existing.publishedAt ?? new Date(),
        },
      })
      console.log(`  · Updated: ${p.title} → v${next}`)
    } else {
      await prisma.policyDocument.create({
        data: {
          ...p,
          effectiveDate: new Date(),
          publishedAt: new Date(),
        },
      })
      console.log(`  + Created: ${p.title}`)
    }
  }
  console.log('\nDone.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
