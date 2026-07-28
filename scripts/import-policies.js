/**
 * Import Convertt policy documents from .docx files into the PolicyDocument table.
 *
 *   Reads every .docx file in DOCS_DIR, extracts text via mammoth, and upserts a
 *   PolicyDocument record. Idempotent — re-running updates content + bumps
 *   effectiveDate if changed.
 *
 *   Usage:
 *     DATABASE_URL="postgres://..." node scripts/import-policies.js
 */
const fs = require('fs')
const path = require('path')
const mammoth = require('mammoth')
const { PrismaClient } = require('@prisma/client')

const DOCS_DIR = String.raw`C:\Users\HRConvertt\Documents\Docs`

// Map filename keyword → { title, category, type, audience, requiresAck }
// Anything not matched falls through to GENERAL / HR_POLICY / ALL / no-ack.
const POLICY_META = {
  Allowances:            { title: 'Allowances Policy',                 category: 'COMPENSATION',     type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Annual_Profit_Share:   { title: 'Annual Profit Share Policy',        category: 'COMPENSATION',     type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Anti_Bribery:          { title: 'Anti-Bribery & Gifts Policy',       category: 'CODE_OF_CONDUCT',  type: 'CODE_OF_CONDUCT', audience: 'ALL',     requiresAck: true  },
  Anti_Harassment:       { title: 'Anti-Harassment Policy',            category: 'CODE_OF_CONDUCT',  type: 'CODE_OF_CONDUCT', audience: 'ALL',     requiresAck: true  },
  Bonus_Increment:       { title: 'Bonus & Increment Policy',          category: 'COMPENSATION',     type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Career_Ladder:         { title: 'Career Ladder Policy',              category: 'GENERAL',          type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Code_of_Ethics:        { title: 'Code of Ethics',                    category: 'CODE_OF_CONDUCT',  type: 'CODE_OF_CONDUCT', audience: 'ALL',     requiresAck: true  },
  Compensation_Benefits: { title: 'Compensation & Benefits Policy',    category: 'COMPENSATION',     type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Conflict_of_Interest:  { title: 'Conflict of Interest Policy',       category: 'CODE_OF_CONDUCT',  type: 'CODE_OF_CONDUCT', audience: 'ALL',     requiresAck: true  },
  Employee_Handbook:     { title: 'Employee Handbook',                 category: 'GENERAL',          type: 'HR_POLICY',       audience: 'ALL',     requiresAck: true  },
  Employee_Referral:     { title: 'Employee Referral Program',         category: 'COMPENSATION',     type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Exit_Offboarding:      { title: 'Exit & Offboarding Policy',         category: 'GENERAL',          type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Health_Insurance:      { title: 'Health Insurance Policy',           category: 'COMPENSATION',     type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Internal_Job_Posting:  { title: 'Internal Job Posting Policy',       category: 'GENERAL',          type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  IT_Acceptable_Use:     { title: 'IT Acceptable Use Policy',          category: 'IT',               type: 'HR_POLICY',       audience: 'ALL',     requiresAck: true  },
  Learning_Development:  { title: 'Learning & Development Policy',     category: 'GENERAL',          type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Leave_Policy:          { title: 'Leave Policy',                      category: 'LEAVE',            type: 'LEAVE_POLICY',    audience: 'ALL',     requiresAck: true  },
  Long_Service:          { title: 'Long Service Rewards Policy',       category: 'COMPENSATION',     type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Moonlighting:          { title: 'Moonlighting Policy',               category: 'CODE_OF_CONDUCT',  type: 'CODE_OF_CONDUCT', audience: 'ALL',     requiresAck: true  },
  NDA:                   { title: 'Non-Disclosure Agreement',          category: 'SECURITY',         type: 'NDA_TEMPLATE',    audience: 'ALL',     requiresAck: true  },
  Performance_Appraisal: { title: 'Performance Appraisal & KPI Policy',category: 'GENERAL',          type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Probation_Confirmation:{ title: 'Probation & Confirmation Policy',   category: 'GENERAL',          type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Provident_Fund:        { title: 'Provident Fund & Gratuity Policy',  category: 'COMPENSATION',     type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Retention_Bonus:       { title: 'Retention Bonus Policy',            category: 'COMPENSATION',     type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Rewards_Recognition:   { title: 'Rewards & Recognition Policy',      category: 'COMPENSATION',     type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Travel_Expense:        { title: 'Travel & Expense Policy',           category: 'GENERAL',          type: 'HR_POLICY',       audience: 'ALL',     requiresAck: false },
  Whistleblower:         { title: 'Whistleblower Policy',              category: 'CODE_OF_CONDUCT',  type: 'CODE_OF_CONDUCT', audience: 'ALL',     requiresAck: true  },
}

// Resolve a filename to its meta entry by looking for the key as a substring.
function resolveMeta(filename) {
  const bare = filename.replace(/^Convertt[_\s\-]*/i, '').replace(/\.docx$/i, '')
  for (const key of Object.keys(POLICY_META)) {
    if (bare.toLowerCase().includes(key.toLowerCase())) return POLICY_META[key]
  }
  // Fallback: prettify the filename
  return {
    title: bare.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim(),
    category: 'GENERAL',
    type: 'HR_POLICY',
    audience: 'ALL',
    requiresAck: false,
  }
}

async function main() {
  const p = new PrismaClient()

  // Wake Neon (cross-Pacific suspension)
  for (let i = 1; i <= 10; i++) {
    try { await p.$queryRaw`SELECT 1`; break }
    catch (e) {
      if (i === 10) throw e
      console.log(`Waking Neon… ${i}/10`)
      await new Promise((r) => setTimeout(r, 4000))
    }
  }

  const all = fs.readdirSync(DOCS_DIR).filter((f) => /\.docx$/i.test(f) && !/^~\$/.test(f))
  console.log(`Found ${all.length} .docx files in ${DOCS_DIR}`)

  let created = 0, updated = 0, skipped = 0
  const issues = []

  for (const filename of all) {
    const full = path.join(DOCS_DIR, filename)
    let text
    try {
      const result = await mammoth.extractRawText({ path: full })
      text = (result.value || '').trim()
    } catch (e) {
      issues.push(`${filename}: extract failed — ${e.message}`)
      skipped++
      continue
    }

    if (!text) {
      issues.push(`${filename}: empty text after extract`)
      skipped++
      continue
    }

    const meta = resolveMeta(filename)
    const description = text.split('\n').slice(0, 3).join(' · ').slice(0, 280)

    // Upsert by title (titles are unique enough)
    const existing = await p.policyDocument.findFirst({ where: { title: meta.title } })

    if (existing) {
      await p.policyDocument.update({
        where: { id: existing.id },
        data: {
          content: text,
          description,
          category: meta.category,
          type: meta.type,
          audience: meta.audience,
          requiresAck: meta.requiresAck,
          status: existing.status === 'DRAFT' ? 'PUBLISHED' : existing.status,
          publishedAt: existing.publishedAt ?? new Date(),
          effectiveDate: existing.effectiveDate ?? new Date(),
        },
      })
      updated++
      console.log(`  ✓ updated: ${meta.title}`)
    } else {
      await p.policyDocument.create({
        data: {
          title: meta.title,
          content: text,
          description,
          category: meta.category,
          type: meta.type,
          audience: meta.audience,
          requiresAck: meta.requiresAck,
          version: '1.0',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          effectiveDate: new Date(),
        },
      })
      created++
      console.log(`  ✓ created: ${meta.title}`)
    }
  }

  console.log('\n' + JSON.stringify({ created, updated, skipped, issues }, null, 2))
  await p.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
