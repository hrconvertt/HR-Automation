/**
 * Backfill employee bank accounts from the IFT / IBFT payment files.
 *
 * The IFT vs IBFT split is decided by the account number — a Faysal IBAN
 * (PK..FAYS..) is an internal transfer (IFT), anything else goes inter-bank
 * (IBFT). Without an account number on the employee record the split cannot
 * resolve and everyone silently lands in IBFT.
 *
 * The bank files already carry "Beneficiary Account No" (and, for IBFT, the
 * bank code) for every person actually paid, so they are the source of truth.
 * The most recent month a person appears in wins.
 *
 * Run:  node scripts/backfill-bank-accounts.cjs [--dry]
 */
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})
const DRY = process.argv.includes('--dry')

const IBFT_FILE = 'C:/Users/HRConvertt/Downloads/Paid_IBFT Account Details_Jan 2026 (1).xlsx'
const IFT_FILE = 'C:/Users/HRConvertt/Downloads/Paid_IFT FORMAT_Jan_2026_IFT (1).xlsx'

// oldest → newest, so later months overwrite earlier ones
const TABS = [
  ['2025-08', 'Aug 2025', '(IBFT)Aug 25'],
  ['2025-09', 'Sep 2025', '(IBFT)Sep '],
  ['2025-10', 'Oct 2025', '(IBFT)Oct '],
  ['2025-11', 'Nov 2025', '(IBFT)Nov '],
  ['2025-12', 'Dec 2025', '(IBFT)Dec'],
  ['2026-01', 'Jan 2026', '(IBFT)Jan'],
  ['2026-02', 'Feb 2026', '(IBFT)Feb'],
  ['2026-03', 'March 2026', '(IBFT)March'],
  ['2026-04', 'April 2026', '(IBFT)April'],
  ['2026-05', 'May 2026', '(IBFT)May'],
  ['2026-06', 'June 2026', '(IBFT)June'],
]

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
const STOP = new Set(['muhammad', 'mohammad', 'md', 'syed', 'sheikh', 'mr', 'ms'])
const toks = (s) => norm(s).split(' ').filter((t) => t.length > 2 && !STOP.has(t))
const cleanIban = (s) => String(s || '').replace(/\s+/g, '').toUpperCase()

const ALIASES = {
  'abdllah shafiq': 'Abdullah Shafiq', 'ammar yonus': 'Muhammad Ammar Younas',
  'ammar': 'Muhammad Ammar Younas', 'muhammad ammar': 'Muhammad Ammar Younas',
  'tahrem waheed': 'Tahreem Waheed', 'momna': 'Momna Waryam Khan',
  'irfan': 'Muhammad Irfan', 'zuhaa': 'Zuhaa Shafi', 'rayyan': 'Muhammad Rayyan',
  'altaf': 'Altaf Yaseen', 'muzaffar': 'Muzaffar Jamil', 'taha adnan': 'Sheikh Taha Adnan',
  'usman saeed': 'Muhammad Usman Saeed', 'waqas fareed': 'Muhammad Waqas Fareed',
  'affan': 'Muhammad Affan Waseem', 'affan waseem': 'Muhammad Affan Waseem',
  'momin': 'Momin Munir', 'usama aslam': 'Muhammad Usama Aslam',
  'syeda aelia': 'Syeda Manqbat Aelia', 'aelia': 'Syeda Manqbat Aelia',
  'salman shahid': 'Muhammad Salman Shahid', 'tayyaba naeem': 'Taiyba Naeem',
  'hashir': 'Muhammad Hashir Siddiqui', 'muhammad hashir': 'Muhammad Hashir Siddiqui',
  'farzeen': 'Muhammad Farzeen Khan', 'khawer': 'Syed Khawer', 'asghar': 'Syed Asghar',
  'tayyab': 'Tayyab Hussain', 'zain': 'Zain Rasheed',
}

function readTab(wb, tab) {
  const ws = wb.Sheets[tab]
  if (!ws) return []
  const out = []
  for (const r of XLSX.utils.sheet_to_json(ws, { defval: null })) {
    const nameKey = Object.keys(r).find((k) => /beneficiary first name/i.test(k) || k.trim() === '')
    const accKey = Object.keys(r).find((k) => /beneficiary account no/i.test(k))
    const bankKey = Object.keys(r).find((k) => /^bank$/i.test(k.trim()))
    const name = nameKey ? r[nameKey] : null
    const acc = accKey ? cleanIban(r[accKey]) : ''
    if (!name || !acc) continue
    out.push({ name: String(name).trim(), account: acc, bank: bankKey ? r[bankKey] : null })
  }
  return out
}

