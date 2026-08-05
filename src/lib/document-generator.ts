/**
 * Document generator — produces personalised, print-ready HTML for HR documents.
 *
 * Each generator pulls from the employee record + Salary + any "extras" the
 * caller supplies (e.g. for Show Cause: the specific concerns; for Termination:
 * the F&F amount). Returns HTML the browser can render and print as PDF.
 *
 * Documents:
 *   - offer_letter             — auto-generates from employee designation, salary, joining date
 *   - employment_agreement     — Permanent / Probation variant
 *   - employment_agreement_intern — Internship / Training variant
 *   - nda                      — Confidentiality + IP assignment
 *   - show_cause_notice        — Performance / misconduct allegations
 *   - notice_period_letter     — 1-month notice + last working day
 *   - termination_letter       — Termination + last day + F&F
 *   - experience_letter        — Confirmation of tenure
 *   - confirmation_letter      — Post-probation confirmation
 *   - exit_clearance_form      — Multi-department sign-off
 *   - exit_interview_form      — Blank fillable form
 */

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

type EmployeeWithRels = Prisma.EmployeeGetPayload<{
  include: { department: true; reportingManager: true; salary: true }
}>

export type DocumentType =
  | 'offer_letter'
  | 'employment_agreement'
  | 'employment_agreement_intern'
  | 'nda'
  | 'show_cause_notice'
  | 'notice_period_letter'
  | 'termination_letter'
  | 'experience_letter'
  | 'confirmation_letter'
  | 'exit_clearance_form'
  | 'exit_interview_form'
  | 'relieving_certificate'
  | 'termination_email'

export type DocumentExtras = {
  // Universal
  effectiveDate?: string         // ISO date — overrides "today"
  // Offer letter
  reportingTo?: string
  probationMonths?: number       // Employment letter — defaults to 3
  // Show Cause
  concerns?: string              // free-text allegations
  responseWindowDays?: number    // typically 3–7
  // Notice Period
  lastWorkingDay?: string        // ISO date
  // Termination
  terminationReason?: string
  showCauseDate?: string         // ISO date of the Show Cause Notice, referenced in the letter
  fnfAmount?: number
  // Experience letter
  // (nothing extra — uses joiningDate + exitDate)
}

