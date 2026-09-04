'use client'

/**
 * A phone number or an email address you can actually act on.
 *
 * Both were rendered as plain text everywhere — the profile, the directory,
 * the users table, every candidate row. There were eight `mailto:` links in
 * the whole app and not a single `tel:`, so reaching anyone meant selecting
 * the text and copying it by hand.
 *
 * The displayed value is left exactly as it is stored; only the href is
 * normalised, because "0300-123 4567" is how it should read and
 * "tel:03001234567" is what a phone can dial.
 */

import { cn } from '@/lib/utils'

const LINK = 'hover:underline underline-offset-2 decoration-slate-300 break-words'

/** Strip anything a dialler cannot use, keeping a leading +. */
function dialable(raw: string): string | null {
  const trimmed = raw.trim()
  const plus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  // Too short to be a real number — show it, but do not pretend it dials.
  if (digits.length < 7) return null
  return (plus ? '+' : '') + digits
}

function looksLikeEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim())
}

interface Props {
  value: string | null | undefined
  className?: string
  /** Shown when there is nothing on file. */
  empty?: React.ReactNode
}

export function PhoneLink({ value, className, empty = '—' }: Props) {
  const raw = value?.trim()
  if (!raw) return <span className="text-slate-300">{empty}</span>
  const tel = dialable(raw)
  if (!tel) return <span className={className}>{raw}</span>
  return (
    <a href={`tel:${tel}`} className={cn(LINK, className)} title={`Call ${raw}`}>
      {raw}
    </a>
  )
}

export function EmailLink({ value, className, empty = '—' }: Props) {
  const raw = value?.trim()
  if (!raw) return <span className="text-slate-300">{empty}</span>
  if (!looksLikeEmail(raw)) return <span className={className}>{raw}</span>
  return (
    <a href={`mailto:${raw}`} className={cn(LINK, className)} title={`Email ${raw}`}>
      {raw}
    </a>
  )
}

/**
 * For the label/value lists that render many fields generically — decides
 * from the field's own label rather than making every caller pick.
 */
export function ContactValue({ label, value, className }: { label: string } & Props) {
  const l = label.toLowerCase()
  if (l.includes('phone') || l.includes('mobile') || l.includes('contact number')) {
    return <PhoneLink value={value} className={className} />
  }
  if (l.includes('email')) return <EmailLink value={value} className={className} />
  return value ? <span className={className}>{value}</span> : <span className="text-slate-300">—</span>
}
