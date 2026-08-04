/**
 * Separate the IBAN from the account number.
 *
 * `bankAccount` is meant to hold the account number a bank would quote you.
 * Most rows hold an IBAN instead, because that is what the IBFT sheets carry
 * and that is what got imported — so the profile shows the same kind of value
 * twice under two different labels, and for some people the two disagree.
 *
 * A Pakistani IBAN is PK + 2 check digits + a 4-letter bank code + 16
 * characters, 24 in total, and those last 16 are the account number with
 * leading zeros padding it out. So the two are not competing facts: one
 * contains the other, and the account number can be recovered rather than
 * guessed.
 *
 * Where the two IBANs genuinely differ, nothing is touched — that is two
 * different accounts and only a human knows which is current.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const clean = (v) => (v ?? '').replace(/[\s-]/g, '').toUpperCase()
const isIban = (v) => /^PK\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(clean(v))
/** The last 16 characters of an IBAN are the account number, zero-padded. */
const accountFromIban = (v) => clean(v).slice(8).replace(/^0+/, '') || clean(v).slice(8)

;(async () => {
  const emps = await p.employee.findMany({
    where: { OR: [{ NOT: { bankAccount: null } }, { NOT: { ibanAccount: null } }] },
    select: {
      id: true, employeeCode: true, fullName: true,
      bankAccount: true, ibanAccount: true,
    },
    orderBy: { fullName: 'asc' },
  })

  let fixed = 0
  const conflicts = []

  for (const e of emps) {
    const acct = e.bankAccount
    const iban = e.ibanAccount
    const data = {}

    if (isIban(acct)) {
      if (iban && isIban(iban) && clean(iban) !== clean(acct)) {
        // Two different IBANs. Not a formatting problem — two accounts.
        conflicts.push(`${e.employeeCode.padEnd(14)} ${e.fullName.padEnd(24)} account# ${clean(acct)}  vs  IBAN ${clean(iban)}`)
        continue
      }
      if (!iban) data.ibanAccount = clean(acct)
      data.bankAccount = accountFromIban(acct)
    } else if (!acct && isIban(iban)) {
      // IBAN on file, account number never filled in — it is inside the IBAN.
      data.bankAccount = accountFromIban(iban)
    }

    if (!Object.keys(data).length) continue
    fixed++
    console.log(
      (APPLY ? 'FIX  ' : 'would fix ') + `${e.employeeCode.padEnd(14)} ${e.fullName.padEnd(24)}`
      + ` account# ${data.bankAccount ?? '(unchanged)'}`
      + (data.ibanAccount ? `   IBAN ${data.ibanAccount}` : ''),
    )
    if (APPLY) await p.employee.update({ where: { id: e.id }, data })
  }

  if (conflicts.length) {
    console.log('\nTwo different IBANs on file — left alone, someone has to say which is current:')
    conflicts.forEach((c) => console.log('  ' + c))
  }

  console.log(`\n${emps.length} with bank details, ${fixed} ${APPLY ? 'corrected' : 'to correct'}, ${conflicts.length} needing a decision.`)
  if (!APPLY && fixed) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
