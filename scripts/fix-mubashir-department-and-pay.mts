/**
 * Put Muhammad Mubashir in the right department, on the right code, on pay.
 *
 *   npx tsx scripts/fix-mubashir-department-and-pay.mts           # dry run
 *   npx tsx scripts/fix-mubashir-department-and-pay.mts --apply
 *
 * Three corrections, all confirmed by HR:
 *
 *   Department  the QA Engineer requisition carries no department, so the hire
 *               fell into Web - Shopify. Quality Assurance is created and he
 *               moves into it, and the requisition is pointed at it too so the
 *               next QA hire does not repeat this.
 *   Code        CON-WBS-037 was issued by the old per-department numbering and
 *               collides with the serial Muhammad Salman Shahid already holds.
 *               Re-issued from the company-wide sequence.
 *   Salary      PKR 65,000 gross, split 2% utilities and the rest basic — the
 *               convention every compensation entry uses.
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '@prisma/client'
import { splitGross } from '../src/lib/pay-split'

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

const GROSS = 65_000
const JOINING = new Date(Date.UTC(2026, 7, 24))

async function main() {
  const emp = await prisma.employee.findFirst({
    where: { fullName: 'Muhammad Mubashir' },
    include: { department: true, salary: true },
  })
  if (!emp) throw new Error('Muhammad Mubashir not found')

  // The next company-wide serial, the same rule the hire path now uses.
  const all = await prisma.employee.findMany({ select: { employeeCode: true } })
  let maxN = 0
  for (const e of all) {
    const m = e.employeeCode?.match(/^CON-[A-Z]+-(\d+)$/)
    if (!m) continue
    // His own wrong code must not set the ceiling.
    if (e.employeeCode === emp.employeeCode) continue
    const n = parseInt(m[1], 10)
    if (Number.isFinite(n) && n > maxN) maxN = n
  }
  const newCode = `CON-QA-${String(maxN + 1).padStart(3, '0')}`
  const split = splitGross(GROSS)

  console.log(`Employee    ${emp.fullName}`)
  console.log(`Department  ${emp.department?.name ?? '—'}  ->  Quality Assurance (QA)`)
  console.log(`Code        ${emp.employeeCode}  ->  ${newCode}`)
  console.log(`Salary      ${emp.salary ? 'existing row' : 'none'}  ->  gross ${GROSS.toLocaleString('en-PK')}`)
  console.log(`            basic ${split.basic.toLocaleString('en-PK')} · utilities ${split.utilities.toLocaleString('en-PK')} (2%)`)
  console.log(`Effective   ${JOINING.toISOString().slice(0, 10)}\n`)

  if (!apply) {
    console.log('DRY RUN — nothing written. Re-run with --apply.')
    return
  }

  const dept = await prisma.department.upsert({
    where: { code: 'QA' },
    update: {},
    create: { code: 'QA', name: 'Quality Assurance' },
  })
  console.log(`Department ${dept.name} ready`)

  await prisma.employee.update({
    where: { id: emp.id },
    data: { employeeCode: newCode, departmentId: dept.id },
  })
  console.log(`Employee moved and re-coded ${newCode}`)

  // Point the requisition at QA too, so the next QA hire lands correctly.
  const req = await prisma.jobRequisition.findFirst({
    where: { title: { contains: 'QA', mode: 'insensitive' } },
    select: { id: true, departmentId: true },
  })
  if (req && !req.departmentId) {
    await prisma.jobRequisition.update({ where: { id: req.id }, data: { departmentId: dept.id } })
    console.log('QA requisition pointed at Quality Assurance')
  }

  await prisma.salary.upsert({
    where: { employeeId: emp.id },
    update: {
      basic: split.basic, utilities: split.utilities,
      houseRent: 0, food: 0, fuel: 0, medicalAllowance: 0, otherAllowance: 0,
      effectiveFrom: JOINING,
    },
    create: {
      employeeId: emp.id,
      basic: split.basic, utilities: split.utilities,
      effectiveFrom: JOINING,
    },
  })
  console.log('Salary written')

  const hasHistory = await prisma.compensationHistory.count({ where: { employeeId: emp.id } })
  if (hasHistory === 0) {
    await prisma.compensationHistory.create({
      data: {
        employeeId: emp.id,
        effectiveDate: JOINING,
        type: 'NEW_HIRE',
        oldSalary: 0,
        newSalary: GROSS,
        reason: 'Starting salary on joining',
      },
    })
    console.log('Compensation history opened')
  }

  const check = await prisma.employee.findUnique({
    where: { id: emp.id },
    include: { department: true, salary: true },
  })
  console.log(`\n  ${check?.employeeCode} · ${check?.designation} · ${check?.department?.name}`)
  console.log(`  gross ${((check?.salary?.basic ?? 0) + (check?.salary?.utilities ?? 0)).toLocaleString('en-PK')}`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
