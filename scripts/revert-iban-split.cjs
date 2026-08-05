/**
 * Put the IBANs back in the account-number field.
 *
 * Earlier today I split `bankAccount` into a bare account number derived from
 * the IBAN, on the reasoning that the two are different things. They are, but
 * Convertt does not hold a bare account number for anyone — every value on
 * file is an IBAN, and the issued salary slip prints the IBAN under "Account
 * Number". Deriving a number nobody uses made the field less useful, not more.
 *
 * Only rows the split actually changed are touched: `bankAccount` holding
 * something that is not an IBAN, alongside an `ibanAccount` that is. The seven
 * people carrying two genuinely different IBANs — a Faysal one and one at
 * another bank — were never split and are left alone here too.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const clean = (v) => (v ?? '').replace(/[\s-]/g, '').toUpperCase()
const isIban = (v) => /^PK\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(clean(v))

;(async () => {
  const emps = await p.employee.findMany({
    where: { NOT: { ibanAccount: null } },
    select: {
      id: true, employeeCode: true, fullName: true,
      bankAccount: true, ibanAccount: true,
    },
    orderBy: { fullName: 'asc' },
  })

  let restored = 0
  const untouched = []

  for (const e of emps) {
    if (!isIban(e.ibanAccount)) continue

    if (isIban(e.bankAccount)) {
      // Two IBANs on file. Not something the split created, so not something to
      // undo — it still needs a person to say which account is the salary one.
      if (clean(e.bankAccount) !== clean(e.ibanAccount)) {
        untouched.push(`${e.employeeCode.padEnd(14)} ${e.fullName.padEnd(24)} `
          + `${clean(e.bankAccount)}  vs  ${clean(e.ibanAccount)}`)
      }
      continue
    }

    console.log((APPLY ? 'RESTORE  ' : 'would restore ')
      + `${e.employeeCode.padEnd(14)} ${e.fullName.padEnd(24)} `
      + `${e.bankAccount ?? '—'}  ->  ${clean(e.ibanAccount)}`)
    restored++
    if (APPLY) {
      await p.employee.update({
        where: { id: e.id },
        data: { bankAccount: clean(e.ibanAccount) },
      })
    }
  }

  if (untouched.length) {
    console.log('\nTwo different IBANs on file — untouched, still needs a decision:')
    untouched.forEach((u) => console.log('  ' + u))
  }

  console.log(`\n${restored} ${APPLY ? 'restored' : 'to restore'}, ${untouched.length} needing a decision.`)
  if (!APPLY && restored) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
