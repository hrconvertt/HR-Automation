/**
 * Bank codes — the authoritative list is Convertt's "CRPL BANK CODES" sheet,
 * whose header reads "Please input the below bank codes in salary sheet". These
 * are what the bank accepts in the IFT / IBFT bulk-transfer templates.
 *
 * Two lookups, because an employee's bank arrives one of two ways:
 *
 *   bankCodeFromIban('PK78MEZN…')       -> 'MBL'   (from the IBAN)
 *   bankCodeFromName('Meezan Bank Ltd') -> 'MBL'   (from a typed bank name)
 *
 * Pakistani IBANs are `PK<2 check digits><4-letter bank code><account>`, and
 * that prefix identifies the bank — but it is NOT the code the bank wants in
 * the transfer file. Meezan's IBAN prefix is MEZN while its transfer code is
 * MBL, so the two maps below are different things and must not be collapsed.
 *
 * The codes here were previously hand-written and several were wrong: Faysal
 * was emitted as FAYS rather than FBL, Soneri as SONERI rather than SBL, Askari
 * as ASKARI rather than ACB, Summit as SMBL rather than SUM. Those went into
 * real bank files. Treat this file as generated from the sheet — if a code is
 * ever disputed, the sheet wins.
 */

/** BANK_NAME -> BANK_CODE, from the CRPL BANK CODES sheet (32 rows). */
export const BANK_CODES: { name: string; code: string }[] = [
  { name: 'Allied Bank Ltd', code: 'ABL' },
  { name: 'Al Baraka Islamic Bank', code: 'ABS' },
  { name: 'Askari Commercial Bank', code: 'ACB' },
  { name: 'Bank Al Habib Ltd', code: 'BAH' },
  { name: 'Bank Alfalah Ltd', code: 'BAL' },
  { name: 'Bank Islami Ltd', code: 'BIL' },
  { name: 'Dubai Islamic Bank Ltd', code: 'DBI' },
  { name: 'Faysal Bank', code: 'FBL' },
  { name: 'First Women Bank Ltd', code: 'FWB' },
  { name: 'Habib Bank Ltd', code: 'HBL' },
  { name: 'JS Bank', code: 'JSB' },
  { name: 'Khushali Bank Ltd', code: 'KBL' },
  { name: 'Meezan Bank Ltd', code: 'MBL' },
  { name: 'MCB Bank Ltd', code: 'MCB' },
  { name: 'MCB Islamic Ltd', code: 'MCBIS' },
  { name: 'Mobilink Microfinance Bank Limited', code: 'MOBIM' },
  { name: 'Metropolitan Bank Ltd', code: 'MPB' },
  { name: 'Naya Pay Private Ltd', code: 'NAYAP' },
  { name: 'National Bank of Pakistan', code: 'NBP' },
  { name: 'Sada Pay', code: 'SADAP' },
  { name: 'Soneri Bank Limited', code: 'SBL' },
  { name: 'Standard Chartered Bank', code: 'SCB' },
  { name: 'Sindh Bank', code: 'SDB' },
  { name: 'Silk Bank', code: 'SLK' },
  { name: 'Samba Bank', code: 'SMB' },
  { name: 'Summit Bank', code: 'SUM' },
  { name: 'The Bank of Khyber', code: 'TBK' },
  { name: 'Tameer Bank', code: 'TBL' },
  { name: 'The Bank of Punjab', code: 'TBP' },
  { name: 'United Bank Ltd', code: 'UBL' },
  { name: 'Zarai Taraqiati Bank', code: 'ZTB' },
]

/**
 * IBAN 4-letter prefix -> transfer code above.
 *
 * `UNIL` is the prefix Convertt's own payroll files use for UBL, so it is
 * accepted here and resolves to UBL's real code.
 */
