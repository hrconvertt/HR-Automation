/**
 * The Employee Information Form, as a real fill-in PDF on the Convertt
 * letterhead.
 *
 * This is the paper copy of the digital intake form — the one a new joiner
 * signs and that goes in the personnel file (Playbook SOP-02). The fields are
 * the five sections of the online form, drawn as labelled write-on lines rather
 * than empty boxes so a hand-filled copy stays legible.
 *
 * Built with pdf-lib, not HTML, so it produces an actual .pdf without a
 * headless browser — the same reason the letters do.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { logoPngBytes } from '@/lib/brand-logo'

const ASSETS = path.join(process.cwd(), 'src/assets/letterhead')

// ── A4 geometry ──────────────────────────────────────────────────────────────
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN_X = 48
const MARGIN_TOP = 44
const MARGIN_BOTTOM = 54
const CONTENT_W = PAGE_W - MARGIN_X * 2
const INK = rgb(0x1a / 255, 0x1a / 255, 0x1a / 255)
const MUTED = rgb(0x64 / 255, 0x74 / 255, 0x8b / 255)
const RULE = rgb(0xc0 / 255, 0xc8 / 255, 0xd0 / 255)
const GREEN = rgb(0x89 / 255, 0xff / 255, 0x0b / 255)
const CHARCOAL = rgb(0x16 / 255, 0x17 / 255, 0x1a / 255)

export type FieldKind = 'text' | 'wide' | 'date' | 'choice' | 'para' | 'upload'

export interface FormField {
  label: string
  kind: FieldKind
  /** For choice fields. */
  options?: string[]
  required?: boolean
}

export interface FormSection {
  title: string
  fields: FormField[]
}

/**
 * The five sections, taken field-for-field from the Google form. The account-
 * opening section's labels are de-jargoned — FATHER_HUSBAND_NAME reads as a
 * person would say it, not as the bank's column name.
 */
export const EMPLOYEE_INFO_SECTIONS: FormSection[] = [
  {
    title: 'Personal Information',
    fields: [
      { label: 'Full name', kind: 'text', required: true },
      { label: 'Email', kind: 'text', required: true },
      { label: 'Phone', kind: 'text', required: true },
      { label: 'Gender', kind: 'choice', options: ['Male', 'Female'], required: true },
      { label: 'Date of birth', kind: 'date', required: true },
      { label: 'Current address', kind: 'wide' },
      { label: 'Permanent address', kind: 'para' },
      { label: 'CNIC number', kind: 'text', required: true },
      { label: 'IBAN number', kind: 'text' },
      { label: 'CNIC — front image', kind: 'upload', required: true },
      { label: 'CNIC — back image', kind: 'upload', required: true },
      { label: 'Profile photograph', kind: 'upload' },
    ],
  },
  {
    title: 'Job Details',
    fields: [
      {
        label: 'Department', kind: 'choice', required: true,
        options: ['Human Resource', 'Business Development', 'Web — Shopify', 'Finance',
          'Media Team', 'UIUX', 'Web — WordPress', 'Marketing', 'Project Coordinator',
          'QA Engineer', 'Admin'],
      },
      {
        label: 'Role', kind: 'choice', required: true,
        options: ['Manager', 'Lead', 'Associate', 'Executive', 'Intern', 'Trainee'],
      },
      {
        label: 'Role status', kind: 'choice', required: true,
        options: ['Permanent Employee', 'Contractual', 'Part Time', 'Internship', 'Training'],
      },
      { label: 'Hire date', kind: 'date', required: true },
    ],
  },
  {
    title: 'Location & Address',
    fields: [
      { label: 'Address line 1', kind: 'wide', required: true },
      { label: 'Address line 2', kind: 'wide' },
      { label: 'City', kind: 'text', required: true },
      { label: 'State / Province', kind: 'text', required: true },
      { label: 'Postal code', kind: 'text', required: true },
      { label: 'Country', kind: 'text', required: true },
    ],
  },
  {
    title: 'Emergency Contact',
    fields: [
      { label: 'Name', kind: 'text', required: true },
      { label: 'Relationship', kind: 'text', required: true },
      { label: 'Phone', kind: 'text', required: true },
      { label: 'Email', kind: 'text' },
    ],
  },
  {
    title: 'Bank Account Opening Details',
    fields: [
      { label: 'Full name (as per CNIC)', kind: 'wide', required: true },
      { label: "Father's / Husband's name", kind: 'text', required: true },
      { label: "Mother's maiden name", kind: 'text', required: true },
      { label: 'CNIC — date of issuance', kind: 'date', required: true },
      { label: 'CNIC — expiry date', kind: 'date', required: true },
      { label: 'CNIC — date of birth', kind: 'date' },
      { label: 'CNIC — place of birth', kind: 'text', required: true },
      {
        label: 'Marital status', kind: 'choice', required: true,
        options: ['Single', 'Married', 'Divorced', 'Widowed'],
      },
      { label: 'Permanent home address', kind: 'para', required: true },
    ],
  },
]

