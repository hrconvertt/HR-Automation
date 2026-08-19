/**
 * The promotion celebration — announcement, certificate, kudos, cake.
 *
 * When Usman, Momna and Atta were promoted, the celebration was assembled by
 * hand every time: someone wrote the announcement, someone made a certificate
 * in Canva, someone remembered the cake. Same four things, three separate
 * scrambles.
 *
 * The wording here is warm on purpose. A promotion announcement written like a
 * payroll notice reads as though nobody was pleased.
 */

import { BRAND_GREEN, BRAND_CHARCOAL, BRAND_NAME } from '@/lib/brand'
import { LOGO_DATA_URI } from '@/lib/brand-logo'

export interface CelebrationInput {
  employeeName: string
  fromDesignation?: string | null
  toDesignation: string
  department?: string | null
  effectiveDate: Date | string
  /** Free text — what they actually did. Makes the difference between a
   *  template and an announcement worth reading. */
  highlights?: string | null
  joinedOn?: Date | string | null
}

/** The four things a promotion celebration is made of. */
export const CELEBRATION_STEPS = [
  { key: 'announcement', label: 'Announcement email', hint: 'Sent to everyone the day it takes effect' },
  { key: 'certificate', label: 'Certificate', hint: 'Printed and presented' },
  { key: 'cake', label: 'Cake', hint: 'Ordered the day before' },
  { key: 'kudos', label: 'Kudos', hint: 'Posted to the recognition wall' },
] as const
export type CelebrationStepKey = (typeof CELEBRATION_STEPS)[number]['key']

function longDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

function yearsAt(joinedOn: Date | string | null | undefined, at: Date | string): number | null {
  if (!joinedOn) return null
  const from = typeof joinedOn === 'string' ? new Date(joinedOn) : joinedOn
  const to = typeof at === 'string' ? new Date(at) : at
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  const years = (to.getTime() - from.getTime()) / (365.25 * 24 * 3600 * 1000)
  return years >= 1 ? Math.floor(years) : null
}

export function announcementSubject(i: CelebrationInput): string {
  return `Congratulations to ${i.employeeName} — ${i.toDesignation}`
}

/**
 * The announcement, as plain text.
 *
 * Plain text because it goes into a mail client, a Slack message and a
 * clipboard, and one body that works in all three beats three that drift.
 */
export function announcementBody(i: CelebrationInput): string {
  const years = yearsAt(i.joinedOn, i.effectiveDate)
  const out: string[] = []

  out.push('Team,')
  out.push('')
  out.push(
    `I am glad to share that ${i.employeeName} has been promoted to `
    + `${i.toDesignation}${i.department ? ` in ${i.department}` : ''}, `
    + `effective ${longDate(i.effectiveDate)}.`,
  )
  out.push('')

  if (i.highlights?.trim()) {
    out.push(i.highlights.trim())
  } else if (i.fromDesignation) {
    out.push(
      `${i.employeeName} has been doing the work of this role for a while now — `
      + `this makes it official. Moving up from ${i.fromDesignation} is not a reward for `
      + 'time served; it reflects work the team and our clients have felt.',
    )
  } else {
    out.push(
      `${i.employeeName} has earned this through work the team and our clients have felt.`,
    )
  }
  out.push('')

  if (years) {
    out.push(
      `${years} year${years === 1 ? '' : 's'} in, and still raising the bar. Please join me in `
      + 'congratulating them.',
    )
  } else {
    out.push('Please join me in congratulating them.')
  }
  out.push('')
  out.push(`— ${BRAND_NAME} People & Culture`)

  return out.join('\n')
}

/** A short line for the recognition wall. */
export function kudosMessage(i: CelebrationInput): string {
  return (
    `Promoted to ${i.toDesignation}, effective ${longDate(i.effectiveDate)}. `
    + 'Earned it — congratulations!'
  )
}

