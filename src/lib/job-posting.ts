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

/**
 * Posts carry a time as well as a day — a JD published at 14:32 records 14:32.
 *
 * The 28 posts imported from the LinkedIn sheet have no time in them: the sheet
 * recorded days. Those sit at exactly midnight UTC, and midnight UTC is the
 * marker for "day only, no time known". Printing 00:00 against them would be
 * invented precision, and 05:00 after a timezone shift would be worse.
 *
 * Pakistan is UTC+5 with no daylight saving, so the offset is a constant.
 */
const PK_OFFSET_MS = 5 * 60 * 60 * 1000

export function isDayOnly(d: Date): boolean {
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0
}

/** { date: "05 Feb 2026", time: "14:32" | null } — null when no time is known. */
export function postingStamp(d: Date | null): { date: string; time: string | null } {
  if (!d) return { date: '—', time: null }
  const dayOnly = isDayOnly(d)
  const shown = dayOnly ? d : new Date(d.getTime() + PK_OFFSET_MS)
  const date = shown.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
  if (dayOnly) return { date, time: null }
  const hh = String(shown.getUTCHours()).padStart(2, '0')
  const mm = String(shown.getUTCMinutes()).padStart(2, '0')
  return { date, time: `${hh}:${mm}` }
}

/** "2026-02-05T14:32" for a datetime-local input, in Pakistan time. */
export function postingInputValue(d: Date | null): string | null {
  if (!d) return null
  const shown = isDayOnly(d) ? d : new Date(d.getTime() + PK_OFFSET_MS)
  return shown.toISOString().slice(0, 16)
}

/** Money as it should read on the payments table. 0 is free, null is unknown. */
export function postingAmount(value: number | null | undefined, currency: string): string | null {
  if (value == null) return null
  if (value === 0) return 'Free'
  return `${currency} ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`
}
