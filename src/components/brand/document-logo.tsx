/**
 * The Convertt mark at the head of a printed document.
 *
 * Every document the system issues carries the same logo — the lime mark and
 * charcoal wordmark from the HR Playbook — so a show-cause notice, a JD and a
 * payslip all read as the same company. Inlined as a data URI (see
 * lib/brand-logo) so the print never loses its logo to a missing file.
 */
import { LOGO_DATA_URI } from '@/lib/brand-logo'

export function DocumentLogo({
  height = 30,
  style,
  className,
}: {
  height?: number
  style?: React.CSSProperties
  className?: string
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_DATA_URI}
      alt="Convertt"
      className={className}
      style={{ height, width: 'auto', display: 'block', ...style }}
    />
  )
}
