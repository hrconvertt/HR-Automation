/**
 * Job postings — the money side of a requisition.
 *
 * One row per advert. Publishing a JD opens the careers-page row; anything
 * paid (LinkedIn and friends) is added or corrected by hand on Job Post
 * Payments, because only HR knows what was actually spent.
 */

export const POSTING_PLATFORMS = [
  'LINKEDIN', 'INDEED', 'ZIPRECRUITER', 'CAREERS_PAGE', 'OTHER',
] as const
export type PostingPlatform = (typeof POSTING_PLATFORMS)[number]

export const PLATFORM_LABELS: Record<string, string> = {
  LINKEDIN: 'LinkedIn',
  INDEED: 'Indeed',
  ZIPRECRUITER: 'ZipRecruiter',
  CAREERS_PAGE: 'Careers page',
  OTHER: 'Other',
}

export const POSTING_STATUSES = ['ACTIVE', 'PAUSED', 'EXPIRED', 'CLOSED'] as const

// AED first — every post in the sheet so far was billed in AED.
export const POSTING_CURRENCIES = ['AED', 'PKR', 'USD', 'GBP', 'EUR', 'SAR'] as const

const TOKEN_PREFIX: Record<string, string> = {
  LINKEDIN: 'LN', INDEED: 'ID', ZIPRECRUITER: 'ZR', CAREERS_PAGE: 'CP', OTHER: 'OT',
}

/** e.g. "CP-20260807-4K2A" — carried on apply links for source attribution. */
export function trackingToken(platform: string, when = new Date()): string {
  const prefix = TOKEN_PREFIX[platform] ?? 'OT'
  const date = when.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${prefix}-${date}-${rand}`
}

/** Money as it should read on the payments table. 0 is free, null is unknown. */
export function postingAmount(value: number | null | undefined, currency: string): string | null {
  if (value == null) return null
  if (value === 0) return 'Free'
  return `${currency} ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`
}