interface Ctx {
  pdf: PDFDocument
  page: PDFPage
  reg: PDFFont
  bold: PDFFont
  y: number
}

function addPage(ctx: Ctx, withHeader = false) {
  ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H])
  ctx.y = PAGE_H - MARGIN_TOP
  // Thin brand rule down the left edge of every page — the one flash of green.
  ctx.page.drawRectangle({ x: 0, y: 0, width: 4, height: PAGE_H, color: GREEN })
  if (withHeader) drawHeader(ctx)
}

function ensure(ctx: Ctx, need: number) {
  if (ctx.y - need < MARGIN_BOTTOM) addPage(ctx)
}

function drawHeader(ctx: Ctx) {
  const logo = ctx.pdf as unknown as { _logo?: import('pdf-lib').PDFImage }
  const img = logo._logo
  if (img) {
    const w = 132
    const h = (img.height / img.width) * w
    ctx.page.drawImage(img, { x: MARGIN_X, y: ctx.y - h, width: w, height: h })
  }
  // Title on the right.
  const title = 'Employee Information Form'
  const size = 15
  const tw = ctx.bold.widthOfTextAtSize(title, size)
  ctx.page.drawText(title, {
    x: PAGE_W - MARGIN_X - tw, y: ctx.y - 16, size, font: ctx.bold, color: CHARCOAL,
  })
  ctx.page.drawText('CONVERTT — People & Culture', {
    x: PAGE_W - MARGIN_X - ctx.reg.widthOfTextAtSize('CONVERTT — People & Culture', 8.5),
    y: ctx.y - 28, size: 8.5, font: ctx.reg, color: MUTED,
  })
  ctx.y -= 44

  const intro = 'To be completed by every new joiner during onboarding. Please print clearly '
    + 'in block capitals. Fields marked * are required.'
  ctx.y = wrapText(ctx, intro, MARGIN_X, ctx.y, CONTENT_W, ctx.reg, 8.8, MUTED, 12)
  ctx.y -= 8
}

/** Draw wrapped text, return the new y. */
function wrapText(
  ctx: Ctx, text: string, x: number, y: number, maxW: number,
  font: PDFFont, size: number, color = INK, leading = size * 1.35,
): number {
  const words = text.split(' ')
  let line = ''
  let cy = y
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(test, size) > maxW && line) {
      ctx.page.drawText(line, { x, y: cy, size, font, color })
      cy -= leading
      line = w
    } else line = test
  }
  if (line) { ctx.page.drawText(line, { x, y: cy, size, font, color }); cy -= leading }
  return cy
}

function sectionHeader(ctx: Ctx, n: number, title: string) {
  ensure(ctx, 30)
  ctx.y -= 6
  // A charcoal band with the section title.
  ctx.page.drawRectangle({
    x: MARGIN_X, y: ctx.y - 16, width: CONTENT_W, height: 20, color: CHARCOAL,
  })
  ctx.page.drawText(`${n}.  ${title.toUpperCase()}`, {
    x: MARGIN_X + 8, y: ctx.y - 11, size: 9.5, font: ctx.bold, color: rgb(1, 1, 1),
  })
  ctx.y -= 28
}

