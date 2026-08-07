/**
 * Bank details audit — run this before any payroll disbursement.
 *
 * Checks the four things that actually send money to the wrong place:
 *   - two people sharing an account number
 *   - an account field holding something that is not an IBAN
 *   - a bank name that disagrees with the IBAN's own prefix
 *   - an active employee with no account at all
 *
 * Every one of these has been real in this data: Ali Hassan and Muhammad Hassan
 * shared a SadaPay IBAN belonging to neither of them, five records named one
 * bank while their code said another, and eighteen carried a code where a name
 * belongs.
 *
 * Read-only. Exits non-zero if anything is found, so it can gate a release.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const clean = (v) => (v ?? '').replace(/[\s-]/g, '').toUpperCase()
const isIban = (v) => /^PK\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(clean(v))
const prefixOf = (v) => (isIban(v) ? clean(v).slice(4, 8) : null)

// What each IBAN prefix must look like in the bank name.
const EXPECT = {
  FAYS: 'faysal', MEZN: 'meezan', UNIL: 'united', UBLP: 'united',
  NBPA: 'national', SADA: 'sadapay', NAYA: 'nayapay', TMFB: 'telenor',
  SCBL: 'standard', ASCM: 'askari', JCMA: 'jazzcash', JSBL: 'js',
  ALFH: 'alfalah', HABB: 'habib', MCBL: 'mcb', BAHL: 'al habib',
  SONE: 'soneri', PUNJ: 'punjab', KHYB: 'khyber', SIND: 'sindh',
}

// The founders take no salary row, so no account is expected of them.
const NO_SALARY = ['CON-CEO-001', 'CON-HR-001']

;(async () => {
  const emps = await p.employee.findMany({
    where: { status: { in: ['ACTIVE', 'PROBATION'] } },
    select: {
      employeeCode: true, fullName: true,
      bankName: true, bankCode: true, bankAccount: true, ibanAccount: true,
    },
    orderBy: { fullName: 'asc' },
  })

  const problems = []
  const byAccount = new Map()

  for (const e of emps) {
    const acct = clean(e.bankAccount)
    if (acct) {
      if (!byAccount.has(acct)) byAccount.set(acct, [])
      byAccount.get(acct).push(e.fullName)
    }

    if (!acct) {
      if (!NO_SALARY.includes(e.employeeCode)) {
        problems.push(`${e.fullName} — no account on file`)
      }
      continue
    }
    if (!isIban(e.bankAccount)) {
      problems.push(`${e.fullName} — account is not an IBAN: ${e.bankAccount}`)
      continue
    }
    const want = EXPECT[prefixOf(e.bankAccount)]
    if (want && !(e.bankName ?? '').toLowerCase().includes(want)) {
      problems.push(`${e.fullName} — ${prefixOf(e.bankAccount)} but name says "${e.bankName}"`)
    }
    // A second IBAN at a different bank means two accounts and no way to know
    // which one payroll should use.
    if (isIban(e.ibanAccount) && clean(e.ibanAccount) !== acct) {
      problems.push(`${e.fullName} — two IBANs: ${acct} and ${clean(e.ibanAccount)}`)
    }
  }

  for (const [acct, names] of byAccount) {
    if (names.length > 1) problems.push(`SHARED account ${acct}: ${names.join(' and ')}`)
  }

  const ift = emps.filter((e) => prefixOf(e.bankAccount) === 'FAYS').length
  const paid = emps.filter((e) => clean(e.bankAccount)).length

  if (problems.length) {
    console.log('Problems:')
    problems.forEach((x) => console.log('  ' + x))
  } else {
    console.log('No problems found.')
  }
  console.log(`\n${emps.length} active · ${paid} with an account · ${ift} IFT (Faysal) · ${paid - ift} IBFT`)

  await p.$disconnect()
  if (problems.length) process.exitCode = 1
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