/**
 * The certificate, as a self-contained printable page.
 *
 * Landscape A4 with the brand green sweeping across the lower corners, which
 * is the shape of the Canva design these replace. Everything is inline: no
 * fonts, images or styles are fetched, so it prints identically from any
 * machine and works with no network.
 *
 * Values are escaped — a name with an ampersand in it must not be able to
 * reshape the page.
 */
export function certificateHtml(i: CelebrationInput): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Certificate — ${esc(i.employeeName)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; color: ${BRAND_CHARCOAL}; }
  .cert {
    position: relative; width: 297mm; height: 210mm; overflow: hidden;
    background: #fff; padding: 26mm 30mm;
    display: flex; flex-direction: column; align-items: center; text-align: center;
  }
  /* Two overlapping sweeps in the brand green — the lower-corner wave. */
  .wave, .wave2 { position: absolute; left: -6%; right: -6%; bottom: -30%; height: 62%; }
  .wave  { background: ${BRAND_GREEN}; opacity: .18; border-radius: 50% 50% 0 0 / 100% 100% 0 0; transform: rotate(-3deg); }
  .wave2 { background: ${BRAND_GREEN}; opacity: .55; border-radius: 50% 50% 0 0 / 100% 100% 0 0; transform: rotate(2deg); bottom: -36%; }
  .bar { position: absolute; top: 0; left: 0; right: 0; height: 8mm; background: ${BRAND_CHARCOAL}; }
  .inner { position: relative; z-index: 2; width: 100%; }
  .logo { height: 13mm; margin: 4mm auto 12mm; display: block; }
  .kicker {
    font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt;
    letter-spacing: .42em; text-transform: uppercase; color: #6b7280; margin-bottom: 5mm;
  }
  .name {
    font-size: 42pt; font-weight: 700; letter-spacing: -.01em; margin: 0 0 3mm;
    color: ${BRAND_CHARCOAL};
  }
  .rule { width: 92mm; height: 2px; background: ${BRAND_CHARCOAL}; margin: 0 auto 7mm; opacity: .18; }
  .lead { font-size: 13.5pt; color: #4b5563; margin: 0 0 3mm; }
  .role { font-size: 24pt; font-weight: 700; margin: 0 0 4mm; color: ${BRAND_CHARCOAL}; }
  .meta { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; color: #6b7280; }
  .sigs {
    position: absolute; z-index: 2; left: 30mm; right: 30mm; bottom: 22mm;
    display: flex; justify-content: space-between; gap: 20mm;
    font-family: 'Segoe UI', Arial, sans-serif;
  }
  .sig { width: 74mm; text-align: center; }
  .sig .line { border-top: 1.5px solid ${BRAND_CHARCOAL}; opacity: .35; margin-bottom: 2mm; }
  .sig .who { font-size: 10pt; font-weight: 600; }
  .sig .what { font-size: 8.5pt; color: #6b7280; }
  @media screen { body { background: #eef1f5; padding: 16px; } .cert { margin: 0 auto; box-shadow: 0 2px 14px rgba(0,0,0,.14); } }
</style></head>
<body>
  <div class="cert">
    <div class="bar"></div>
    <div class="wave"></div>
    <div class="wave2"></div>
    <div class="inner">
      <img class="logo" src="${LOGO_DATA_URI}" alt="Convertt">
      <div class="kicker">Certificate of Promotion</div>
      <h1 class="name">${esc(i.employeeName)}</h1>
      <div class="rule"></div>
      <p class="lead">is hereby promoted to the position of</p>
      <p class="role">${esc(i.toDesignation)}</p>
      <p class="meta">
        ${i.department ? `${esc(i.department)} &nbsp;·&nbsp; ` : ''}Effective ${longDate(i.effectiveDate)}
      </p>
    </div>
    <div class="sigs">
      <div class="sig"><div class="line"></div><div class="who">Founder</div><div class="what">${BRAND_NAME}</div></div>
      <div class="sig"><div class="line"></div><div class="who">HR Manager</div><div class="what">People &amp; Culture</div></div>
    </div>
  </div>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 300) })</script>
</body></html>`
}
