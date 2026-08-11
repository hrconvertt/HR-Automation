/**
 * The bank code list, out of "CRPL BANK CODES.xlsx" and into a table HR can
 * edit.
 *
 * Two columns in the sheet — BANK_NAME and BANK_CODE — plus one row that is
 * really a note rather than a bank: "United Bank Limited (UBL) is | UNIL". It
 * is the answer to a question that has come up already, so it is kept as the
 * IBAN prefix on United Bank Ltd rather than imported as a 33rd bank. UBL's
 * IBANs carry UNIL; the salary sheet wants UBL.
 *
 * Faysal is flagged as our own bank, because a Faysal-to-Faysal payment goes
 * out as IFT and carries no bank code at all.
 *
 * Idempotent — matched on bank name, so a re-run corrects rather than
 * duplicates. Dry run by default; pass --apply to write.
 *
 *   npx tsx scripts/import-bank-codes.mts
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

/** name, code, iban prefix where it differs from the code */
const BANKS: Array<[string, string, string?]> = [
  ['Allied Bank Ltd', 'ABL'],
  ['Al Baraka Islamic Bank', 'ABS'],
  ['Askari Commercial Bank', 'ACB'],
  ['Bank Al Habib Ltd', 'BAH'],
  ['Bank Alfalah Ltd', 'BAL'],
  ['BankIslami Ltd', 'BIL'],
  ['Dubai Islamic Bank Ltd', 'DBI'],
  ['Faysal Bank', 'FBL'],
  ['First Women Bank Ltd', 'FWB'],
  ['Habib Bank Ltd', 'HBL'],
  ['JS Bank', 'JSB'],
  ['Khushhali Bank Ltd', 'KBL'],
  ['Meezan Bank Ltd', 'MBL', 'MEZN'],
  ['MCB Bank Ltd', 'MCB'],
  ['MCB Islamic Ltd', 'MCBIS'],
  ['Mobilink Microfinance Bank Ltd', 'MOBIM'],
  ['Metropolitan Bank Ltd', 'MPB'],
  ['NayaPay Private Ltd', 'NAYAP'],
  ['National Bank of Pakistan', 'NBP', 'NBPA'],
  ['SadaPay', 'SADAP', 'SADA'],
  ['Soneri Bank Ltd', 'SBL'],
  ['Standard Chartered Bank', 'SCB'],
  ['Sindh Bank', 'SDB'],
  ['Silk Bank', 'SLK'],
  ['Samba Bank', 'SMB'],
  ['Summit Bank', 'SUM'],
  ['The Bank of Khyber', 'TBK'],
  ['Tameer Bank', 'TBL'],
  ['The Bank of Punjab', 'TBP'],
  ['United Bank Ltd', 'UBL', 'UNIL'],
  ['Zarai Taraqiati Bank', 'ZTB'],
]

const OUR_BANK = 'Faysal Bank'

;(async () => {
  let added = 0
  let updated = 0
  for (const [bankName, bankCode, ibanPrefix] of BANKS) {
    const existing = await p.bankCode.findUnique({ where: { bankName } })
    const data = {
      bankCode,
      ibanPrefix: ibanPrefix ?? null,
      isOwnBank: bankName === OUR_BANK,
      notes: bankName === OUR_BANK
        ? 'Convertt banks here. Faysal-to-Faysal salary payments go out as IFT and carry no bank code.'
        : null,
    }
    console.log(
      `${existing ? 'update' : 'add   '}  ${bankName.padEnd(34)} ${bankCode.padEnd(6)}`
      + (ibanPrefix ? `  iban ${ibanPrefix}` : '')
      + (data.isOwnBank ? '   ← our bank, IFT' : ''),
    )
    if (existing) updated++
    else added++
    if (!APPLY) continue
    await p.bankCode.upsert({
      where: { bankName },
      update: data,
      create: { bankName, ...data },
    })
  }

  console.log(`\n${BANKS.length} banks — ${added} new, ${updated} already there.`)
  if (!APPLY) console.log('Dry run. Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