/** One field: label above, a write-on line (or choice boxes) below. */
function field(ctx: Ctx, f: FormField) {
  const labelSize = 8.5
  const isTall = f.kind === 'para' || f.kind === 'upload'
  const need = f.kind === 'choice' ? 34 : isTall ? 46 : 30
  ensure(ctx, need)

  const label = f.label + (f.required ? ' *' : '')
  ctx.page.drawText(label, {
    x: MARGIN_X, y: ctx.y, size: labelSize, font: ctx.bold, color: INK,
  })
  ctx.y -= 13

  if (f.kind === 'choice' && f.options) {
    // Tick boxes, wrapped across the width.
    let x = MARGIN_X
    const boxSize = 8
    const gap = 6
    const size = 8.5
    for (const opt of f.options) {
      const w = boxSize + gap + ctx.reg.widthOfTextAtSize(opt, size) + 16
      if (x + w > MARGIN_X + CONTENT_W) { x = MARGIN_X; ctx.y -= 15 }
      ctx.page.drawRectangle({
        x, y: ctx.y - 1, width: boxSize, height: boxSize,
        borderColor: MUTED, borderWidth: 0.8,
      })
      ctx.page.drawText(opt, {
        x: x + boxSize + gap, y: ctx.y, size, font: ctx.reg, color: INK,
      })
      x += w
    }
    ctx.y -= 20
    return
  }

  if (f.kind === 'upload') {
    // A box to paste/attach into on the paper copy.
    ctx.page.drawRectangle({
      x: MARGIN_X, y: ctx.y - 24, width: 150, height: 30,
      borderColor: RULE, borderWidth: 0.8,
    })
    ctx.page.drawText('attach / paste', {
      x: MARGIN_X + 44, y: ctx.y - 12, size: 7.5, font: ctx.reg, color: RULE,
    })
    ctx.y -= 36
    return
  }

  // Write-on line(s).
  const lines = f.kind === 'para' ? 2 : 1
  const width = f.kind === 'text' ? CONTENT_W * 0.62 : CONTENT_W
  for (let i = 0; i < lines; i++) {
    ctx.page.drawLine({
      start: { x: MARGIN_X, y: ctx.y - 2 },
      end: { x: MARGIN_X + width, y: ctx.y - 2 },
      thickness: 0.8, color: RULE,
    })
    ctx.y -= 18
  }
  ctx.y -= 4
}

export async function buildEmployeeInfoFormPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const reg = await pdf.embedFont(fs.readFileSync(path.join(ASSETS, 'fonts/Roboto-Regular.ttf')), { subset: true })
  const bold = await pdf.embedFont(fs.readFileSync(path.join(ASSETS, 'fonts/Roboto-Bold.ttf')), { subset: true })
  const logo = await pdf.embedPng(logoPngBytes())
  ;(pdf as unknown as { _logo: unknown })._logo = logo

  const ctx: Ctx = { pdf, page: null as unknown as PDFPage, reg, bold, y: 0 }
  addPage(ctx, true)

  EMPLOYEE_INFO_SECTIONS.forEach((s, i) => {
    sectionHeader(ctx, i + 1, s.title)
    for (const f of s.fields) field(ctx, f)
  })

  // Declaration + signature.
  ensure(ctx, 90)
  ctx.y -= 6
  ctx.y = wrapText(
    ctx,
    'I confirm that the information above is true and complete to the best of my '
    + 'knowledge, and I consent to Convertt verifying it and processing it for '
    + 'employment purposes.',
    MARGIN_X, ctx.y, CONTENT_W, ctx.reg, 8.5, INK, 12,
  )
  ctx.y -= 24
  const half = (CONTENT_W - 30) / 2
  const sig: Array<[string, number]> = [
    ['Employee signature', MARGIN_X],
    ['Date', MARGIN_X + half + 30],
  ]
  for (const [lbl, x] of sig) {
    ctx.page.drawLine({
      start: { x, y: ctx.y }, end: { x: x + half, y: ctx.y },
      thickness: 0.8, color: MUTED,
    })
    ctx.page.drawText(lbl, { x, y: ctx.y - 11, size: 8, font: ctx.reg, color: MUTED })
  }
  ctx.y -= 30
  ctx.page.drawText('For office use — received and verified by: ______________________    Date: __________', {
    x: MARGIN_X, y: ctx.y, size: 8, font: ctx.reg, color: MUTED,
  })

  return pdf.save()
}
