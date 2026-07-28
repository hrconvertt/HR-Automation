/**
 * IBAN → Bank code mapping for Pakistani banks.
 *
 * Pakistani IBANs follow the pattern `PK<2 check digits><4-letter bank code><account>`.
 * The 4-letter prefix uniquely identifies the bank — we map those to the short
 * codes used in the bank's IBFT / IFT bulk-transfer xlsx templates.
 */

const IBAN_TO_BANK: Record<string, string> = {
  MEZN: 'MBL',     // Meezan Bank
  UNIL: 'UNIL',    // United Bank Limited
  FAYS: 'FAYS',    // Faysal Bank
  ALFH: 'BAL',     // Bank Alfalah
  SCBL: 'SCB',     // Standard Chartered
  NAYA: 'NAYAP',   // Naya Pay
  SADA: 'SADAP',   // SadaPay
  HABB: 'HBL',     // Habib Bank Limited
  BAHL: 'BAHL',    // Bank Al Habib
  MCBL: 'MCB',     // MCB Bank
  ABPA: 'ABL',     // Allied Bank
  NBPA: 'NBP',     // National Bank of Pakistan
  ASCM: 'ASKARI',  // Askari Bank
  SUMB: 'SMBL',    // Summit Bank
  JSBL: 'JSBL',    // JS Bank
  SILK: 'SILKB',   // Silk Bank
  BKIP: 'BIP',     // Bank Islami Pakistan
  DUIB: 'DIB',     // Dubai Islamic
  SONE: 'SONERI',  // Soneri Bank
  PUNJ: 'BOP',     // Bank of Punjab
  KHYB: 'BOK',     // Bank of Khyber
  TMFB: 'TMFB',    // Telenor Microfinance / Easypaisa
}

/** Derive the bank short-code from a Pakistani IBAN. Returns '' if not parseable. */
export function bankCodeFromIban(iban: string | null | undefined): string {
  if (!iban) return ''
  const m = iban.replace(/\s+/g, '').match(/^PK\d{2}([A-Z]{4})/i)
  if (!m) return ''
  const code = m[1].toUpperCase()
  return IBAN_TO_BANK[code] ?? code
}

/** True if the IBAN belongs to Faysal Bank (so it's eligible for IFT format). */
export function isFaysalIban(iban: string | null | undefined): boolean {
  if (!iban) return false
  const m = iban.replace(/\s+/g, '').match(/^PK\d{2}([A-Z]{4})/i)
  return !!m && m[1].toUpperCase() === 'FAYS'
}
