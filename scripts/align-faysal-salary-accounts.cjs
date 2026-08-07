/**
 * Five records still pointed at two banks at once.
 *
 * Atta's profile read Bank Name JazzCash, Bank Code FBL, Account # a JazzCash
 * IBAN and IBAN a Faysal one — four fields, three different answers. Same shape
 * on Altaf, Aqib, Rayyan and Tayyab.
 *
 * bankCode was FBL on every one of them, so the system already knew these were
 * Faysal and paid them on the IFT file. The Faysal IBAN is the salary account;
 * the other-bank IBAN is a personal account that was imported into the wrong
 * field, exactly as it had been for Ali Hassan and Muhammad Hassan.
 *
 * Only touches rows where bankCode is already FBL and a Faysal IBAN is on file,
 * so nobody genuinely paid at another bank is moved.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const c = (v) => (v ?? '').replace(/\s/g, '').toUpperCase()
const isFaysal = (v) => /^PK\d{2}FAYS/.test(c(v))
const isIban = (v) => /^PK\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(c(v))

;(async () => {
  const emps = await p.employee.findMany({
    where: { bankCode: 'FBL' },
    select: { id: true, employeeCode: true, fullName: true, bankName: true, bankAccount: true, ibanAccount: true },
    orderBy: { fullName: 'asc' },
  })

  let fixed = 0
  for (const e of emps) {
    if (!isFaysal(e.ibanAccount)) continue
    if (!isIban(e.bankAccount) || isFaysal(e.bankAccount)) continue // already right

    console.log((APPLY ? 'FIX  ' : 'would fix ')
      + `${e.employeeCode.padEnd(14)} ${e.fullName.padEnd(22)}`
      + `\n     name  ${e.bankName} -> Faysal Bank`
      + `\n     acct  ${c(e.bankAccount)} -> ${c(e.ibanAccount)}`)
    fixed++
    if (APPLY) {
      await p.employee.update({
        where: { id: e.id },
        data: { bankAccount: c(e.ibanAccount), bankName: 'Faysal Bank' },
      })
    }
  }

  console.log(`\n${fixed} ${APPLY ? 'aligned' : 'to align'}.`)
  if (!APPLY && fixed) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
