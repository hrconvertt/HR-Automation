/**
 * Reconcile salary breakdowns to match April 2026 amounts from increments file.
 *  - If slip total == Apr 2026 total → keep slip breakdown as-is
 *  - If slip total != Apr 2026 total → scale slip breakdown proportionally to match Apr 2026
 *  - If no slip available → use Apr 2026 as basic only
 *
 * Run: node scripts/reconcile-salaries.cjs
 */
const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const SLIPS_PATH = path.join(__dirname, 'salary-slips.json')
const INCREMENTS_PATH = 'C:\\Users\\HRConvertt\\Downloads\\Performance Rewards_ Increments_.xlsx'

function normalize(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '') }
function similarity(a, b) {
  const na = normalize(a), nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.95
  const aB = new Set(), bB = new Set()
  for (let i = 0; i < na.length - 1; i++) aB.add(na.slice(i, i + 2))
  for (let i = 0; i < nb.length - 1; i++) bB.add(nb.slice(i, i + 2))
  let c = 0
  for (const g of aB) if (bB.has(g)) c++
  return (2 * c) / (aB.size + bB.size)
}

async function main() {
  const slips = JSON.parse(fs.readFileSync(SLIPS_PATH, 'utf-8'))

  // Read increments file → get April 2026 (rightmost column) total per name
  const wb = XLSX.readFile(INCREMENTS_PATH)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['IncrementsBonus'], { header: 1 })
  const hdr = rows[0]
  const monthCols = []
  for (let i = 1; i < hdr.length; i += 2) {
    if (typeof hdr[i] === 'number') monthCols.push(i)
  }
  const aprCol = monthCols[monthCols.length - 1] // last col = April 2026

  const aprByName = new Map()
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !r[0]) continue
    const val = r[aprCol]
    if (typeof val === 'number' && val > 0) {
      aprByName.set(String(r[0]).trim(), val)
    } else {
      // Fall back to latest non-empty if April is empty
      let latest = null
      for (const idx of monthCols) {
        if (typeof r[idx] === 'number' && r[idx] > 0) latest = r[idx]
      }
      if (latest) aprByName.set(String(r[0]).trim(), latest)
    }
  }

  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, employeeCode: true, fullName: true },
  })

  // Build a map: employee → matching increment amount (by name)
  function matchAprForEmployee(empName) {
    let best = null
    for (const [name, amount] of aprByName.entries()) {
      const s = similarity(name, empName)
      if (s >= 0.7 && (!best || s > best.s)) best = { name, amount, s }
    }
    return best
  }

  // Build a map: employee → matching slip
  function matchSlipForEmployee(empName) {
    let best = null
    for (const slip of slips) {
      const s = similarity(slip.name, empName)
      if (s >= 0.7 && (!best || s > best.s)) best = { slip, s }
    }
    return best ? best.slip : null
  }

  let scaled = 0
  let kept = 0
  let basicOnly = 0

  for (const emp of employees) {
    const apr = matchAprForEmployee(emp.fullName)
    const slip = matchSlipForEmployee(emp.fullName)

    if (!apr && !slip) continue

    if (slip && apr) {
      const slipTotal = slip.basic + slip.houseRent + slip.utilities + slip.food + slip.fuel + (slip.otBonus||0) + (slip.arrears||0) + (slip.other||0) + (slip.monthly||0)
      const aprTotal = apr.amount

      if (Math.abs(slipTotal - aprTotal) < 1) {
        // Match: keep breakdown
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
            otherAllowance: (slip.otBonus||0) + (slip.arrears||0) + (slip.other||0) + (slip.monthly||0),
            effectiveFrom: new Date('2026-04-01'),
          },
          update: {
            basic: slip.basic, houseRent: slip.houseRent, utilities: slip.utilities,
            food: slip.food, fuel: slip.fuel,
            otherAllowance: (slip.otBonus||0) + (slip.arrears||0) + (slip.other||0) + (slip.monthly||0),
          },
        })
        console.log(`  ✓  ${emp.employeeCode.padEnd(15)} | ${emp.fullName.padEnd(26)} | Slip=Apr2026 PKR ${aprTotal.toLocaleString()}`)
        kept++
      } else {
        // Scale slip breakdown to match Apr 2026 total
        const ratio = aprTotal / slipTotal
        const newBasic = Math.round(slip.basic * ratio)
        const newHR    = Math.round(slip.houseRent * ratio)
        const newUtil  = Math.round(slip.utilities * ratio)
        const newFood  = Math.round(slip.food * ratio)
        const newFuel  = Math.round(slip.fuel * ratio)
        const otherRaw = ((slip.otBonus||0) + (slip.arrears||0) + (slip.other||0) + (slip.monthly||0)) * ratio
        // Adjust 'other' to absorb any rounding error so the total matches exactly
        const scaledSum = newBasic + newHR + newUtil + newFood + newFuel
        const newOther = Math.max(0, Math.round(aprTotal - scaledSum))

        await prisma.salary.upsert({
          where: { employeeId: emp.id },
          create: {
            employeeId: emp.id,
            basic: newBasic, houseRent: newHR, utilities: newUtil, food: newFood, fuel: newFuel,
            medicalAllowance: 0, otherAllowance: newOther,
            effectiveFrom: new Date('2026-04-01'),
          },
          update: {
            basic: newBasic, houseRent: newHR, utilities: newUtil, food: newFood, fuel: newFuel, otherAllowance: newOther,
          },
        })
        console.log(`  ⚙️ ${emp.employeeCode.padEnd(15)} | ${emp.fullName.padEnd(26)} | scaled ${slipTotal.toLocaleString()} → ${aprTotal.toLocaleString()}`)
        scaled++
      }
    } else if (apr && !slip) {
      // No slip — basic only
      await prisma.salary.upsert({
        where: { employeeId: emp.id },
        create: {
          employeeId: emp.id,
          basic: apr.amount,
          houseRent: 0, utilities: 0, food: 0, fuel: 0, medicalAllowance: 0, otherAllowance: 0,
          effectiveFrom: new Date('2026-04-01'),
        },
        update: { basic: apr.amount, houseRent: 0, utilities: 0, food: 0, fuel: 0, otherAllowance: 0 },
      })
      console.log(`  📋 ${emp.employeeCode.padEnd(15)} | ${emp.fullName.padEnd(26)} | basic-only PKR ${apr.amount.toLocaleString()}`)
      basicOnly++
    }
  }

  console.log(`\n📊 Summary`)
  console.log(`   Slip matched Apr 2026 (kept):   ${kept}`)
  console.log(`   Slip scaled to Apr 2026:        ${scaled}`)
  console.log(`   Apr 2026 only (basic only):     ${basicOnly}`)

  const all = await prisma.salary.findMany({
    where: { employee: { status: 'ACTIVE' } },
    include: { employee: { select: { employeeCode: true, fullName: true } } },
  })
  const total = all.reduce((s, r) =>
    s + r.basic + r.houseRent + r.utilities + r.food + r.fuel + r.medicalAllowance + r.otherAllowance, 0)
  console.log(`\n🏁 Combined monthly gross: PKR ${total.toLocaleString()} across ${all.length} active employees`)

  await prisma.$disconnect()
}

main().catch((e) => { console.error('Failed:', e); process.exit(1) })
