/**
 * The April 2026 promotions, from the certificates Syed Khawer signed.
 *
 * Straight off "Atta Ur Rehman (1).pdf", which carries three certificates:
 *
 *   Atta Ur Rehman   Team Lead → Head of Client Servicing & Operations
 *   Momna Waryam     Associate Team Lead → Team Lead
 *   Usman Saeed      a Certificate of *Appreciation*, not a promotion
 *
 * All dated 30-04-2026. Usman's is deliberately not in the list below: his
 * certificate recognises performance rather than a change of role, and his
 * promotion letter is already in the system. Recording an appreciation as a
 * promotion would put a job change in his history that never happened.
 *
 * Each promotion writes two things — the letter, which uses the PROMOTION
 * template already in letter-templates.ts, and a CompensationHistory row of
 * type PROMOTION so it shows in the increment history rather than only as a
 * document.
 *
 * Dry run by default. Pass --apply to write.
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { PrismaClient } from '@prisma/client'
import { generateLetter } from '../src/lib/letter-templates'

const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const EFFECTIVE = new Date(Date.UTC(2026, 3, 30))   // 30 April 2026

interface Promotion {
  name: string
  from: string
  to: string
}

const PROMOTIONS: Promotion[] = [
  {
    name: 'Atta Ur Rehman',
    from: 'Team Lead',
    to: 'Head of Client Servicing & Operations',
  },
  {
    name: 'Momna Waryam Khan',
    from: 'Associate Team Lead',
    to: 'Team Lead',
  },
]

;(async () => {
  for (const promo of PROMOTIONS) {
    const emp = await p.employee.findFirst({
      where: { fullName: { contains: promo.name.split(' ')[0], mode: 'insensitive' } },
      select: { id: true, fullName: true, designation: true, joiningDate: true,
                employeeCode: true },
    })
    if (!emp) { console.log(`  ! no employee matching "${promo.name}"`); continue }

    const already = await p.letterRequest.findFirst({
      where: { employeeId: emp.id, letterType: 'PROMOTION' },
      select: { id: true },
    })
    if (already) {
      console.log(`  = ${emp.fullName} already has a promotion letter`)
      continue
    }

    console.log(`${APPLY ? 'ADD ' : 'would add'}  ${emp.fullName.padEnd(24)} `
      + `${promo.from} → ${promo.to}`)
    console.log(`          designation on file: ${emp.designation ?? '(none)'}`)

    if (!APPLY) continue

    // LetterRequest has no promotion columns — those live on the template's
    // input type, not the model — so the letter is generated here and the
    // finished text is stored on the row.
    const signedBy = { name: 'Syed Khawer', title: 'Director Administration' }
    const letter = generateLetter(
      'PROMOTION',
      { fullName: emp.fullName, designation: promo.to, joiningDate: emp.joiningDate,
        employeeCode: emp.employeeCode },
      { letterType: 'PROMOTION',
        promotionFromDesignation: promo.from,
        promotionToDesignation: promo.to,
        promotionEffectiveDate: EFFECTIVE },
      signedBy,
    )
    await p.letterRequest.create({
      data: {
        employeeId: emp.id,
        letterType: 'PROMOTION',
        status: 'GENERATED',
        signedByName: signedBy.name,
        signedByTitle: signedBy.title,
        letterBody: letter.body,
        purpose: `Promoted from ${promo.from} to ${promo.to}, effective 30 April 2026, `
          + 'per the certificate signed by Syed Khawer, Director Administration.',
      },
    })

    // The same fact as a compensation event, so it reaches the increment
    // history. Salary is unchanged here because the certificates state a
    // change of role and no figure.
    const salary = await p.salary.findUnique({ where: { employeeId: emp.id } })
    const gross = salary
      ? salary.basic + salary.houseRent + salary.utilities + salary.food
        + salary.fuel + salary.medicalAllowance + salary.otherAllowance
      : 0
    const dupe = await p.compensationHistory.findFirst({
      where: { employeeId: emp.id, type: 'PROMOTION', effectiveDate: EFFECTIVE },
      select: { id: true },
    })
    if (!dupe) {
      await p.compensationHistory.create({
        data: {
          employeeId: emp.id,
          type: 'PROMOTION',
          oldSalary: gross,
          newSalary: gross,
          effectiveDate: EFFECTIVE,
          reason: `Promoted from ${promo.from} to ${promo.to}.`,
          notes: 'Role change recorded from the promotion certificate. The certificate '
            + 'states no salary figure, so pay is carried across unchanged — correct it '
            + 'here if a raise went with it.',
        },
      })
    }

    // And the designation itself, which is what the rest of the app reads.
    if (emp.designation !== promo.to) {
      await p.employee.update({
        where: { id: emp.id },
        data: { designation: promo.to },
      })
      console.log(`          designation updated → ${promo.to}`)
    }
  }

  if (!APPLY) console.log('\nDry run. Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
