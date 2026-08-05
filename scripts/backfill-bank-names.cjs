/**
 * Fill in the bank name from the IBAN.
 *
 * Every account on file is an IBAN, and the four letters after the check digits
 * say which bank it is — FAYS is Faysal, MEZN is Meezan, UNIL is UBL. Bank name
 * was blank on most records, so the salary slip printed nothing under
 * Bank/Branch while the answer sat in the account number two lines above it.
 *
 * A name already typed in is left alone: it may carry the branch as well, and
 * a person who wrote it knew something the prefix does not.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const PREFIX = {
  ABPA: 'Allied Bank Ltd', ALFH: 'Bank Alfalah Ltd', ASCM: 'Askari Commercial Bank',
  BAHL: 'Bank Al Habib Ltd', BKIP: 'Bank Islami Ltd', DUIB: 'Dubai Islamic Bank Ltd',
  FAYS: 'Faysal Bank', HABB: 'Habib Bank Ltd', JCMA: 'JazzCash',
  JSBL: 'JS Bank Ltd', KHYB: 'Bank of Khyber', MCBL: 'MCB Bank Ltd',
  MEZN: 'Meezan Bank Ltd', MPBL: 'Metropolitan Bank', NAYA: 'NayaPay',
  NBPA: 'National Bank of Pakistan', PUNJ: 'Bank of Punjab', SADA: 'SadaPay',
  SAMB: 'Samba Bank', SCBL: 'Standard Chartered Bank', SILK: 'Silk Bank',
  SIND: 'Sindh Bank', SONE: 'Soneri Bank Ltd', SUMB: 'Summit Bank',
  TMFB: 'Telenor Microfinance Bank', UBLP: 'United Bank Ltd', UNIL: 'United Bank Ltd',
  ZTBL: 'Zarai Taraqiati Bank',
}

const clean = (v) => (v ?? '').replace(/[\s-]/g, '').toUpperCase()
const prefixOf = (v) => {
  const c = clean(v)
  return /^PK\d{2}[A-Z]{4}/.test(c) ? c.slice(4, 8) : null
}

;(async () => {
  const emps = await p.employee.findMany({
    select: {
      id: true, employeeCode: true, fullName: true,
      bankName: true, bankAccount: true, ibanAccount: true,
    },
    orderBy: { fullName: 'asc' },
  })

  let set = 0
  const unknown = []

  for (const e of emps) {
    if ((e.bankName ?? '').trim()) continue
    const pre = prefixOf(e.ibanAccount) ?? prefixOf(e.bankAccount)
    if (!pre) continue
    const name = PREFIX[pre]
    if (!name) { unknown.push(`${e.fullName} — ${pre}`); continue }

    console.log((APPLY ? 'SET  ' : 'would set ')
      + `${e.employeeCode.padEnd(14)} ${e.fullName.padEnd(24)} ${pre} -> ${name}`)
    set++
    if (APPLY) await p.employee.update({ where: { id: e.id }, data: { bankName: name } })
  }

  if (unknown.length) {
    console.log('\nIBAN prefix not in the table — left blank rather than guessed:')
    unknown.forEach((u) => console.log('  ' + u))
  }
  console.log(`\n${set} ${APPLY ? 'set' : 'to set'}, ${unknown.length} unknown.`)
  if (!APPLY && set) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
