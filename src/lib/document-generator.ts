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
  // Show Cause
  concerns?: string              // free-text allegations
  responseWindowDays?: number    // typically 3–7
  // Notice Period
  lastWorkingDay?: string        // ISO date
  // Termination
  terminationReason?: string
  fnfAmount?: number
  // Experience letter
  // (nothing extra — uses joiningDate + exitDate)
}

const fmtMoney = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`
const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

// ─── Shared HTML chrome ──────────────────────────────────────────────────────

function wrap(title: string, body: string): string {
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
    font-family: Roboto, 'Segoe UI', Arial, sans-serif;
    color: #1a1a1a; margin: 0; padding: 24px; background: #f1f5f9; font-size: 12pt;
  }
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
  .logo { font-size: 26pt; font-weight: 700; letter-spacing: .04em; color: #0f172a; }
  .logo span { color: #0857E5; }
  .addr { text-align: right; font-size: 10.5pt; line-height: 1.45; color: #1a1a1a; }
  .letter-date { font-size: 11pt; margin: 0 0 18pt; }
  .doc-title { font-size: 13pt; font-weight: 700; margin: 0 0 18pt; }
  p { font-size: 12pt; line-height: 16.5pt; margin: 0 0 12pt; text-align: left; }
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
  @media print {
    body { background: #fff; padding: 0; }
    .doc { width: auto; min-height: auto; box-shadow: none; margin: 0; }
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
      <div class="logo">CONVER<span>TT</span></div>
      <div class="addr">
        Mega Tower 5th floor, Office #201<br>
        Gulberg Lahore, Pakistan<br>
        +92 42 37458015<br>
        +1 (716) 980-7724
      </div>
    </div>
    <div class="letter-date">${fmtDate(new Date())}</div>
    ${body}
    <div class="sign-off">
      <div class="name">Syed Khawer</div>
      <div class="title">Director Administration</div>
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

function offerLetter({ emp, extras }: Ctx) {
  const salary = emp.salary
  const gross = salary
    ? salary.basic + salary.houseRent + salary.utilities + salary.food + salary.fuel + salary.medicalAllowance + salary.otherAllowance
    : 0
  const startDate = extras.effectiveDate ? new Date(extras.effectiveDate) : emp.joiningDate ?? new Date()
  const reportingTo = extras.reportingTo ?? emp.reportingManager?.fullName ?? '[Reporting Manager]'

  const body = `
    <div class="doc-title">Letter of Offer</div>
    <p>Dear <strong>${escapeHtml(emp.fullName)}</strong>,</p>
    <p>We are pleased to extend this offer of employment to you for the position of <strong>${escapeHtml(emp.designation)}</strong> in our <strong>${escapeHtml(emp.department?.name ?? '—')}</strong> department at Convertt Ltd. Subject to your acceptance, the terms of your employment are summarised below:</p>
    <table class="kv">
      <tr><td>Position</td><td>${escapeHtml(emp.designation)}</td></tr>
      <tr><td>Department</td><td>${escapeHtml(emp.department?.name ?? '—')}</td></tr>
      <tr><td>Employment Type</td><td>${escapeHtml(emp.employeeType ?? 'Permanent')}</td></tr>
      <tr><td>Reporting To</td><td>${escapeHtml(reportingTo)}</td></tr>
      <tr><td>Date of Joining</td><td>${fmtDate(startDate)}</td></tr>
      <tr><td>Work Location</td><td>${escapeHtml(emp.workLocation ?? 'Lahore Office')}</td></tr>
      <tr><td>Working Hours</td><td>${escapeHtml(emp.timings ?? '10:00 AM – 7:00 PM, Monday to Friday')}</td></tr>
      <tr><td>Gross Monthly Salary</td><td>${gross > 0 ? fmtMoney(gross) : '[Salary]'} (full breakdown attached in the Employment Agreement)</td></tr>
      <tr><td>Probation Period</td><td>Three (3) months from joining date</td></tr>
    </table>
    <p>This offer is contingent on successful background verification and the signing of the standard Convertt Employment Agreement and Non-Disclosure Agreement on or before your joining date.</p>
    <p>Please confirm your acceptance by counter-signing this letter and returning it to HR. We look forward to welcoming you to Convertt.</p>
    <p>Warm regards,</p>
    <div class="signature-block">
      <div class="signature">
        <div class="line">For Convertt Ltd</div>
        <div class="name">People Operations</div>
      </div>
      <div class="signature">
        <div class="line">Accepted &amp; Agreed</div>
        <div class="name">${escapeHtml(emp.fullName)}</div>
      </div>
    </div>
  `
  return { html: wrap('Offer Letter', body), title: `Offer Letter - ${emp.fullName}` }
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
  const lastDay = extras.lastWorkingDay
    ? new Date(extras.lastWorkingDay)
    : new Date()
  const reason = extras.terminationReason ?? '[Reason — e.g. failure to meet performance standards following written warning, breach of policy, etc.]'
  const fnf = extras.fnfAmount

  const body = `
    <div class="doc-title">Termination of Employment</div>
    <p><strong>To:</strong> ${escapeHtml(emp.fullName)}, ${escapeHtml(emp.designation)} (Employee ID: ${escapeHtml(emp.employeeCode)})</p>
    <p>Dear ${escapeHtml(emp.fullName)},</p>
    <p>This letter serves as formal notification that your employment with Convertt Ltd is hereby terminated, effective <strong>${fmtDate(lastDay)}</strong>.</p>
    <p>The decision to terminate has been made for the following reason(s):</p>
    <div style="background:#fee2e2;border-left:4px solid #b91c1c;padding:14px 18px;margin:14px 0;border-radius:0 4px 4px 0">
      <p style="margin:0;white-space:pre-line">${escapeHtml(reason)}</p>
    </div>
    <p>This decision follows the prior Show Cause Notice and review of your response. The Company has determined that continued employment is no longer tenable.</p>
    <p>You are required to:</p>
    <ol>
      <li>Return all company property — laptop, ID card, access keys, and any other equipment — to IT on or before your last working day.</li>
      <li>Complete the Exit Clearance Form with all relevant department sign-offs.</li>
      <li>Continue to honour your confidentiality and intellectual-property obligations under your Non-Disclosure Agreement, which survive termination.</li>
    </ol>
    ${fnf != null ? `<p>Your Full &amp; Final (F&amp;F) settlement of <strong>${fmtMoney(fnf)}</strong> shall be processed and disbursed within 30 days from the date of separation, subject to clearance of all assets and dues.</p>` : '<p>Your Full &amp; Final (F&amp;F) settlement shall be processed and disbursed within 30 days from the date of separation, subject to clearance of all assets and dues.</p>'}
    <p>You may collect your experience letter from HR after completing the exit clearance process.</p>
    <div class="signature-block">
      <div class="signature">
        <div class="line">For Convertt Ltd</div>
        <div class="name">Authorised Signatory · People Operations</div>
      </div>
      <div class="signature">
        <div class="line">Received by Employee</div>
        <div class="name">${escapeHtml(emp.fullName)}</div>
      </div>
    </div>
  `
  return { html: wrap('Termination Letter', body), title: `Termination Letter - ${emp.fullName}` }
}

function experienceLetter({ emp }: Ctx) {
  const start = emp.joiningDate ?? new Date()
  const end = emp.exitDate ?? new Date()
  const months = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)))
  const years = (months / 12).toFixed(1)
  const tenureLabel = months < 12
    ? `${months} month${months > 1 ? 's' : ''}`
    : `${years} year${parseFloat(years) > 1 ? 's' : ''} (${months} months)`

  const body = `
    <div class="doc-title">Experience Letter</div>
    <p>To Whom It May Concern,</p>
    <p>This is to certify that <strong>${escapeHtml(emp.fullName)}</strong>${emp.cnic ? ` (CNIC ${escapeHtml(emp.cnic)})` : ''} was associated with <strong>Convertt Ltd</strong> as <strong>${escapeHtml(emp.designation)}</strong> in the <strong>${escapeHtml(emp.department?.name ?? '—')}</strong> department from <strong>${fmtDate(start)}</strong> to <strong>${fmtDate(end)}</strong>, a total duration of <strong>${tenureLabel}</strong>.</p>
    <p>During the tenure with us, ${escapeHtml(emp.fullName.split(' ')[0])} demonstrated strong commitment to the responsibilities assigned and made valuable contributions to the team. Their conduct throughout the period of employment was professional and to our satisfaction.</p>
    <p>We wish ${escapeHtml(emp.fullName.split(' ')[0])} the very best in all future endeavours.</p>
    <p>This certificate has been issued on request for whatever purpose it may serve.</p>
    <div class="signature-block">
      <div class="signature">
        <div class="line">For Convertt Ltd</div>
        <div class="name">Authorised Signatory · People Operations</div>
      </div>
      <div class="signature">
        <div class="line">Date</div>
        <div class="name">${fmtDate(new Date())}</div>
      </div>
    </div>
  `
  return { html: wrap('Experience Letter', body), title: `Experience Letter - ${emp.fullName}` }
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
