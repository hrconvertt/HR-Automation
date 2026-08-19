/**
 * Convertt's brand, as the HR Playbook defines it.
 *
 * Taken from CVT-HR-PB-001 (HR Playbook v1.0, effective 1 September 2026),
 * which is the current brand: the lime mark, the charcoal wordmark, and the
 * two legal entities. Anything the company issues — a letter, a slip, a
 * certificate, a proposal — reads its identity from here so there is one
 * answer rather than one per document.
 *
 * Colours are sampled from the Playbook's own artwork, not matched by eye.
 *
 * No I/O and no React here, so this is safe to import from a client component.
 * The mark itself lives in ./brand-logo (bigger, server-side documents only).
 */

// ── Palette ─────────────────────────────────────────────────────────────────
/** The mark's lime. */
export const BRAND_GREEN = '#89FF0B'
/** The wordmark's charcoal — near-black, but not black. */
export const BRAND_CHARCOAL = '#16171A'
/** Body text on printed documents. */
export const BRAND_INK = '#1A1A1A'

// ── Identity ────────────────────────────────────────────────────────────────
export const BRAND_NAME = 'Convertt'
/** How the wordmark is set. Use for headings that stand in for the logo. */
export const BRAND_NAME_UPPER = 'CONVERTT'
export const BRAND_TAGLINE = 'Conversion-rate-optimisation agency'

/**
 * The two employing entities.
 *
 * Playbook 1.2: "the brand name alone is never the contracting party". Any
 * document that binds someone must name one of these, not just "Convertt".
 */
export const ENTITIES = {
  PK: {
    legalName: 'Convertt',
    legalForm: 'a sole proprietorship organised under the laws of the Islamic Republic of Pakistan',
    shortName: 'Convertt PK',
    address: 'Office #201, 5th Floor, Mega Tower, Main Gulberg, Lahore, Punjab, Pakistan',
    country: 'Pakistan',
  },
  UAE: {
    legalName: 'SyeDev LLC FZ',
    legalForm: 'a free zone limited liability company registered in Dubai, UAE, trading as Convertt',
    shortName: 'Convertt UAE',
    address: 'Dubai, United Arab Emirates',
    country: 'United Arab Emirates',
  },
} as const

export type EntityKey = keyof typeof ENTITIES

/** The letterhead address block, as it prints. */
export const LETTERHEAD_ADDRESS_LINES = [
  'Mega Tower 5th floor, Office #201',
  'Gulberg Lahore, Pakistan',
  '+92 42 37458015',
  '+1 (716) 980-7724',
] as const

export const BRAND_WEBSITE = 'convertt.co'
export const HR_EMAIL = 'hr@convertt.co'
export const FINANCE_EMAIL = 'finance@convertt.co'

/** The Playbook every policy in this system derives from. */
export const PLAYBOOK = {
  code: 'CVT-HR-PB-001',
  title: 'HR Playbook',
  subtitle: 'People operations, policies & due diligence — Pakistan & UAE',
  version: 'v1.0',
  effectiveDate: '2026-09-01',
  classification: 'Private & Confidential — Internal Use Only',
  owner: 'HR Manager',
  approvedBy: 'Founder',
  reviewCycle: 'Annual, and on any change in PK/UAE employment law',
} as const
