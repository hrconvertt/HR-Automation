/**
 * Fill `employee.bankCode` from the CRPL bank-code list.
 *
 * The IBAN is authoritative because it is machine-readable; a typed bank name
 * is the fallback. Payroll's IFT/IBFT export reads this code, so an employee
 * without one lands in the file with a blank Bank column.
 *
 * Mirrors src/lib/bank-codes.ts exactly — if you change the codes there, change
 * them there only and re-run this.
 *
 * Run:  node scripts/backfill-bank-codes.cjs [--apply]
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})
const APPLY = process.argv.includes('--apply')

const BANK_CODES = [
  ['Allied Bank Ltd', 'ABL'], ['Al Baraka Islamic Bank', 'ABS'],
  ['Askari Commercial Bank', 'ACB'], ['Bank Al Habib Ltd', 'BAH'],
  ['Bank Alfalah Ltd', 'BAL'], ['Bank Islami Ltd', 'BIL'],
  ['Dubai Islamic Bank Ltd', 'DBI'], ['Faysal Bank', 'FBL'],
  ['First Women Bank Ltd', 'FWB'], ['Habib Bank Ltd', 'HBL'],
  ['JS Bank', 'JSB'], ['Khushali Bank Ltd', 'KBL'],
  ['Meezan Bank Ltd', 'MBL'], ['MCB Bank Ltd', 'MCB'],
  ['MCB Islamic Ltd', 'MCBIS'], ['Mobilink Microfinance Bank Limited', 'MOBIM'],
  ['Metropolitan Bank Ltd', 'MPB'], ['Naya Pay Private Ltd', 'NAYAP'],
  ['National Bank of Pakistan', 'NBP'], ['Sada Pay', 'SADAP'],
  ['Soneri Bank Limited', 'SBL'], ['Standard Chartered Bank', 'SCB'],
  ['Sindh Bank', 'SDB'], ['Silk Bank', 'SLK'], ['Samba Bank', 'SMB'],
  ['Summit Bank', 'SUM'], ['The Bank of Khyber', 'TBK'], ['Tameer Bank', 'TBL'],
  ['The Bank of Punjab', 'TBP'], ['United Bank Ltd', 'UBL'],
  ['Zarai Taraqiati Bank', 'ZTB'],
]

const IBAN_PREFIX_TO_CODE = {
  ABPA: 'ABL', ALFH: 'BAL', ASCM: 'ACB', BAHL: 'BAH', BKIP: 'BIL', DUIB: 'DBI',
  FAYS: 'FBL', HABB: 'HBL', JCMA: 'MOBIM', JSBL: 'JSB', KHYB: 'TBK', MCBL: 'MCB', MEZN: 'MBL',
  MPBL: 'MPB', NAYA: 'NAYAP', NBPA: 'NBP', PUNJ: 'TBP', SADA: 'SADAP',
  SAMB: 'SMB', SCBL: 'SCB', SILK: 'SLK', SIND: 'SDB', SONE: 'SBL', SUMB: 'SUM',
  TMFB: 'TBL', UBLP: 'UBL', UNIL: 'UBL', ZTBL: 'ZTB',
}

const normalise = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const NAME_TO_CODE = new Map()
for (const [name, code] of BANK_CODES) {
  NAME_TO_CODE.set(normalise(name), code)
  NAME_TO_CODE.set(normalise(code), code)
}

function ibanPrefix(iban) {
  if (!iban) return ''
  const m = String(iban).replace(/\s+/g, '').match(/^PK\d{2}([A-Z]{4})/i)
  return m ? m[1].toUpperCase() : ''
}

function fromIban(iban) {
  const p = ibanPrefix(iban)
  if (!p) return ''
  return IBAN_PREFIX_TO_CODE[p] ?? p
}

function fromName(name) {
  const key = normalise(name)
  if (!key) return ''
  if (NAME_TO_CODE.has(key)) return NAME_TO_CODE.get(key)
  let best = '', bestLen = 0
  for (const [n, code] of NAME_TO_CODE) {
    if (n.length < 3) continue
    if ((key.includes(n) || n.includes(key)) && n.length > bestLen) { best = code; bestLen = n.length }
  }
  return best
}

async function main() {
  for (let i = 0; i < 6; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch (e) {
      if (i === 5) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  const employees = await prisma.employee.findMany({
    select: {
      id: true, employeeCode: true, fullName: true,
      bankCode: true, bankName: true, ibanAccount: true, bankAccount: true,
    },
    orderBy: { fullName: 'asc' },
  })

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — bank codes for ${employees.length} employees\n${'='.repeat(84)}`)

  let set = 0, changed = 0, same = 0
  const noSource = []

  for (const e of employees) {
    const iban = e.ibanAccount || e.bankAccount
    const code = fromIban(iban) || fromName(e.bankName)
    if (!code) {
      if (e.bankName || iban) noSource.push(`${(e.employeeCode || '—').padEnd(14)}${e.fullName.padEnd(26)}bank "${e.bankName ?? '—'}"  iban "${iban ?? '—'}"`)
      continue
    }
    if (e.bankCode === code) { same++; continue }

    const via = fromIban(iban) ? 'IBAN' : 'name'
    console.log(`  ${(e.employeeCode || '—').padEnd(14)}${e.fullName.padEnd(26)}${(e.bankCode ?? '—').padEnd(8)} -> ${code.padEnd(7)} (via ${via})`)
    if (APPLY) await prisma.employee.update({ where: { id: e.id }, data: { bankCode: code } })
    if (e.bankCode) changed++; else set++
  }

  console.log(`\n${'='.repeat(84)}`)
  console.log(`newly set: ${set}   corrected: ${changed}   already right: ${same}`)
  if (noSource.length) {
    console.log(`\nno code could be derived (${noSource.length}):`)
    for (const n of noSource) console.log('  ' + n)
  }
  if (!APPLY) console.log('\nNothing written. Re-run with --apply.')
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
