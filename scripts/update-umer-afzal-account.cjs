/**
 * Umer Afzal's activated Faysal account.
 *
 * Account 3547475000015065 — the 35474750000 prefix is the same Faysal branch
 * every other Convertt salary account sits on, so this is his salary account
 * and the Askari IBAN already on file is his own.
 *
 * The IBAN is built from the account number rather than typed: PK, then two
 * check digits computed with the ISO 13616 mod-97, then FAYS and the sixteen
 * account digits. Computing it removes the one thing that would actually hurt
 * here — a transposed digit in a hand-entered IBAN sends a salary somewhere
 * else — and the result is verified by re-running the checksum before it is
 * written.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const ACCOUNT = '3547475000015065'
const BANK = 'FAYS'

/** ISO 13616: letters become numbers, country + check digits move to the end. */
function mod97(s) {
  let rem = 0
  for (const ch of s) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch
    for (const digit of v) rem = (rem * 10 + Number(digit)) % 97
  }
  return rem
}

function buildIban(bank, account) {
  const bban = bank + account.padStart(16, '0')
  const check = String(98 - mod97(bban + 'PK00')).padStart(2, '0')
  return 'PK' + check + bban
}

const isValid = (iban) => mod97(iban.slice(4) + iban.slice(0, 4)) === 1

;(async () => {
  const emp = await p.employee.findFirst({
    where: { fullName: 'Umer Afzal' },
    select: {
      id: true, employeeCode: true, fullName: true,
      bankName: true, bankCode: true, bankAccount: true, ibanAccount: true,
    },
  })
  if (!emp) { console.log('Umer Afzal not found.'); return }

  const iban = buildIban(BANK, ACCOUNT)
  if (!isValid(iban)) { console.log('Refusing to write — checksum failed on ' + iban); return }

  console.log(`${emp.employeeCode}  ${emp.fullName}`)
  console.log(`  account #  ${emp.bankAccount ?? '—'}  ->  ${ACCOUNT}`)
  console.log(`  IBAN       ${emp.ibanAccount ?? '—'}  ->  ${iban}  (checksum verified)`)
  console.log(`  bank       ${emp.bankName ?? '—'}  ->  Faysal Bank`)

  if (!APPLY) { console.log('\nDry run. Re-run with --apply to write.'); return }

  await p.employee.update({
    where: { id: emp.id },
    data: {
      bankAccount: ACCOUNT,
      ibanAccount: iban,
      bankName: 'Faysal Bank',
      bankCode: BANK,
    },
  })
  console.log('\nUpdated. He now pays through IFT rather than IBFT.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
