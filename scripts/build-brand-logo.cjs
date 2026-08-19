/**
 * Regenerate src/lib/brand-logo.ts from the PNGs in src/assets/brand/.
 *
 * Run this after replacing the brand artwork — never hand-edit brand-logo.ts,
 * it is 50KB of base64.
 *
 *   node scripts/build-brand-logo.cjs
 *
 * The source PNGs came out of the HR Playbook (CVT-HR-PB-001), which is the
 * current brand. convertt-logo-small.png is a 548px-wide copy of the full
 * 1370px mark — documents render it at ~175pt, so the full-size image was
 * three times more pixels than any output could use.
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const ASSETS = path.join(ROOT, 'src/assets/brand')

const read = (f) => fs.readFileSync(path.join(ASSETS, f)).toString('base64')

/** Break base64 into source lines so the file is diffable and lintable. */
const literal = (b64) =>
  b64.match(/.{1,110}/g).map((s) => `'${s}'`).join(' +\n  ')

const out = `/**
 * The Convertt mark, inlined once.
 *
 * Every document the system issues used to carry its own copy of a logo: the
 * PDF letterhead read one file, the HTML letters embedded a second image, and
 * the salary slip embedded a third — an older dark-green wordmark that had not
 * been the company's mark for some time. Three copies meant three answers to
 * "what does our letterhead look like".
 *
 * These are the marks from the HR Playbook (CVT-HR-PB-001), which is the
 * current brand. They are base64 rather than files on disk so a document can
 * never render without its logo because a path did not survive a deploy.
 *
 * GENERATED — do not edit. Run scripts/build-brand-logo.cjs instead.
 */

/** Charcoal wordmark on transparency — for white and light backgrounds. */
export const LOGO_PNG_BASE64 =
  ${literal(read('convertt-logo-small.png'))}

/** White wordmark on transparency — for dark backgrounds. */
export const LOGO_WHITE_PNG_BASE64 =
  ${literal(read('convertt-logo-white.png'))}

/** Ready to drop straight into an <img src>. */
export const LOGO_DATA_URI = \`data:image/png;base64,\${LOGO_PNG_BASE64}\`
export const LOGO_WHITE_DATA_URI = \`data:image/png;base64,\${LOGO_WHITE_PNG_BASE64}\`

/** Raw bytes, for pdf-lib's embedPng. */
export function logoPngBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(LOGO_PNG_BASE64, 'base64'))
}

/** The mark's aspect ratio, so callers only ever pick a width. */
export const LOGO_ASPECT = 548 / 80
`

fs.writeFileSync(path.join(ROOT, 'src/lib/brand-logo.ts'), out)
console.log(`src/lib/brand-logo.ts — ${(out.length / 1024).toFixed(1)}KB`)
