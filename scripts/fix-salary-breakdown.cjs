/**
 * Fix salary breakdowns:
 *   - Employees WITH a slip → use the slip's full breakdown (Basic, HR, Util, Food, Fuel, etc.)
 *   - Employees WITHOUT a slip → use the latest amount from increments file as "basic" only
 *
 * Reads:
 *   scripts/salary-slips.json (parsed from PDF earlier)
 *   Performance Rewards / Increments Excel
 *
 * Run: node scripts/fix-salary-breakdown.cjs
 */
const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const SLIPS_PATH = path.join(__dirname, 'salary-slips.json')
const INCREMENTS_PATH = 'C:\\Users\\HRConvertt\\Downloads\\Performance Rewards_ Increments_.xlsx'

function normalize(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}
function similarity(a, b) {
  const na = normalize(a), nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.95
  const aB = new Set(), bB = new Set()
  for (let i = 0; i < na.length - 1; i++) aB.add(na.slice(i, i + 2))
  for (let i = 0; i < nb.length - 1; i++) bB.add(nb.slice(i, i + 2))
  let common = 0
  for (const g of aB) if (bB.has(g)) common++
  return (2 * common) / (aB.size + bB.size)
}
function excelDate(s) { return new Date(Math.floor(s - 25569) * 86400 * 1000) }

async function main() {
  console.log('🔧 Fixing salary breakdowns\n')

  // ─── 1. Read salary slips (breakdown source) ──────────────────────────────
  const slips = JSON.parse(fs.readFileSync(SLIPS_PATH, 'utf-8'))
  console.log(`📄 Loaded ${slips.length} slips with breakdowns`)

  // ─── 2. Read increments (latest TOTAL amount) ─────────────────────────────
  const wb = XLSX.readFile(INCREMENTS_PATH)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['IncrementsBonus'], { header: 1 })
  const hdr = rows[0]
  const monthCols = []
  for (let i = 1; i < hdr.length; i += 2) {
    if (typeof hdr[i] === 'number') {
      monthCols.push({ salaryIdx: i, date: excelDate(hdr[i]) })
    }
  }
  const incrementsByName = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !r[0]) continue
    let latest = null
    for (const mc of monthCols) {
      if (typeof r[mc.salaryIdx] === 'number' && r[mc.salaryIdx] > 0) latest = r[mc.salaryIdx]
    }
    if (latest) incrementsByName.push({ name: String(r[0]).trim(), latest })
  }
  console.log(`💰 Loaded ${incrementsByName.length} latest-salary entries from increments\n`)

  // ─── 3. Load employees ────────────────────────────────────────────────────
  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, fullName: true, status: true },
  })

  let updatedFromSlip = 0
  let updatedFromIncrements = 0
  const slipMatched = new Set()

  // ─── 4. First pass: SLIP-based breakdown (most accurate) ──────────────────
  console.log('Phase 1: Slip-based breakdowns')
  for (const slip of slips) {
    // Match by name (code in slips can be wrong like CON-WBS-006 twice)
    const cand = employees
      .map(e => ({ e, s: similarity(e.fullName, slip.name) }))
      .filter(x => x.s >= 0.7)
      .sort((a, b) => b.s - a.s)[0]
    if (!cand || slipMatched.has(cand.e.id)) continue
    slipMatched.add(cand.e.id)

    // Combine OT/Bonus + Arrears + Other + Monthly Allowance into otherAllowance
    const extras = (slip.otBonus || 0) + (slip.arrears || 0) + (slip.other || 0) + (slip.monthly || 0)

    await prisma.salary.upsert({
      where: { employeeId: cand.e.id },
      create: {
        employeeId: cand.e.id,
        basic: slip.basic,
        houseRent: slip.houseRent,
        utilities: slip.utilities,
        food: slip.food,
        fuel: slip.fuel,
        medicalAllowance: 0,
        otherAllowance: extras,
        effectiveFrom: new Date('2025-11-01'),
      },
      update: {
        basic: slip.basic,
        houseRent: slip.houseRent,
        utilities: slip.utilities,
        food: slip.food,
        fuel: slip.fuel,
        otherAllowance: extras,
      },
    })
    const total = slip.basic + slip.houseRent + slip.utilities + slip.food + slip.fuel + extras
    console.log(`  ✅ ${cand.e.employeeCode.padEnd(15)} | ${cand.e.fullName.padEnd(26)} | Slip total: PKR ${total.toLocaleString()}`)
    updatedFromSlip++
  }

  // ─── 5. Second pass: For employees NOT matched by slip but in increments ──
  console.log('\nPhase 2: Increments fallback (no slip available)')
  for (const inc of incrementsByName) {
    const cand = employees
      .map(e => ({ e, s: similarity(e.fullName, inc.name) }))
      .filter(x => x.s >= 0.65)
      .sort((a, b) => b.s - a.s)[0]
    if (!cand) continue
    if (slipMatched.has(cand.e.id)) continue   // already handled by slip
    if (cand.e.status !== 'ACTIVE') continue   // skip terminated/resigned

    await prisma.salary.upsert({
      where: { employeeId: cand.e.id },
      create: {
        employeeId: cand.e.id,
        basic: inc.latest,
        houseRent: 0, utilities: 0, food: 0, fuel: 0,
        medicalAllowance: 0, otherAllowance: 0,
        effectiveFrom: new Date('2025-11-01'),
      },
      update: {
        basic: inc.latest,
        houseRent: 0, utilities: 0, food: 0, fuel: 0,
        medicalAllowance: 0, otherAllowance: 0,
      },
    })
    console.log(`  ✅ ${cand.e.employeeCode.padEnd(15)} | ${cand.e.fullName.padEnd(26)} | Basic only: PKR ${inc.latest.toLocaleString()} (no slip)`)
    updatedFromIncrements++
  }

  console.log(`\n📊 Summary`)
  console.log(`   From slips (full breakdown):     ${updatedFromSlip}`)
  console.log(`   From increments (basic only):    ${updatedFromIncrements}`)

  // Verify totals
  const activeWithSalary = await prisma.salary.findMany({
    where: { employee: { status: 'ACTIVE' } },
    include: { employee: { select: { employeeCode: true, fullName: true } } },
  })
  const totalGross = activeWithSalary.reduce((sum, s) =>
    sum + s.basic + s.houseRent + s.utilities + s.food + s.fuel + s.medicalAllowance + s.otherAllowance, 0)
  console.log(`\n🏁 Combined monthly cost (gross): PKR ${totalGross.toLocaleString()} across ${activeWithSalary.length} active employees`)

  await prisma.$disconnect()
}

main().catch((e) => { console.error('Failed:', e); process.exit(1) })