async function main() {
  for (let i = 0; i < 6; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch (e) {
      if (i === 5) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  const iftWb = XLSX.readFile(IFT_FILE)
  const ibftWb = XLSX.readFile(IBFT_FILE)

  const latest = new Map() // bankName -> {account, bank, fmt}
  for (const [, iftTab, ibftTab] of TABS) {
    for (const r of readTab(iftWb, iftTab)) latest.set(r.name, { ...r, fmt: 'IFT' })
    for (const r of readTab(ibftWb, ibftTab)) latest.set(r.name, { ...r, fmt: 'IBFT' })
  }

  const employees = await prisma.employee.findMany({
    select: { id: true, fullName: true, status: true, ibanAccount: true, bankAccount: true, bankName: true, bankCode: true },
  })
  const nameCount = new Map()
  for (const e of employees) nameCount.set(norm(e.fullName), (nameCount.get(norm(e.fullName)) || 0) + 1)
  const byName = new Map()
  for (const e of employees) if (nameCount.get(norm(e.fullName)) === 1) byName.set(norm(e.fullName), e)

  function resolve(bankName) {
    const n = norm(bankName)
    if (ALIASES[n]) { const h = byName.get(norm(ALIASES[n])); if (h) return h }
    const exact = byName.get(n)
    if (exact) return exact
    const bt = toks(bankName)
    if (bt.length < 2) return null
    const hits = [...byName.entries()].filter(([mn]) => bt.every((t) => toks(mn).includes(t)))
    return hits.length === 1 ? hits[0][1] : null
  }

  let filled = 0, changed = 0, same = 0
  const unmatched = []
  const applied = []

  for (const [bankName, info] of latest) {
    const emp = resolve(bankName)
    if (!emp) { unmatched.push(bankName); continue }
    const current = cleanIban(emp.ibanAccount || emp.bankAccount || '')
    if (current === info.account) { same++; continue }

    const action = current ? 'CHANGED' : 'FILLED'
    if (action === 'FILLED') filled++; else changed++
    applied.push({ name: emp.fullName, was: current || '(empty)', now: info.account, fmt: info.fmt, bank: info.bank })

    if (!DRY) {
      await prisma.employee.update({
        where: { id: emp.id },
        data: {
          ibanAccount: info.account,
          ...(info.bank && !emp.bankCode ? { bankCode: String(info.bank).trim() } : {}),
        },
      })
    }
  }

  console.log(`${DRY ? 'DRY RUN' : 'APPLIED'} — bank accounts from IFT/IBFT files\n${'='.repeat(70)}`)
  console.log(`already correct : ${same}`)
  console.log(`filled in blank : ${filled}`)
  console.log(`replaced        : ${changed}`)
  if (applied.length) {
    console.log('\nname                        fmt    account')
    for (const a of applied.sort((x, y) => x.name.localeCompare(y.name))) {
      console.log(`  ${a.name.padEnd(26)} ${a.fmt.padEnd(5)} ${a.now}${a.was !== '(empty)' ? `   (was ${a.was})` : ''}`)
    }
  }
  if (unmatched.length) console.log(`\nbank names with no employee record: ${unmatched.join(', ')}`)

  // resulting split
  const after = await prisma.employee.findMany({ select: { fullName: true, status: true, ibanAccount: true, bankAccount: true } })
  const isFaysal = (e) => /^PK\d{2}FAYS/i.test(cleanIban(e.ibanAccount || e.bankAccount || ''))
  const hasAcc = (e) => !!cleanIban(e.ibanAccount || e.bankAccount || '')
  console.log(`\nresulting split — IFT ${after.filter(isFaysal).length} · IBFT ${after.filter((e) => hasAcc(e) && !isFaysal(e)).length} · still no account ${after.filter((e) => !hasAcc(e)).length}`)
  const none = after.filter((e) => !hasAcc(e))
  if (none.length) {
    console.log('still no account (never appear in either bank file):')
    for (const e of none) console.log(`   ${e.fullName.padEnd(26)} ${e.status}`)
  }
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
