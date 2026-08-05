/**
 * Ali Hassan and Muhammad Hassan both carried the same SadaPay IBAN.
 *
 * It was never real. Both are Faysal, and their Faysal IBANs differ —
 * ...011144 and ...011676 — so this was a stale value copied onto two records,
 * with bankName holding the code SADAP rather than a bank name. Left alone it
 * would eventually have paid one of them into an account belonging to neither.
 *
 * The Faysal IBAN is the salary account, so bankAccount takes it.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const isFaysal = (v) => /^PK\d{2}FAYS/.test((v ?? '').replace(/\s/g, '').toUpperCase())

;(async () => {
  const rows = await p.employee.findMany({
    where: { bankAccount: { contains: 'SADA' } },
    select: { id: true, employeeCode: true, fullName: true, bankAccount: true, ibanAccount: true },
    orderBy: { fullName: 'asc' },
  })

  let fixed = 0
  for (const r of rows) {
    // Only where a Faysal IBAN is on file to move across. Anyone genuinely
    // banking with SadaPay is left exactly as they are.
    if (!isFaysal(r.ibanAccount)) {
      console.log(`${r.fullName} — no Faysal IBAN on file, left alone`)
      continue
    }
    console.log((APPLY ? 'FIX  ' : 'would fix ')
      + `${r.employeeCode.padEnd(14)} ${r.fullName.padEnd(22)} ${r.bankAccount} -> ${r.ibanAccount}`)
    fixed++
    if (APPLY) {
      await p.employee.update({
        where: { id: r.id },
        data: { bankAccount: r.ibanAccount, bankName: 'Faysal Bank', bankCode: 'FBL' },
      })
    }
  }

  console.log(`\n${rows.length} carrying a SadaPay IBAN, ${fixed} ${APPLY ? 'corrected' : 'to correct'}.`)
  if (!APPLY && fixed) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
