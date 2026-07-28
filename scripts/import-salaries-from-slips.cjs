/**
 * Import salary data from the parsed salary slips into the Salary table.
 * Matches each slip to an employee using code first, then fuzzy name match.
 *
 * Prereq: run `node scripts/parse-salary-slips.cjs` first to generate salary-slips.json
 * Then:    node scripts/import-salaries-from-slips.cjs
 */
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const SLIPS_PATH = path.join(__dirname, 'salary-slips.json')

function normalize(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function similarity(a, b) {
  // Simple bigram similarity score
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const aBigrams = new Set()
  const bBigrams = new Set()
  for (let i = 0; i < na.length - 1; i++) aBigrams.add(na.slice(i, i + 2))
  for (let i = 0; i < nb.length - 1; i++) bBigrams.add(nb.slice(i, i + 2))
  let common = 0
  for (const g of aBigrams) if (bBigrams.has(g)) common++
  return (2 * common) / (aBigrams.size + bBigrams.size)
}

async function main() {
  const slips = JSON.parse(fs.readFileSync(SLIPS_PATH, 'utf-8'))
  console.log(`📄 Loaded ${slips.length} slips from ${SLIPS_PATH}\n`)

  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, fullName: true, status: true },
  })
  console.log(`👥 Found ${employees.length} employees in DB\n`)

  const empByCode = new Map(employees.map((e) => [e.employeeCode, e]))

  let imported = 0
  let conflicts = []
  let unmatched = []
  const matchedEmpIds = new Set()

  for (const slip of slips) {
    let emp = empByCode.get(slip.code)

    // Verify name matches if code matched
    if (emp) {
      const sim = similarity(emp.fullName, slip.name)
      if (sim < 0.6) {
        // Code matched but name is very different → fuzzy match by name instead
        const byName = employees
          .map((e) => ({ e, s: similarity(e.fullName, slip.name) }))
          .filter((x) => x.s >= 0.7)
          .sort((a, b) => b.s - a.s)[0]
        if (byName) {
          conflicts.push({
            slipCode: slip.code,
            slipName: slip.name,
            codeMatchedTo: emp.fullName,
            nameMatchedTo: byName.e.fullName,
            usedCode: byName.e.employeeCode,
            similarity: byName.s.toFixed(2),
          })
          emp = byName.e
        }
      }
    } else {
      // Code not found — fuzzy match by name
      const byName = employees
        .map((e) => ({ e, s: similarity(e.fullName, slip.name) }))
        .filter((x) => x.s >= 0.7)
        .sort((a, b) => b.s - a.s)[0]
      if (byName) {
        conflicts.push({
          slipCode: slip.code,
          slipName: slip.name,
          codeMatchedTo: '(not in DB)',
          nameMatchedTo: byName.e.fullName,
          usedCode: byName.e.employeeCode,
          similarity: byName.s.toFixed(2),
        })
        emp = byName.e
      }
    }

    if (!emp) {
      unmatched.push({ code: slip.code, name: slip.name })
      continue
    }

    // Don't re-match the same employee twice
    if (matchedEmpIds.has(emp.id)) {
      console.log(`  ⚠️  Skipping duplicate slip for ${emp.employeeCode} (${emp.fullName})`)
      continue
    }
    matchedEmpIds.add(emp.id)

    // Upsert Salary record
    await prisma.salary.upsert({
      where: { employeeId: emp.id },
      create: {
        employeeId: emp.id,
        basic: slip.basic,
        houseRent: slip.houseRent,
        utilities: slip.utilities,
        food: slip.food,
        fuel: slip.fuel,
        medicalAllowance: 0,
        otherAllowance: slip.other + slip.monthly,
        effectiveFrom: new Date('2025-11-01'),
      },
      update: {
        basic: slip.basic,
        houseRent: slip.houseRent,
        utilities: slip.utilities,
        food: slip.food,
        fuel: slip.fuel,
        otherAllowance: slip.other + slip.monthly,
      },
    })

    const gross = slip.basic + slip.houseRent + slip.utilities + slip.food + slip.fuel + slip.other + slip.monthly
    console.log(`  ✅ ${emp.employeeCode.padEnd(15)} | ${emp.fullName.padEnd(28)} | Basic: ${slip.basic.toString().padStart(7)} | Gross: ${gross.toString().padStart(7)}`)
    imported++
  }

  console.log(`\n📊 Summary`)
  console.log(`   Imported:  ${imported}`)
  console.log(`   Conflicts: ${conflicts.length}`)
  console.log(`   Unmatched: ${unmatched.length}`)

  if (conflicts.length > 0) {
    console.log(`\n⚠️  Code/Name conflicts (resolved by name match):`)
    conflicts.forEach((c) => {
      console.log(`     Slip says ${c.slipCode} (${c.slipName})`)
      console.log(`     → Code in DB = ${c.codeMatchedTo}`)
      console.log(`     → Name matched: ${c.nameMatchedTo} = ${c.usedCode}  (sim: ${c.similarity})`)
    })
  }

  if (unmatched.length > 0) {
    console.log(`\n❌ Slips with NO match in DB:`)
    unmatched.forEach((u) => console.log(`     ${u.code} — ${u.name}`))
  }

  // Show employees without salary
  const withSalary = await prisma.employee.count({ where: { salary: { isNot: null }, status: 'ACTIVE' } })
  const totalActive = await prisma.employee.count({ where: { status: 'ACTIVE' } })
  console.log(`\n🏁 ${withSalary}/${totalActive} active employees now have salary records`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('Import failed:', e)
  process.exit(1)
})