const IBAN_PREFIX_TO_CODE: Record<string, string> = {
  ABPA: 'ABL',    // Allied Bank
  ALFH: 'BAL',    // Bank Alfalah
  ASCM: 'ACB',    // Askari
  BAHL: 'BAH',    // Bank Al Habib
  BKIP: 'BIL',    // BankIslami
  DUIB: 'DBI',    // Dubai Islamic
  FAYS: 'FBL',    // Faysal
  HABB: 'HBL',    // Habib Bank
  JCMA: 'MOBIM',  // JazzCash / Mobilink Microfinance
  JSBL: 'JSB',    // JS Bank
  KHYB: 'TBK',    // Bank of Khyber
  MCBL: 'MCB',    // MCB
  MEZN: 'MBL',    // Meezan
  MPBL: 'MPB',    // Metropolitan
  NAYA: 'NAYAP',  // NayaPay
  NBPA: 'NBP',    // National Bank
  PUNJ: 'TBP',    // Bank of Punjab
  SADA: 'SADAP',  // SadaPay
  SAMB: 'SMB',    // Samba
  SCBL: 'SCB',    // Standard Chartered
  SILK: 'SLK',    // Silk Bank
  SIND: 'SDB',    // Sindh Bank
  SONE: 'SBL',    // Soneri
  SUMB: 'SUM',    // Summit
  TMFB: 'TBL',    // Tameer / Telenor Microfinance
  UBLP: 'UBL',    // United Bank
  UNIL: 'UBL',    // United Bank, as written in Convertt's payroll files
  ZTBL: 'ZTB',    // Zarai Taraqiati
}

/** Faysal is the company's own bank, so its transfers go on the IFT file. */
export const HOME_BANK_CODE = 'FBL'
const HOME_BANK_IBAN_PREFIX = 'FAYS'

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Every spelling we accept for a bank -> its code. */
const NAME_TO_CODE = new Map<string, string>()
for (const b of BANK_CODES) {
  NAME_TO_CODE.set(normalise(b.name), b.code)
  // A bare code ("MBL") should resolve to itself — that is what people type.
  NAME_TO_CODE.set(normalise(b.code), b.code)
}

/** Pull the 4-letter bank prefix out of a Pakistani IBAN. */
function ibanPrefix(iban: string | null | undefined): string {
  if (!iban) return ''
  const m = iban.replace(/\s+/g, '').match(/^PK\d{2}([A-Z]{4})/i)
  return m ? m[1].toUpperCase() : ''
}

/** Transfer code from a Pakistani IBAN. '' when not parseable. */
export function bankCodeFromIban(iban: string | null | undefined): string {
  const p = ibanPrefix(iban)
  if (!p) return ''
  // An unknown prefix falls back to itself, so a bank we haven't listed still
  // shows something recognisable instead of a blank cell.
  return IBAN_PREFIX_TO_CODE[p] ?? p
}

/** Transfer code from a typed bank name. '' when unrecognised. */
export function bankCodeFromName(name: string | null | undefined): string {
  if (!name) return ''
  const key = normalise(name)
  if (!key) return ''
  const exact = NAME_TO_CODE.get(key)
  if (exact) return exact
  // "Meezan", "meezan bank", "HBL Bank" — match the distinctive part rather
  // than demanding the full legal name. Longest match wins so "MCB Islamic"
  // beats "MCB".
  let best = ''
  let bestLen = 0
  for (const [n, code] of NAME_TO_CODE) {
    if (n.length < 3) continue
    if ((key.includes(n) || n.includes(key)) && n.length > bestLen) {
      best = code
      bestLen = n.length
    }
  }
  return best
}

/**
 * Best available code for an employee. The IBAN wins because it is
 * machine-readable; the typed bank name is the fallback.
 */
export function resolveBankCode(
  iban: string | null | undefined,
  bankName?: string | null,
): string {
  return bankCodeFromIban(iban) || bankCodeFromName(bankName)
}

/** True if the IBAN belongs to Faysal, so the row goes on the IFT file. */
export function isFaysalIban(iban: string | null | undefined): boolean {
  return ibanPrefix(iban) === HOME_BANK_IBAN_PREFIX
}

/**
 * The bank's name, worked out from the IBAN when nobody typed one in.
 *
 * Every account on file is an IBAN and the four letters after the check digits
 * say which bank it is — FAYS is Faysal, MEZN is Meezan, UNIL is UBL. Leaving
 * Bank/Branch blank on a salary slip when the answer is sitting in the account
 * number two lines above it is a gap that never needed to exist.
 *
 * A name that was typed in wins, since it may carry the branch as well.
 */
export function bankNameFromIban(iban: string | null | undefined): string | null {
  const code = bankCodeFromIban(iban)
  if (!code) return null
  return BANK_CODES.find((b) => b.code === code)?.name ?? null
}

/** Bank/Branch as the slip should print it: the stored name, else the IBAN's. */
export function bankLabel(
  bankName: string | null | undefined,
  branch: string | null | undefined,
  iban: string | null | undefined,
): string {
  const name = (bankName ?? '').trim() || bankNameFromIban(iban) || ''
  const parts = [name, (branch ?? '').trim()].filter(Boolean)
  return parts.length ? parts.join(' — ') : '—'
}