const fmtMoney = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`
const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
// The letterhead date on the issued letters reads "July 1, 2026", not
// "1 July 2026". Only the dateline uses this; body dates keep their own wording.
const letterDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

// ─── Shared HTML chrome ──────────────────────────────────────────────────────

interface Signatory { name: string; title: string; above?: string }

/** Every Convertt letter is signed by the Director unless the issued sample
 *  says otherwise — the termination letter goes out from the HR Team. */
const DEFAULT_SIGNATORY: Signatory = { name: 'Syed Khawer', title: 'Director Administration' }

function wrap(title: string, body: string, signatory: Signatory = DEFAULT_SIGNATORY): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  /* Convertt letterhead, measured from the official sample PDFs: A4, Roboto,
     gradient bars top and bottom (#0857E5 -> #277FB1) inset from the edges,
     logo top-left, address block right-aligned, and Syed Khawer / Director
     Administration as signatory. These are fixed company identity — the only
     thing that changes between letters is the body. */
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    /* The issued letters are set in a serif face, not Roboto. Ours was
       sans-serif throughout, which is why a side-by-side never matched even
       when every word did. */
    font-family: 'Times New Roman', Times, serif;
    color: #000; margin: 0; padding: 24px; background: #f1f5f9; font-size: 12pt;
  }
  /* Nothing in a letter is a link. Values were rendering tinted. */
  .doc, .doc p, .doc li, .doc td, .doc span, .doc strong { color: #000; }
  .doc {
    width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; position: relative;
    padding: 46pt 60pt 60pt; box-shadow: 0 1px 4px rgba(0,0,0,.12);
  }
  /* ~12.8pt tall, inset ~29pt from each side, top and bottom of the page. */
  .doc::before, .doc::after {
    content: ''; position: absolute; left: 29pt; right: 29pt; height: 12.8pt;
    background: linear-gradient(90deg, #0857E5 0%, #277FB1 100%);
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .doc::before { top: 0; }
  .doc::after  { bottom: 0; }
  .letterhead { display: flex; justify-content: space-between; align-items: flex-start; margin: 18pt 0 30pt; }
  /* Convertt's actual mark. This was a text wordmark with the last two letters
     coloured blue — a guess at the logo that was never the logo. */
  .logo img { height: 26pt; display: block; }
  .addr { text-align: right; font-size: 10.5pt; line-height: 1.45; color: #1a1a1a; }
  .letter-date { font-size: 11pt; margin: 0 0 26pt; text-align: right; }
  .doc-title { font-size: 13pt; font-weight: 700; margin: 0 0 18pt; }
  .doc-title.centred { text-align: center; margin: 0 0 22pt; }
  p.left { text-align: left; }
  p { font-size: 12pt; line-height: 16.5pt; margin: 0 0 12pt; text-align: left; }
  /* The issued letter ranges its body left. Justifying it stretched the word
     spacing into rivers the original does not have. */
  p.j { text-align: left; }
  p.tight { margin: 0 0 2pt; }
  ul.dot { list-style: none; padding-left: 14pt; margin: 4pt 0 12pt; }
  ul.dot li { position: relative; text-align: left; }
  /* Was a private-use codepoint that never survived font substitution: every
     bulleted line printed a tofu box followed by the literal letters CF. */
  ul.dot li::before { content: '•'; position: absolute; left: -14pt; font-size: 10pt; top: 0; }
  strong { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin: 12pt 0; }
  table.kv td { padding: 4pt 0; font-size: 11.5pt; vertical-align: top; }
  table.kv td:first-child { font-weight: 700; width: 34%; }
  table.compact td { padding: 6pt 8pt; border: 1px solid #cbd5e1; font-size: 11pt; }
  ol, ul { padding-left: 20pt; font-size: 12pt; line-height: 16.5pt; }
  ol li, ul li { margin: 5pt 0; }
  .signature-block { margin-top: 40pt; }
  .signature .line { font-size: 10pt; color: #475569; }
  .signature .name { font-size: 14pt; font-weight: 700; color: #0f172a; }
  .sign-off { margin-top: 44pt; }
  .sign-off .name { font-size: 14pt; font-weight: 700; }
  .sign-off .title { font-size: 10pt; }
  /* Editing chrome — never printed. */
  .toolbar {
    position: sticky; top: 0; z-index: 10; width: 210mm; margin: 0 auto 14px;
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    background: #0f172a; color: #fff; padding: 10px 14px; border-radius: 8px;
    font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px;
  }
  .toolbar button {
    padding: 7px 13px; border-radius: 6px; border: 1px solid #334155;
    background: #1e293b; color: #fff; cursor: pointer; font-size: 13px;
  }
  .toolbar button.primary { background: #0857E5; border-color: #0857E5; }
  .toolbar .hint { opacity: .75; margin-left: auto; }
  [contenteditable="true"]:focus { outline: 2px solid #0857E5; outline-offset: 4px; }
  body.editing .doc { cursor: text; }
  @page { size: A4; margin: 0; }
  @media print {
    body { background: #fff; padding: 0; }
    /* The closing bar is anchored to the bottom of .doc. Collapsing .doc to its
       content height for print left it wherever the text happened to end —
       floating in the middle of the sheet with white space beneath it. A full
       page keeps it on the bottom edge where it belongs. */
    .doc {
      width: 210mm; height: 297mm; min-height: 297mm;
      box-shadow: none; margin: 0;
    }
    .toolbar { display: none !important; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button id="editBtn" onclick="toggleEdit()">Edit</button>
    <button class="primary" onclick="window.print()">Print / Save as PDF</button>
    <button onclick="window.close()">Close</button>
    <span class="hint" id="hint">Click Edit to change any wording before printing.</span>
  </div>
  <div class="doc" id="doc">
    <div class="letterhead">
      <div class="logo"><img src="data:image/png;base64,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" alt="Convertt"></div>
      <div class="addr">
        Mega Tower 5th floor, Office #201<br>
        Gulberg Lahore, Pakistan<br>
        +92 42 37458015<br>
        +1 (716) 980-7724
      </div>
    </div>
    <div class="letter-date">${letterDate(new Date())}</div>
    ${body}
    <div class="sign-off">
      ${signatory.above ? `<p>${escapeHtml(signatory.above)}</p>` : ''}
      <div class="name">${escapeHtml(signatory.name)}</div>
      <div class="title">${escapeHtml(signatory.title)}</div>
    </div>
  </div>
<script>
  // Edit in place rather than round-tripping to a form: HR's changes here are
  // wording tweaks on a finished letter, and the printed output is the
  // deliverable, so what you edit is literally what prints.
  var editing = false;
  function toggleEdit() {
    editing = !editing;
    var doc = document.getElementById('doc');
    doc.setAttribute('contenteditable', editing ? 'true' : 'false');
    document.body.classList.toggle('editing', editing);
    document.getElementById('editBtn').textContent = editing ? 'Done editing' : 'Edit';
    document.getElementById('hint').textContent = editing
      ? 'Editing — click into any text and type. Changes are not saved back to the employee record.'
      : 'Click Edit to change any wording before printing.';
    if (editing) doc.focus();
  }
  window.addEventListener('beforeprint', function () {
    document.getElementById('doc').setAttribute('contenteditable', 'false');
  });
</script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export async function generateDocument(
  type: DocumentType,
  employeeId: string,
  extras: DocumentExtras = {},
): Promise<{ html: string; title: string }> {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      department: true,
      reportingManager: true,
      salary: true,
    },
  })
  if (!emp) throw new Error('Employee not found')

  const ctx = { emp, extras }

  switch (type) {
    case 'offer_letter':                return offerLetter(ctx)
    case 'employment_agreement':        return employmentAgreement(ctx, 'permanent')
    case 'employment_agreement_intern': return employmentAgreement(ctx, 'intern')
    case 'nda':                          return nda(ctx)
    case 'show_cause_notice':           return showCauseNotice(ctx)
    case 'notice_period_letter':        return noticePeriodLetter(ctx)
    case 'termination_letter':          return terminationLetter(ctx)
    case 'experience_letter':           return experienceLetter(ctx)
    case 'confirmation_letter':         return confirmationLetter(ctx)
    case 'exit_clearance_form':         return exitClearanceForm(ctx)
    case 'exit_interview_form':         return exitInterviewForm(ctx)
    case 'relieving_certificate':       return relievingCertificate(ctx)
    case 'termination_email':           return terminationEmail(ctx)
    default: throw new Error(`Unknown document type: ${type}`)
  }
}

// ─── Per-document generators ─────────────────────────────────────────────────

type Ctx = {
  emp: EmployeeWithRels
  extras: DocumentExtras
}

/**
 * Employment Letter — reproduced from the issued sample (Umer Afzal, 1 July
 * 2026) without additions.
 *
 * Two details are faithful to the source rather than tidy: Joining Date and
 * Probation Period are plain lines while Compensation onward are bulleted, and
 * the office address is written out in the letter's own wording rather than the
 * letterhead's. Both are how the issued letter reads.
 *
 * The company paragraph is fixed copy and is never regenerated per employee.
 */
function offerLetter({ emp, extras }: Ctx) {
  const salary = emp.salary
  const gross = salary
    ? salary.basic + salary.houseRent + salary.utilities + salary.food + salary.fuel + salary.medicalAllowance + salary.otherAllowance
    : 0
  const joining = extras.effectiveDate ? new Date(extras.effectiveDate) : emp.joiningDate ?? new Date()

  // "1st July, 2026" — ordinal day, as the sample writes it.
  const d = joining.getDate()
  const suffix = d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  const joiningLong = `${d}${suffix} ${MONTHS[joining.getMonth()]}, ${joining.getFullYear()}`

  const timings = emp.timings ?? '10 AM - 7 PM'
  // workDays is stored as "Mon,Tue,Wed,Thu,Fri". The sample writes the standard
  // week as the phrase "Monday to Friday", so a contiguous Mon-Fri renders that
  // way and anything else is listed out.
  const DAY_NAMES: Record<string, string> = {
    Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
    Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
  }
  const days = String(emp.workDays ?? 'Mon,Tue,Wed,Thu,Fri')
    .split(',').map((x) => x.trim()).filter(Boolean)
  const workingDays = days.join(',') === 'Mon,Tue,Wed,Thu,Fri'
    ? 'Monday to Friday'
    : days.map((d) => DAY_NAMES[d] ?? d).join(', ')

  const body = `
    <div class="doc-title centred">Subject: Employment Letter</div>
    <p class="j">On behalf of the HR team at Convertt, I am pleased to congratulate ${escapeHtml(emp.fullName)}${emp.cnic ? ` CNIC ${escapeHtml(emp.cnic)}` : ''} on your selection for the ${escapeHtml(emp.designation ?? '—')} position. We were impressed with your profile and are excited to welcome you to our team.</p>
    <p class="j">Below are the details of your employment:</p>
    <p class="tight">Joining Date: ${joiningLong}</p>
    <p class="tight">Probation Period: ${escapeHtml(String(extras.probationMonths ?? 3))} months, dependent upon your performance</p>
    <ul class="dot">
      <li>Compensation: PKR ${gross > 0 ? gross.toLocaleString('en-US') : '[Compensation]'} per month</li>
      <li>Timings: ${escapeHtml(timings)}</li>
      <li>Working Days: ${escapeHtml(workingDays)}</li>
      <li>Office Location: Convertt, Mega Tower &ndash; 63-B Main Boulevard Gulberg, 5th Floor, Office No. 201, Lahore</li>
    </ul>
    <p class="j">Convertt is a CRO-focused design and development agency working with ecommerce brands, dental practices, and weight loss clinics across the US, UK, and UAE. We&rsquo;ve generated over $1B in tracked client revenue with an average 3.5X conversion uplift across 120+ projects. Our work sits at the intersection of conversion strategy, design, and development. We don&rsquo;t just make things look good, we make them perform.</p>
    <p class="j">We look forward to having you onboard and working together towards shared success.</p>
    <p class="j">Congratulations once again!</p>
  `
  return { html: wrap('Employment Letter', body), title: `Employment Letter - ${emp.fullName}` }
}

function employmentAgreement({ emp, extras }: Ctx, kind: 'permanent' | 'intern') {
  const salary = emp.salary
  const gross = salary
    ? salary.basic + salary.houseRent + salary.utilities + salary.food + salary.fuel + salary.medicalAllowance + salary.otherAllowance
    : 0
  const startDate = extras.effectiveDate ? new Date(extras.effectiveDate) : emp.joiningDate ?? new Date()
  const intern = kind === 'intern'

  const componentRows = salary ? `
      <table class="kv">
        <tr><td>Basic Salary</td><td>${fmtMoney(salary.basic)}</td></tr>
        <tr><td>House Rent</td><td>${fmtMoney(salary.houseRent)}</td></tr>
        <tr><td>Utilities</td><td>${fmtMoney(salary.utilities)}</td></tr>
        <tr><td>Food Allowance</td><td>${fmtMoney(salary.food)}</td></tr>
        <tr><td>Fuel Allowance</td><td>${fmtMoney(salary.fuel)}</td></tr>
        <tr><td>Medical Allowance</td><td>${fmtMoney(salary.medicalAllowance)}</td></tr>
        <tr><td>Other Allowances</td><td>${fmtMoney(salary.otherAllowance)}</td></tr>
        <tr><td><strong>Gross Monthly</strong></td><td><strong>${fmtMoney(gross)}</strong></td></tr>
      </table>` : '<p style="color:#94a3b8;font-style:italic">[Salary breakdown to be inserted]</p>'

  const body = `
    <div class="doc-title">${intern ? 'Employment Agreement — Training &amp; Internship' : 'Employment Agreement — Permanent Employee'}</div>
    <p>This Employment Agreement (the "Agreement") is made and entered into on <strong>${fmtDate(startDate)}</strong> between:</p>
    <p><strong>Convertt Ltd</strong>, a company duly registered under the laws of Pakistan with offices at Office 201, 5th Floor, Mega Tower, Gulberg Main Boulevard, Lahore (hereinafter the "Company"); and</p>
    <p><strong>${escapeHtml(emp.fullName)}</strong>${emp.cnic ? `, CNIC ${escapeHtml(emp.cnic)}` : ''}${emp.address ? `, residing at ${escapeHtml(emp.address)}` : ''} (hereinafter the "Employee").</p>

    <h3 style="font-size:12pt;margin-top:18px">1. Position &amp; Duties</h3>
    <p>The Employee is appointed as <strong>${escapeHtml(emp.designation)}</strong> in the ${escapeHtml(emp.department?.name ?? '—')} department, reporting to ${escapeHtml(emp.reportingManager?.fullName ?? '[Reporting Manager]')}. The Employee agrees to perform such duties and responsibilities as are customarily associated with this role and as may be assigned by the Company from time to time.</p>

    <h3 style="font-size:12pt">2. Term &amp; Probation</h3>
    ${intern
      ? '<p>This Agreement is for a fixed training/internship period as determined by the Company, beginning on the date stated above. Continuation, conversion to a permanent role, or termination at the end of this period is at the Company\'s sole discretion.</p>'
      : '<p>This Agreement is for an indefinite term, commencing on the date stated above, subject to a probationary period of three (3) months during which either party may terminate the Agreement with one (1) week\'s written notice. Upon successful confirmation, the standard one (1) month notice period shall apply.</p>'}

    <h3 style="font-size:12pt">3. Compensation</h3>
    <p>The Employee shall be paid the following monthly compensation, less applicable statutory deductions:</p>
    ${componentRows}
    <p>Salary shall be paid on or around the last working day of each month, subject to attendance.</p>

    <h3 style="font-size:12pt">4. Working Hours &amp; Location</h3>
    <p>Standard working hours are ${escapeHtml(emp.timings ?? '10:00 AM – 7:00 PM, Monday to Friday')} at ${escapeHtml(emp.workLocationAddress ?? emp.workLocation ?? 'the Company\'s Lahore office')}. The Employee may be required to work additional hours as business needs require.</p>

    <h3 style="font-size:12pt">5. Leave</h3>
    ${intern
      ? '<p>The Employee shall be entitled to one (1) emergency leave per the training period. Other absences shall be unpaid.</p>'
      : '<p>The Employee shall be entitled to 24 days of paid leave per calendar year (12 Casual + 12 Sick), accrued monthly. Leave shall be applied through the HR system and is subject to manager approval.</p>'}

    <h3 style="font-size:12pt">6. Confidentiality &amp; Intellectual Property</h3>
    <p>The Employee agrees to maintain absolute confidentiality of all proprietary information, client data, financial data, trade secrets, and any other information that is not in the public domain, both during and after the term of employment. All work product, code, designs, and creative output produced in the course of employment shall remain the exclusive intellectual property of Convertt Ltd.</p>

    <h3 style="font-size:12pt">7. Code of Conduct</h3>
    <p>The Employee shall conduct themselves professionally at all times and abide by the Company's Code of Conduct, IT Policy, Anti-Harassment Policy, and any other policies issued by the Company from time to time.</p>

    <h3 style="font-size:12pt">8. Termination</h3>
    ${intern
      ? '<p>The Company may terminate this Agreement at any time during the training period without notice for unsatisfactory performance, misconduct, or any other valid reason.</p>'
      : '<p>Either party may terminate this Agreement by giving one (1) month\'s written notice or payment in lieu thereof. The Company reserves the right to terminate without notice in cases of gross misconduct or breach of this Agreement.</p>'}

    <h3 style="font-size:12pt">9. Governing Law</h3>
    <p>This Agreement shall be governed by and construed in accordance with the laws of the Islamic Republic of Pakistan. Any disputes shall be subject to the exclusive jurisdiction of the courts of Lahore.</p>

    <p style="margin-top:24px">By signing below, both parties confirm they have read, understood, and agreed to the terms set out in this Agreement.</p>

    <div class="signature-block">
      <div class="signature">
        <div class="line">For Convertt Ltd</div>
        <div class="name">Authorised Signatory</div>
      </div>
      <div class="signature">
        <div class="line">Employee</div>
        <div class="name">${escapeHtml(emp.fullName)}</div>
      </div>
    </div>
  `
  return { html: wrap('Employment Agreement', body), title: `Employment Agreement - ${emp.fullName}` }
}

function nda({ emp }: Ctx) {
  const body = `
    <div class="doc-title">Non-Disclosure Agreement</div>
    <p>This Non-Disclosure Agreement (the "Agreement") is entered into between <strong>Convertt Ltd</strong> ("the Company") and <strong>${escapeHtml(emp.fullName)}</strong>${emp.cnic ? ` (CNIC ${escapeHtml(emp.cnic)})` : ''} ("the Recipient"), effective from ${fmtDate(emp.joiningDate ?? new Date())}.</p>

    <h3 style="font-size:12pt">1. Confidential Information</h3>
    <p>"Confidential Information" includes but is not limited to: client lists and contact details, business strategies and forecasts, financial information, source code, designs, technical know-how, employee compensation, internal processes, and any information marked confidential or that a reasonable person would understand to be confidential.</p>

    <h3 style="font-size:12pt">2. Obligations</h3>
    <ol>
      <li>The Recipient shall hold all Confidential Information in strict confidence and not disclose it to any third party without the Company's prior written consent.</li>
      <li>The Recipient shall use Confidential Information solely for performing their duties at the Company.</li>
      <li>The Recipient shall not copy, reproduce, or store Confidential Information except as required for legitimate work purposes.</li>
      <li>Upon termination of employment, the Recipient shall return or destroy all Confidential Information and certify such return/destruction in writing.</li>
    </ol>

    <h3 style="font-size:12pt">3. Intellectual Property</h3>
    <p>All work product, inventions, ideas, designs, code, and creative output developed by the Recipient in the course of employment shall be the exclusive property of Convertt Ltd. The Recipient hereby assigns all such rights to the Company.</p>

    <h3 style="font-size:12pt">4. Duration</h3>
    <p>The obligations set out in this Agreement shall survive the termination of the Recipient's employment with the Company and shall remain in effect indefinitely.</p>

    <h3 style="font-size:12pt">5. Remedies</h3>
    <p>The Recipient acknowledges that any breach of this Agreement may cause irreparable harm to the Company, and the Company shall be entitled to seek injunctive relief in addition to any other remedies available at law.</p>

    <h3 style="font-size:12pt">6. Governing Law</h3>
    <p>This Agreement is governed by the laws of Pakistan and any disputes shall be subject to the exclusive jurisdiction of the courts of Lahore.</p>

    <div class="signature-block">
      <div class="signature">
        <div class="line">For Convertt Ltd</div>
        <div class="name">Authorised Signatory</div>
      </div>
      <div class="signature">
        <div class="line">Recipient</div>
        <div class="name">${escapeHtml(emp.fullName)}</div>
      </div>
    </div>
  `
  return { html: wrap('NDA', body), title: `NDA - ${emp.fullName}` }
}

function showCauseNotice({ emp, extras }: Ctx) {
  const responseDays = extras.responseWindowDays ?? 7
  const responseBy = new Date(); responseBy.setDate(responseBy.getDate() + responseDays)
  const concerns = extras.concerns ?? '[Specific concerns / alleged conduct to be inserted by HR — e.g. repeated unauthorised absences, failure to meet performance expectations after coaching, breach of policy X on Y date, etc.]'

  const body = `
    <div class="doc-title">Show Cause Notice</div>
    <p><strong>To:</strong> ${escapeHtml(emp.fullName)}, ${escapeHtml(emp.designation)}, ${escapeHtml(emp.department?.name ?? '—')} (Employee ID: ${escapeHtml(emp.employeeCode)})</p>
    <p><strong>Subject: Show Cause Notice</strong></p>
    <p>Dear ${escapeHtml(emp.fullName)},</p>
    <p>This letter serves as a formal notice to show cause as to why disciplinary action, up to and including termination of employment, should not be taken against you in respect of the following matter(s):</p>
    <div style="background:#fef3c7;border-left:4px solid #d97706;padding:14px 18px;margin:14px 0;border-radius:0 4px 4px 0">
      <p style="margin:0;white-space:pre-line">${escapeHtml(concerns)}</p>
    </div>
    <p>The conduct described above is in violation of the Company's policies and your Employment Agreement, and is considered a serious matter.</p>
    <p>You are required to submit a written response to this notice within <strong>${responseDays} (${responseDays === 7 ? 'seven' : responseDays === 3 ? 'three' : responseDays}) working days</strong> from the date of receipt of this letter, i.e. on or before <strong>${fmtDate(responseBy)}</strong>, explaining your position on the above and setting out any mitigating circumstances you wish to be considered.</p>
    <p>Failure to respond within the stipulated time, or an unsatisfactory response, may result in further action being taken without further notice.</p>
    <p>This notice is issued without prejudice to any other rights the Company may have under the Employment Agreement and applicable law.</p>
    <div class="signature-block">
      <div class="signature">
        <div class="line">Issued by</div>
        <div class="name">People Operations · Convertt Ltd</div>
      </div>
      <div class="signature">
        <div class="line">Acknowledged by Employee</div>
        <div class="name">${escapeHtml(emp.fullName)}</div>
      </div>
    </div>
  `
  return { html: wrap('Show Cause Notice', body), title: `Show Cause Notice - ${emp.fullName}` }
}

function noticePeriodLetter({ emp, extras }: Ctx) {
  const lastDay = extras.lastWorkingDay
    ? new Date(extras.lastWorkingDay)
    : (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d })()

  const body = `
    <div class="doc-title">Notice Period Confirmation</div>
    <p><strong>To:</strong> ${escapeHtml(emp.fullName)}, ${escapeHtml(emp.designation)}</p>
    <p>Dear ${escapeHtml(emp.fullName)},</p>
    <p>This letter is to formally confirm that your notice period at Convertt Ltd has commenced effective <strong>${fmtDate(new Date())}</strong>, in accordance with Clause 8 of your Employment Agreement and Convertt's standard one (1) month notice policy.</p>
    <p>Your <strong>last working day</strong> with Convertt Ltd shall be <strong>${fmtDate(lastDay)}</strong>.</p>
    <p>During the notice period, you are expected to:</p>
    <ol>
      <li>Continue performing all assigned duties professionally and to your usual standard.</li>
      <li>Coordinate with your reporting manager to ensure a complete handover of responsibilities, ongoing projects, and any pending deliverables.</li>
      <li>Return all company property, including (but not limited to) laptop, ID card, access keys, and any other equipment, on or before your last working day.</li>
      <li>Complete the Exit Clearance Form and Exit Interview with HR before departure.</li>
      <li>Continue to abide by the confidentiality and intellectual-property obligations set out in your Non-Disclosure Agreement, which survive termination of employment.</li>
    </ol>
    <p>Your final payslip and Full &amp; Final (F&amp;F) settlement, including any unused leave encashment and pending dues, shall be processed and disbursed within the agreed window post-departure.</p>
    <p>We thank you for your contributions to Convertt and wish you the best in your future endeavours.</p>
    <p>Warm regards,</p>
    <div class="signature-block">
      <div class="signature">
        <div class="line">For Convertt Ltd</div>
        <div class="name">People Operations</div>
      </div>
      <div class="signature">
        <div class="line">Acknowledged by Employee</div>
        <div class="name">${escapeHtml(emp.fullName)}</div>
      </div>
    </div>
  `
  return { html: wrap('Notice Period Letter', body), title: `Notice Period - ${emp.fullName}` }
}

function terminationLetter({ emp, extras }: Ctx) {
  // Structure taken from the issued sample: a Subject/Date/To/Designation/CNIC
  // header block, a reasoned narrative that references the Show Cause Notice,
  // the "Accordingly..." effective-date sentence, five fixed numbered
  // obligations, the fixed regret closing, and a HR Team sign-off — this letter
  // does not go out over the Director's name.
  const effective = extras.effectiveDate ? new Date(extras.effectiveDate) : new Date()
  const showCause = extras.showCauseDate ? new Date(String(extras.showCauseDate)) : null
  const reason = extras.terminationReason
    ? String(extras.terminationReason)
    : 'your attendance, professional conduct, and performance'

  const body = `
    <div class="doc-title">Subject: Termination of Employment</div>
    <table class="kv">
      <tr><td>Date</td><td>${fmtDate(new Date())}</td></tr>
      <tr><td>To</td><td>${escapeHtml(emp.fullName)}</td></tr>
      <tr><td>Designation</td><td>${escapeHtml(emp.designation ?? '—')}</td></tr>
      <tr><td>CNIC</td><td>${escapeHtml(emp.cnic ?? '')}</td></tr>
    </table>
    <p>Dear ${escapeHtml(emp.fullName)},</p>
    <p>${showCause ? `Following the Show Cause Notice dated ${fmtDate(showCause)} issued to you regarding ${escapeHtml(reason)}, and after` : `Following a review of ${escapeHtml(reason)}, and after`} careful review of the circumstances, including your failure to adhere to company policies, the Company has determined that your continuation of employment is no longer viable.</p>
    <p>Your overall performance has not met the standards expected for your role. Your lack of adherence to company protocols, combined with unsatisfactory performance and limited engagement with assigned responsibilities, has raised serious concerns regarding your commitment, reliability, and alignment with organizational expectations. Despite being given an opportunity to explain your position, the concerns remain unresolved.</p>
    <p>Accordingly, your employment is terminated effective ${fmtDate(effective)}, in line with your contract and applicable labor laws.</p>
    <p>Please note the following important points:</p>
    <ol>
      <li><strong>Final Settlement:</strong> You will receive all outstanding salary and benefits accrued up until your last working day, in accordance with the terms of your employment agreement.</li>
      <li><strong>Company Property:</strong> All company assets in your possession, including documents, devices, files and credentials, must be returned by your last working day.</li>
      <li><strong>Confidentiality &amp; Reputation Obligations:</strong> You remain bound by the confidentiality provisions of your employment contract even after your departure. This includes any proprietary or confidential information related to the Company, its clients, employees, and operations.</li>
      <li><strong>Non-Disparagement:</strong> You are reminded of your obligation to refrain from making any negative or disparaging statements, whether verbal, written, or on social media, that may harm the reputation or interests of the Company. Any violation of this obligation could result in legal action under relevant labor, civil and cybercrime laws.</li>
      <li><strong>Exit Process:</strong> Please liaise with the HR department to complete the necessary clearance formalities and receive your final settlement.</li>
    </ol>
    <p>We regret that the circumstances have led to this outcome and thank you for your time with the Company. We wish you the best of luck in your future professional endeavors.</p>
  `
  return {
    html: wrap('Termination Letter', body, { name: 'HR Team', title: 'Convertt', above: 'Sincerely,' }),
    title: `Termination Letter - ${emp.fullName}`,
  }
}

function experienceLetter({ emp, extras }: Ctx) {
  // Structure taken from the issued sample: certify line naming CNIC and both
  // dates, a role narrative, a support-duties paragraph that always carries the
  // "AI-integrated initiatives" phrasing Convertt uses deliberately, the fixed
  // professionalism line, then the fixed closing. Name and position are bold in
  // the certify line, everything else regular.
  const lastDay = extras.effectiveDate ? new Date(extras.effectiveDate) : emp.exitDate ?? new Date()
  const female = (emp.gender ?? '').toUpperCase().startsWith('F')
  const he = female ? 'she' : 'he'
  const He = female ? 'She' : 'He'
  const his = female ? 'her' : 'his'
  const role = emp.designation ?? 'team member'

  const body = `
    <div class="doc-title">Subject: Experience Letter</div>
    <p>This is to certify that <strong>${escapeHtml(emp.fullName)}</strong>${emp.cnic ? `, CNIC ${escapeHtml(emp.cnic)}` : ''} was employed at Convertt as a <strong>${escapeHtml(role)}</strong> from ${emp.joiningDate ? fmtDate(emp.joiningDate) : '—'} to ${fmtDate(lastDay)}.</p>
    <p>During ${his} tenure, ${he} carried the responsibilities of ${escapeHtml(role)}${emp.department?.name ? ` within the ${escapeHtml(emp.department.name)} function` : ''}, working directly with the team and with clients to translate objectives into delivered work. ${He} owned ${his} area end to end, from planning through execution, and was accountable for the quality and timeliness of what was shipped.</p>
    <p>Alongside that delivery, ${he} guided colleagues, maintained standards and documentation across projects, and contributed to employer branding along with AI-integrated initiatives.</p>
    <p>${He} demonstrated professionalism, strong organizational skills, and attention to detail throughout ${his} role.</p>
    <p>We appreciate ${his} contributions and wish ${his} continued success in ${his} future endeavors.</p>
  `
  return { html: wrap('Experience Letter', body), title: `Experience letter - ${emp.fullName}` }
}

function confirmationLetter({ emp }: Ctx) {
  const confirmDate = emp.confirmationDate ?? new Date()
  const body = `
    <div class="doc-title">Confirmation of Employment</div>
    <p>Dear <strong>${escapeHtml(emp.fullName)}</strong>,</p>
    <p>We are pleased to confirm that following the successful completion of your three (3)-month probation period, your employment with <strong>Convertt Ltd</strong> as <strong>${escapeHtml(emp.designation)}</strong> in the <strong>${escapeHtml(emp.department?.name ?? '—')}</strong> department is hereby <strong>confirmed</strong>, effective <strong>${fmtDate(confirmDate)}</strong>.</p>
    <p>All other terms and conditions of your Employment Agreement remain unchanged. From this date forward, the standard one (1) month notice period applies for both parties.</p>
    <p>Congratulations and we look forward to your continued contributions to Convertt.</p>
    <p>Warm regards,</p>
    <div class="signature-block">
      <div class="signature">
        <div class="line">For Convertt Ltd</div>
        <div class="name">People Operations</div>
      </div>
      <div class="signature">
        <div class="line">Acknowledged by Employee</div>
        <div class="name">${escapeHtml(emp.fullName)}</div>
      </div>
    </div>
  `
  return { html: wrap('Confirmation Letter', body), title: `Confirmation Letter - ${emp.fullName}` }
}

function exitClearanceForm({ emp, extras }: Ctx) {
  const lastDay = extras.lastWorkingDay ? new Date(extras.lastWorkingDay) : (emp.exitDate ?? new Date())
  const body = `
    <div class="doc-title">Exit Clearance Form</div>
    <table class="kv">
      <tr><td>Employee Name</td><td>${escapeHtml(emp.fullName)}</td></tr>
      <tr><td>Employee ID</td><td>${escapeHtml(emp.employeeCode)}</td></tr>
      <tr><td>Designation</td><td>${escapeHtml(emp.designation)}</td></tr>
      <tr><td>Department</td><td>${escapeHtml(emp.department?.name ?? '—')}</td></tr>
      <tr><td>Date of Joining</td><td>${emp.joiningDate ? fmtDate(emp.joiningDate) : '—'}</td></tr>
      <tr><td>Last Working Day</td><td>${fmtDate(lastDay)}</td></tr>
    </table>
    <p>The following clearances must be obtained from each department before the F&amp;F settlement is released.</p>
    <table class="compact">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="text-align:left;padding:8px 10px">Department</th>
          <th style="text-align:left;padding:8px 10px">Item / Pending</th>
          <th style="text-align:left;padding:8px 10px">Status</th>
          <th style="text-align:left;padding:8px 10px">Signature / Date</th>
        </tr>
      </thead>
      <tbody>
        <tr><td><strong>IT</strong></td><td>Laptop returned, ID card, access keys, peripherals, software licence reassignment</td><td>☐ Cleared</td><td>&nbsp;</td></tr>
        <tr><td><strong>IT</strong></td><td>Email + system access revoked (Slack, code repos, internal tools)</td><td>☐ Cleared</td><td>&nbsp;</td></tr>
        <tr><td><strong>Manager</strong></td><td>Knowledge transfer completed · successor identified</td><td>☐ Cleared</td><td>&nbsp;</td></tr>
        <tr><td><strong>Manager</strong></td><td>Pending tasks / open projects documented</td><td>☐ Cleared</td><td>&nbsp;</td></tr>
        <tr><td><strong>Finance</strong></td><td>Outstanding advances / loans / claims settled</td><td>☐ Cleared</td><td>&nbsp;</td></tr>
        <tr><td><strong>Finance</strong></td><td>F&amp;F amount calculated &amp; communicated</td><td>☐ Cleared</td><td>&nbsp;</td></tr>
        <tr><td><strong>HR</strong></td><td>Exit Interview conducted</td><td>☐ Cleared</td><td>&nbsp;</td></tr>
        <tr><td><strong>HR</strong></td><td>NDA re-acknowledged · Experience Letter issued</td><td>☐ Cleared</td><td>&nbsp;</td></tr>
      </tbody>
    </table>
    <p style="margin-top:18px"><strong>I confirm</strong> that I have returned all company property and completed all clearances above. I acknowledge that any unreturned items or undocumented pending work may be deducted from my F&amp;F settlement.</p>
    <div class="signature-block">
      <div class="signature">
        <div class="line">Employee</div>
        <div class="name">${escapeHtml(emp.fullName)}</div>
      </div>
      <div class="signature">
        <div class="line">HR Authorised Signatory</div>
        <div class="name">People Operations</div>
      </div>
    </div>
  `
  return { html: wrap('Exit Clearance Form', body), title: `Exit Clearance - ${emp.fullName}` }
}

function exitInterviewForm({ emp, extras }: Ctx) {
  const lastDay = extras.lastWorkingDay ? new Date(extras.lastWorkingDay) : (emp.exitDate ?? new Date())
  const body = `
    <div class="doc-title">Exit Interview Form</div>
    <table class="kv">
      <tr><td>Employee Name</td><td>${escapeHtml(emp.fullName)}</td></tr>
      <tr><td>Employee ID</td><td>${escapeHtml(emp.employeeCode)}</td></tr>
      <tr><td>Designation</td><td>${escapeHtml(emp.designation)}</td></tr>
      <tr><td>Department</td><td>${escapeHtml(emp.department?.name ?? '—')}</td></tr>
      <tr><td>Last Working Day</td><td>${fmtDate(lastDay)}</td></tr>
      <tr><td>Interview Conducted By</td><td>______________________________</td></tr>
      <tr><td>Interview Date</td><td>______________________________</td></tr>
    </table>
    <p style="font-style:italic;color:#64748b">All responses are confidential and used to improve the workplace.</p>

    <h3 style="font-size:12pt;margin-top:18px">1. Reason for Leaving</h3>
    <p>Please describe your primary reason(s) for leaving Convertt:</p>
    <div style="border:1px solid #cbd5e1;min-height:64px;padding:8px;border-radius:4px"></div>

    <h3 style="font-size:12pt">2. Job Role &amp; Responsibilities</h3>
    <p>How well did your role match the expectations set during hiring?</p>
    <div style="border:1px solid #cbd5e1;min-height:48px;padding:8px;border-radius:4px"></div>

    <h3 style="font-size:12pt">3. Manager &amp; Team</h3>
    <p>How would you describe working with your manager and team?</p>
    <div style="border:1px solid #cbd5e1;min-height:48px;padding:8px;border-radius:4px"></div>

    <h3 style="font-size:12pt">4. Company Culture &amp; Environment</h3>
    <p>What did you enjoy most? What would you change?</p>
    <div style="border:1px solid #cbd5e1;min-height:48px;padding:8px;border-radius:4px"></div>

    <h3 style="font-size:12pt">5. Compensation &amp; Benefits</h3>
    <p>Were you satisfied with your compensation and benefits package?</p>
    <div style="border:1px solid #cbd5e1;min-height:48px;padding:8px;border-radius:4px"></div>

    <h3 style="font-size:12pt">6. Career Growth</h3>
    <p>Did you feel you had opportunities for growth at Convertt?</p>
    <div style="border:1px solid #cbd5e1;min-height:48px;padding:8px;border-radius:4px"></div>

    <h3 style="font-size:12pt">7. Would You Recommend Convertt?</h3>
    <p>Would you recommend Convertt as a workplace to others?  ☐ Yes  ☐ Maybe  ☐ No</p>
    <p>Why or why not?</p>
    <div style="border:1px solid #cbd5e1;min-height:48px;padding:8px;border-radius:4px"></div>

    <h3 style="font-size:12pt">8. Suggestions for Improvement</h3>
    <p>Any additional feedback or suggestions for Convertt?</p>
    <div style="border:1px solid #cbd5e1;min-height:64px;padding:8px;border-radius:4px"></div>

    <div class="signature-block">
      <div class="signature">
        <div class="line">Employee</div>
        <div class="name">${escapeHtml(emp.fullName)}</div>
      </div>
      <div class="signature">
        <div class="line">HR Interviewer</div>
        <div class="name">People Operations</div>
      </div>
    </div>
  `
  return { html: wrap('Exit Interview Form', body), title: `Exit Interview - ${emp.fullName}` }
}

/**
 * Relieving certificate — the short confirmation that the person has been
 * released and has no pending obligations. Deliberately separate from the
 * experience letter: that one describes the role and tenure for a future
 * employer, this one only confirms the release, and exit processes routinely
 * need to issue one without the other.
 */
function relievingCertificate({ emp, extras }: Ctx) {
  // Wording taken line-for-line from the issued sample (Relieving Certificate -
  // Ali Shan): certify line, relieved-from-duties line, a role narrative, then
  // the fixed closing. The sample repeats its final sentence twice; that is a
  // defect in the source document and is not reproduced.
  const lastDay = extras.effectiveDate ? new Date(extras.effectiveDate) : new Date()
  const female = (emp.gender ?? '').toUpperCase().startsWith('F')
  const He = female ? 'She' : 'He'
  const his = female ? 'her' : 'his'
  const him = female ? 'her' : 'him'
  const honorific = female ? 'Miss' : 'Mr.'
  const who = `${honorific} ${emp.fullName}`

  const body = `
    <div class="doc-title">Subject: Relieving Certificate</div>
    <p>This is to certify that <strong>${escapeHtml(who)}</strong> was employed with Convertt as a <strong>${escapeHtml(emp.designation ?? '—')}</strong> from ${emp.joiningDate ? fmtDate(emp.joiningDate) : '—'} to ${fmtDate(lastDay)}.</p>
    <p>${He} was relieved from ${his} duties effective ${fmtDate(lastDay)}, upon completion of ${his} tenure with the organization.</p>
    <p>During ${his} employment, ${escapeHtml(who)} was responsible for the duties of ${escapeHtml(emp.designation ?? 'the role')}${emp.department?.name ? ` within the ${escapeHtml(emp.department.name)} team` : ''}, carrying out assigned responsibilities to the standards expected of the position.</p>
    <p>${escapeHtml(who)} consistently exhibited dedication, professionalism, and attention to detail. ${He === 'He' ? 'His' : 'Her'} ability to meet deadlines and perform efficiently under pressure was commendable. We thank ${him} for ${his} valuable contributions to the organization and wish ${him} every success in ${his} future endeavors.</p>
  `
  return { html: wrap('Relieving Certificate', body), title: `Relieving Certificate - ${emp.fullName}` }
}

function terminationEmail({ emp, extras }: Ctx) {
  const lastDay = extras.effectiveDate ? new Date(extras.effectiveDate) : new Date()
  const reason = extras.terminationReason ? String(extras.terminationReason) : null
  const body = `
    <div class="doc-title">Termination Email</div>
    <table class="kv">
      <tr><td>To</td><td>${escapeHtml(emp.email ?? '—')}</td></tr>
      <tr><td>From</td><td>People Operations, Convertt Ltd</td></tr>
      <tr><td>Subject</td><td>Termination of Employment — ${escapeHtml(emp.fullName)}</td></tr>
    </table>
    <p>Dear ${escapeHtml(emp.fullName)},</p>
    <p>Further to our discussions, this email confirms that your employment with Convertt Ltd as <strong>${escapeHtml(emp.designation ?? '—')}</strong> will end on <strong>${fmtDate(lastDay)}</strong>.${reason ? ` The reason recorded is: ${escapeHtml(reason)}.` : ''}</p>
    <p>The formal termination letter is attached. Please complete the exit clearance form and return all company assets on or before your last working day. Your final settlement will be processed once clearance is complete.</p>
    <p>You are asked to make yourself available for a short exit interview with HR before you leave.</p>
    <p>We thank you for your contribution and wish you well.</p>
    <div class="signature-block">
      <div class="signature">
        <div class="line">People Operations</div>
        <div class="name">Convertt Ltd</div>
      </div>
    </div>
  `
  return { html: wrap('Termination Email', body), title: `Termination Email - ${emp.fullName}` }
}
