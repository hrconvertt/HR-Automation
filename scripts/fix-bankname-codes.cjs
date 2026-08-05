/**
 * bankName holding a code instead of a name.
 *
 * Eight records carry MBL, UBL, MOBIM, NAYAP or even the raw IBAN prefix UNIL
 * in the bank *name* field. They are not wrong — MBL really is Meezan — but a
 * salary slip printing "Bank/Branch: MBL" tells an employee nothing, and the
 * earlier backfill skipped them precisely because the field was not empty.
 *
 * The code belongs in bankCode, which is what the bank file reads. The name
 * belongs in bankName, which is what a person reads.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

// Anything shorter than this and lacking a space is a code, not a name.
const CODE_TO_NAME = {
  ABL: 'Allied Bank Ltd', ACB: 'Askari Commercial Bank', BAH: 'Bank Al Habib Ltd',
  BAL: 'Bank Alfalah Ltd', BIL: 'Bank Islami Ltd', DBI: 'Dubai Islamic Bank Ltd',
  FBL: 'Faysal Bank', HBL: 'Habib Bank Ltd', JSB: 'JS Bank Ltd', MBL: 'Meezan Bank Ltd',
  MCB: 'MCB Bank Ltd', MOBIM: 'JazzCash', MPB: 'Metropolitan Bank', NAYAP: 'NayaPay',
  NBP: 'National Bank of Pakistan', SADAP: 'SadaPay', SBL: 'Soneri Bank Ltd',
  SCB: 'Standard Chartered Bank', SDB: 'Sindh Bank', SLK: 'Silk Bank', SMB: 'Samba Bank',
  SUM: 'Summit Bank', TBK: 'Bank of Khyber', TBL: 'Telenor Microfinance Bank',
  TBP: 'Bank of Punjab', UBL: 'United Bank Ltd', ZTB: 'Zarai Taraqiati Bank',
  // Raw IBAN prefixes that ended up in the name field.
  UNIL: 'United Bank Ltd', MEZN: 'Meezan Bank Ltd', FAYS: 'Faysal Bank',
  NAYA: 'NayaPay', SADA: 'SadaPay', TMFB: 'Telenor Microfinance Bank',
  JCMA: 'JazzCash', ASCM: 'Askari Commercial Bank', SCBL: 'Standard Chartered Bank',
  NBPA: 'National Bank of Pakistan', ALFH: 'Bank Alfalah Ltd', HABB: 'Habib Bank Ltd',
}

;(async () => {
  const emps = await p.employee.findMany({
    where: { NOT: { bankName: null } },
    select: { id: true, employeeCode: true, fullName: true, bankName: true, bankCode: true },
    orderBy: { fullName: 'asc' },
  })

  let fixed = 0
  for (const e of emps) {
    const raw = (e.bankName ?? '').trim().toUpperCase()
    // A real name has a space or is long. A code is short and single-word.
    if (raw.includes(' ') || raw.length > 6) continue
    const name = CODE_TO_NAME[raw]
    if (!name) { console.log(`${e.fullName} — "${e.bankName}" not a code I know, left alone`); continue }

    console.log((APPLY ? 'FIX  ' : 'would fix ')
      + `${e.employeeCode.padEnd(14)} ${e.fullName.padEnd(24)} "${e.bankName}" -> "${name}"`)
    fixed++
    if (APPLY) {
      await p.employee.update({
        where: { id: e.id },
        // Keep the code where it belongs if nothing is there yet.
        data: { bankName: name, ...(e.bankCode ? {} : { bankCode: raw }) },
      })
    }
  }

  console.log(`\n${fixed} ${APPLY ? 'corrected' : 'to correct'}.`)
  if (!APPLY && fixed) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
