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
import { LOGO_DATA_URI } from '@/lib/brand-logo'
import { LETTERHEAD_ADDRESS_LINES } from '@/lib/brand'

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
  // Offer letter — every field the builder can edit. Absent means "use the
  // value on the employee record".
  reportingTo?: string
  probationMonths?: number       // Employment letter — defaults to 3
  designation?: string           // override the role named in the letter
  cnic?: string
  city?: string
  grossSalary?: number           // override the salary from the record
  conveyance?: number            // conveyance allowance, defaults to 5000
  noticeConfirmed?: string       // e.g. "two (2) months" — overrides the Playbook default
  benefits?: string              // free-text benefits line, overrides the default
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

/**
 * 'letter' is the measured company letterhead — gradient bars, 12pt serif body.
 * 'form'  is for things people fill in rather than read: no bars (a fill-in
 *          form is not correspondence), smaller type, tighter spacing, so an
 *          eight-question interview fits on a page or two instead of five.
 */
type DocVariant = 'letter' | 'form'

interface WrapMeta {
  employeeId?: string; docType?: string; edited?: boolean
  /** Suppress the default single company sign-off — for letters that carry
   *  their own dual (employee + company) acceptance block in the body. */
  noSignOff?: boolean
}

function wrap(
  title: string,
  body: string,
  signatory: Signatory = DEFAULT_SIGNATORY,
  variant: DocVariant = 'letter',
  meta: WrapMeta = {},
): string {
  const isForm = variant === 'form'
  const canSave = !!(meta.employeeId && meta.docType)
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
    padding: ${isForm ? '32pt 46pt 40pt' : '46pt 60pt 60pt'};
    box-shadow: 0 1px 4px rgba(0,0,0,.12);
  }
  /* ~12.8pt tall, inset ~29pt from each side, top and bottom of the page. */
  .doc::before, .doc::after {
    content: ''; position: absolute; left: 29pt; right: 29pt; height: 12.8pt;
    background: linear-gradient(90deg, #0857E5 0%, #277FB1 100%);
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    ${isForm ? 'display: none;' : ''}
  }
  .doc::before { top: 0; }
  .doc::after  { bottom: 0; }
  .letterhead { display: flex; justify-content: space-between; align-items: flex-start; margin: 18pt 0 30pt; }
  /* Convertt's actual mark. This was a text wordmark with the last two letters
     coloured blue — a guess at the logo that was never the logo. */
  /* 26pt was the height of the old logo file, whose artwork sat inside 6px of
     padding — so the mark itself printed 21.85pt tall. The Playbook artwork is
     trimmed tight, so 27.3pt of canvas reproduces that same 21.85pt mark. */
  .logo img { height: 27.3pt; display: block; }
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
  /* Dual acceptance block — employee on the left, company on the right, the
     way a signed-and-returned offer letter closes. */
  .sig-grid { width: 100%; margin-top: 46pt; border-collapse: collapse; }
  .sig-grid td { width: 50%; vertical-align: bottom; padding: 0 18pt; }
  .sig-grid td:first-child { padding-left: 0; }
  .sig-grid td:last-child { padding-right: 0; }
  .sig-line { border-top: 1px solid #1a1a1a; margin-bottom: 5pt; }
  .sig-name { font-size: 11.5pt; font-weight: 700; }
  .sig-role { font-size: 9.5pt; color: #1a1a1a; }
  .sig-date { font-size: 9.5pt; color: #475569; margin-top: 8pt; }
  /* ── E-signature ─────────────────────────────────────────────────────────
     A slot the signer clicks to draw a signature. It sits just above the
     signature line, so a drawn mark reads as sitting on the line. Empty slots
     show a faint "Click to sign" that never prints. */
  .esign-slot { height: 40pt; display: flex; align-items: flex-end; cursor: pointer; }
  .esign-slot img { max-height: 40pt; max-width: 100%; }
  .esign-slot .esign-hint {
    font-family: 'Segoe UI', Arial, sans-serif; font-size: 8.5pt; color: #94a3b8;
    border: 1px dashed #cbd5e1; border-radius: 4px; padding: 3px 8px;
  }
  .esign-slot.signed { cursor: default; }
  /* Modal — screen only. */
  .esign-modal {
    display: none; position: fixed; inset: 0; z-index: 50;
    background: rgba(15,23,42,.55); align-items: center; justify-content: center;
    font-family: 'Segoe UI', Arial, sans-serif;
  }
  .esign-modal.open { display: flex; }
  .esign-card { background: #fff; border-radius: 12px; padding: 18px; width: 460px; max-width: 92vw; }
  .esign-card h3 { margin: 0 0 4px; font-size: 15px; color: #0f172a; }
  .esign-card p { margin: 0 0 12px; font-size: 12px; color: #64748b; }
  .esign-pad { border: 1px solid #cbd5e1; border-radius: 8px; width: 100%; height: 170px; touch-action: none; background: #fff; }
  .esign-actions { display: flex; justify-content: space-between; margin-top: 12px; gap: 8px; }
  .esign-actions button { padding: 8px 14px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font-size: 13px; }
  .esign-actions .primary { background: #0f172a; color: #fff; border-color: #0f172a; }
  @media print { .esign-slot .esign-hint { display: none; } .esign-modal { display: none !important; } }
  /* The write-in boxes on a form. */
  .answer { border: 1px solid #cbd5e1; min-height: 48pt; border-radius: 3px; margin: 0 0 8pt; }
  .answer.tall { min-height: 64pt; }
  .cols { display: block; }

  /* ── Form scale ──────────────────────────────────────────────────────────
     Same face, one step down, and the answer boxes shrink with it. Set as a
     block so a letter is untouched by any of it. */
  ${isForm ? `
  .doc { font-size: 10.5pt; }
  .letterhead { margin: 6pt 0 14pt; }
  .logo img { height: 20pt; }
  .addr { font-size: 8.5pt; line-height: 1.35; }
  .letter-date { font-size: 9.5pt; margin: 0 0 12pt; }
  .doc-title { font-size: 14pt; margin: 0 0 10pt; }
  p { font-size: 10.5pt; line-height: 14pt; margin: 0 0 6pt; }
  h3 { font-size: 11pt !important; margin: 12pt 0 4pt !important; }
  table.kv td { padding: 2pt 0; font-size: 10pt; }
  table.compact td { padding: 4pt 6pt; font-size: 9.5pt; }
  ol, ul { font-size: 10.5pt; line-height: 14pt; }
  .answer { min-height: 34pt !important; }
  .answer.tall { min-height: 46pt !important; }
  .signature-block { margin-top: 22pt; }
  .signature .name { font-size: 11.5pt; }
  .signature .line { font-size: 9pt; }
  /* Two questions per row where they fit, which halves the page count. */
  .cols { display: flex; gap: 14pt; }
  .cols > * { flex: 1 1 0; min-width: 0; }
  ` : ''}
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
    ${canSave && meta.edited ? '<button onclick="revertDraft()">Revert to template</button>' : ''}
    <button class="primary" onclick="window.print()">Print / Save as PDF</button>
    <button onclick="window.close()">Close</button>
    <span class="hint" id="hint">${meta.edited
      ? 'Showing your edited version. Click a signature line to sign, or Edit to change wording.'
      : 'Click a signature line to sign, or Edit to change any wording before printing.'}</span>
  </div>
  <div class="doc" id="doc">
    <div class="letterhead">
      <div class="logo"><img src="${LOGO_DATA_URI}" alt="Convertt"></div>
      <div class="addr">${LETTERHEAD_ADDRESS_LINES.join('<br>')}</div>
    </div>
    <div class="letter-date">${letterDate(new Date())}</div>
    ${body}
    ${meta.noSignOff ? '' : `<div class="sign-off">
      ${signatory.above ? `<p>${escapeHtml(signatory.above)}</p>` : ''}
      <div class="esign-slot" data-esign="${escapeHtml(signatory.name)}"><span class="esign-hint">Click to sign</span></div>
      <div class="name">${escapeHtml(signatory.name)}</div>
      <div class="title">${escapeHtml(signatory.title)}</div>
    </div>`}
  </div>

  <div class="esign-modal" id="esignModal">
    <div class="esign-card">
      <h3>Sign here</h3>
      <p id="esignWho">Draw your signature with the mouse, trackpad or finger.</p>
      <canvas class="esign-pad" id="esignPad"></canvas>
      <div class="esign-actions">
        <button onclick="esignClear()">Clear</button>
        <span style="flex:1"></span>
        <button onclick="esignCancel()">Cancel</button>
        <button class="primary" onclick="esignPlace()">Place signature</button>
      </div>
    </div>
  </div>
<script>
  // Edit in place rather than round-tripping to a form: HR's changes here are
  // wording tweaks on a finished letter, and the printed output is the
  // deliverable, so what you edit is literally what prints.
  var editing = false;
  var SAVE = ${canSave ? JSON.stringify({ employeeId: meta.employeeId, docType: meta.docType }) : 'null'};

  function toggleEdit() {
    editing = !editing;
    var doc = document.getElementById('doc');
    doc.setAttribute('contenteditable', editing ? 'true' : 'false');
    document.body.classList.toggle('editing', editing);
    document.getElementById('editBtn').textContent = editing ? 'Done editing' : 'Edit';
    document.getElementById('hint').textContent = editing
      ? 'Editing — change wording, or click a signature to remove it and sign again.'
      : 'Click Edit to change any wording before printing.';
    // Entering edit mode re-offers "Click to sign" on any emptied slot.
    if (typeof esignRefresh === 'function') esignRefresh();
    if (editing) { doc.focus(); return; }
    // Leaving edit mode is the save. Asking for a second, separate click was
    // how every amendment got lost — the tab gets closed after printing.
    saveDraft();
  }

  function saveDraft() {
    if (!SAVE) return;
    var hint = document.getElementById('hint');
    hint.textContent = 'Saving…';
    fetch('/api/documents/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: SAVE.employeeId,
        docType: SAVE.docType,
        html: document.getElementById('doc').innerHTML,
      }),
    }).then(function (r) {
      hint.textContent = r.ok
        ? 'Saved. Reopening this document shows your version.'
        : 'Could not save — your edits are still on screen, so print before closing.';
    }).catch(function () {
      hint.textContent = 'Could not save — your edits are still on screen, so print before closing.';
    });
  }

  function revertDraft() {
    if (!SAVE) return;
    if (!confirm('Discard your saved edits and go back to the standard template?')) return;
    fetch('/api/documents/draft?employeeId=' + encodeURIComponent(SAVE.employeeId)
      + '&docType=' + encodeURIComponent(SAVE.docType), { method: 'DELETE' })
      .then(function () { location.reload(); });
  }
  window.addEventListener('beforeprint', function () {
    document.getElementById('doc').setAttribute('contenteditable', 'false');
  });

  // ── E-signature ───────────────────────────────────────────────────────────
  // Click a signature slot to draw a signature; it stamps onto the letter and,
  // where saving is on, becomes part of the saved copy. Mouse, trackpad and
  // finger all draw through pointer events, so there is one code path.
  var esignTarget = null, esignDrawing = false, esignDirty = false;

  // Return a slot to its unsigned state — drops any signature and shows the
  // faint "Click to sign" prompt again.
  function esignReset(slot) {
    slot.classList.remove('signed');
    slot.innerHTML = '<span class="esign-hint">Click to sign</span>';
  }
  // Normalise every slot: signed if it holds an image, otherwise show the
  // prompt. Called whenever we enter edit mode so a signature the user deleted
  // by hand (e.g. Backspace) offers "Click to sign" again.
  function esignRefresh() {
    var slots = document.querySelectorAll('.esign-slot');
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].querySelector('img')) { slots[i].classList.add('signed'); }
      else if (!slots[i].querySelector('.esign-hint')) { esignReset(slots[i]); }
      else { slots[i].classList.remove('signed'); }
    }
  }

  function esignSetup() {
    var slots = document.querySelectorAll('.esign-slot');
    for (var i = 0; i < slots.length; i++) {
      slots[i].addEventListener('click', function () {
        // A placed signature is locked while just viewing. Click Edit first;
        // then clicking the signature removes it and restores "Click to sign",
        // so it can be signed again.
        if (this.querySelector('img')) {
          if (!editing) return;
          esignReset(this);
          if (typeof saveDraft === 'function' && SAVE) saveDraft();
          return;
        }
        esignTarget = this;
        var who = this.getAttribute('data-esign') || 'here';
        document.getElementById('esignWho').textContent =
          'Signing as ' + who + '. Draw with the mouse, trackpad or finger.';
        openEsign();
      });
    }
  }

  function openEsign() {
    var m = document.getElementById('esignModal');
    m.classList.add('open');
    var c = document.getElementById('esignPad');
    var r = c.getBoundingClientRect();
    var ratio = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * ratio);
    c.height = Math.round(r.height * ratio);
    var ctx = c.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#16171A';
    esignDirty = false;
  }
  function esignPt(e) {
    var c = document.getElementById('esignPad');
    var r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function esignBind() {
    var c = document.getElementById('esignPad');
    c.addEventListener('pointerdown', function (e) {
      esignDrawing = true; c.setPointerCapture(e.pointerId);
      var ctx = c.getContext('2d'); var p = esignPt(e);
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
    });
    c.addEventListener('pointermove', function (e) {
      if (!esignDrawing) return;
      var ctx = c.getContext('2d'); var p = esignPt(e);
      ctx.lineTo(p.x, p.y); ctx.stroke(); esignDirty = true;
    });
    function end() { esignDrawing = false; }
    c.addEventListener('pointerup', end);
    c.addEventListener('pointerleave', end);
  }
  function esignClear() { openEsign(); }
  function esignCancel() { document.getElementById('esignModal').classList.remove('open'); }
  function esignPlace() {
    if (!esignTarget || !esignDirty) { esignCancel(); return; }
    var url = document.getElementById('esignPad').toDataURL('image/png');
    esignTarget.innerHTML = '<img src="' + url + '" alt="Signature">';
    esignTarget.classList.add('signed');
    esignCancel();
    if (typeof saveDraft === 'function' && SAVE) saveDraft();
  }
  esignSetup();
  esignBind();
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
 * Offer of Employment — the letter Convertt actually issues to a new hire,
 * structured as a binding offer that the candidate signs and returns.
 *
 * The clause set follows the standard Pakistani agency offer letter — offer
 * contingent on documents, title, duties per the enclosed JD, the offer with
 * gross + conveyance and a tax note, probation, notice period, benefits, a
 * conflict-of-interest clause, an entire-agreement clause, and a five-business-
 * day acceptance window — closing with signatures from both the employee and
 * the company.
 *
 * Deliberately NOT listed as a benefit: provident fund and gratuity. HR
 * Playbook 1.5 records that Convertt provides neither for Pakistan at present
 * (EOBI continues), so putting them in an offer would promise something the
 * company does not give.
 */
function offerLetter({ emp, extras }: Ctx) {
  const salary = emp.salary
  const recordGross = salary
    ? salary.basic + salary.houseRent + salary.utilities + salary.food + salary.fuel + salary.medicalAllowance + salary.otherAllowance
    : 0
  // Every field falls back to the record, so the letter is complete straight
  // away and the builder only overrides what HR actually changes.
  const gross = extras.grossSalary != null ? extras.grossSalary : recordGross
  const joining = extras.effectiveDate ? new Date(extras.effectiveDate) : emp.joiningDate ?? new Date()
  const joiningLong = joining.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

  const role = extras.designation?.trim() || emp.designation || '[Designation]'
  const probation = extras.probationMonths ?? 3
  const conveyance = extras.conveyance != null ? extras.conveyance : 5000

  // Notice period follows the Playbook: two months for Lead / senior client-
  // facing roles, one month for everyone else; two weeks while on probation.
  const senior = /lead|head|senior|manager|director|chief|principal/i.test(role)
  const confirmedNotice = extras.noticeConfirmed?.trim() || (senior ? 'two (2) months' : 'one (1) month')

  const city = extras.city?.trim() || emp.city || 'Lahore'
  const cnic = extras.cnic?.trim() || emp.cnic || ''
  const money = (n: number) => `PKR ${n.toLocaleString('en-US')}`

  const body = `
    <div class="doc-title centred">Offer of Employment</div>

    <table class="kv">
      <tr><td>Name</td><td>${escapeHtml(emp.fullName)}</td></tr>
      <tr><td>Designation</td><td>${escapeHtml(role)}</td></tr>
      ${cnic ? `<tr><td>CNIC No.</td><td>${escapeHtml(cnic)}</td></tr>` : ''}
      <tr><td>City</td><td>${escapeHtml(city)}</td></tr>
      <tr><td>Joining Date</td><td>${joiningLong}</td></tr>
    </table>

    <p class="j">Dear ${escapeHtml(emp.fullName)},</p>

    <p class="j">This is an offer of employment as a <strong>${escapeHtml(role)}</strong> at Convertt. This offer is contingent upon our receipt of your educational documents to confirm your degree, and any other contingencies that the company may wish to state.</p>

    <p class="j">Your title will be <strong>${escapeHtml(role)}</strong> if you accept this employment offer. In this role, you will be expected to carry out the duties and responsibilities described in the enclosed job description, which is periodically updated to reflect the needs of the role.</p>

    <p class="j"><strong>Offer:</strong> We are offering you a monthly gross salary of <strong>${gross > 0 ? money(gross) : '[Gross Salary]'}</strong>, inclusive of a Conveyance Allowance of ${money(conveyance)} per month. Taxes and other statutory withholdings will be applied as required by law and the policies of the company.</p>

    <p class="j"><strong>Probation:</strong> Initially, you will be on ${escapeHtml(String(probation))}-months&rsquo; probation. At the end of this period, a review will determine your performance and confirmation of employment.</p>

    <p class="j"><strong>Notice Period:</strong> A notice of ${confirmedNotice} is required for termination of services by either party once confirmed. If you are on probation, two (2) weeks&rsquo; notice is required (subject to the approval of your manager).</p>

    <p class="j"><strong>Benefits:</strong> ${extras.benefits?.trim() ? escapeHtml(extras.benefits.trim()) : 'The standard company benefits package &mdash; group health insurance, OPD cover, EOBI registration, and paid holidays, with leave as per the company&rsquo;s leave policy &mdash; is offered with this employment in line with the company&rsquo;s standard policy.'}</p>

    <p class="j">As per company policy, you are not permitted to undertake freelancing or any other business activity that is in direct or indirect conflict of interest with the company&rsquo;s business.</p>

    <p class="j">You acknowledge that this offer letter, together with the final form of any enclosed documents, represents the entire agreement between you and Convertt, and that no verbal or written agreements, promises, or representations not specifically stated in this letter are or will be binding upon Convertt.</p>

    <p class="j">If you are in agreement with the above, please sign below and return this letter to the company. This employment offer is in effect for five (5) business days.</p>

    <table class="sig-grid">
      <tr>
        <td>
          <div class="esign-slot" data-esign="${escapeHtml(emp.fullName)}"><span class="esign-hint">Click to sign</span></div>
          <div class="sig-line"></div>
          <div class="sig-name">${escapeHtml(emp.fullName)}</div>
          <div class="sig-role">${escapeHtml(role)}, Convertt</div>
          <div class="sig-date">Date: _____________________</div>
        </td>
        <td>
          <div class="esign-slot" data-esign="Syed Khawer"><span class="esign-hint">Click to sign</span></div>
          <div class="sig-line"></div>
          <div class="sig-name">Syed Khawer</div>
          <div class="sig-role">Director Administration, Convertt</div>
          <div class="sig-date">Date: _____________________</div>
        </td>
      </tr>
    </table>
  `
  return {
    html: wrap('Offer of Employment', body, DEFAULT_SIGNATORY, 'letter', {
      employeeId: emp.id, docType: 'offer_letter', noSignOff: true,
    }),
    title: `Offer of Employment - ${emp.fullName}`,
  }
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
    <p><strong>Convertt</strong> (the "Company"), a sole proprietorship with its office at Office #201, 5th Floor, Mega Tower, Main Gulberg, Lahore, Punjab, Pakistan; and</p>
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
    <p>The Employee agrees to maintain absolute confidentiality of all proprietary information, client data, financial data, trade secrets, and any other information that is not in the public domain, both during and after the term of employment. All work product, code, designs, and creative output produced in the course of employment shall remain the exclusive intellectual property of Convertt.</p>

    <h3 style="font-size:12pt">7. Code of Conduct</h3>
    <p>The Employee shall conduct themselves professionally at all times and abide by the Company's Code of Conduct, IT Policy, Anti-Harassment Policy, and any other policies issued by the Company from time to time.</p>

    <h3 style="font-size:12pt">8. Termination</h3>
    ${intern
      ? '<p>The Company may terminate this Agreement at any time during the training period without notice for unsatisfactory performance, misconduct, or any other valid reason.</p>'
      : '<p>Either party may terminate this Agreement by giving one (1) month\'s written notice or payment in lieu thereof. The Company reserves the right to terminate without notice in cases of gross misconduct or breach of this Agreement.</p>'}

    <h3 style="font-size:12pt">9. Disciplinary Process</h3>
    <p>In line with the Standing Orders Ordinance, 1968, no employee shall be dismissed without due process. The process shall include a written Show Cause Notice (3–7 working days to reply), a domestic inquiry if the explanation is unsatisfactory, and a fair hearing before disciplinary action. Gross misconduct (fraud, theft, harassment, insubordination, reputational harm, breach of confidentiality) may result in summary dismissal without notice.</p>

    <h3 style="font-size:12pt">10. Return of Property &amp; Exit Clearance</h3>
    <p>On termination, the Employee shall return all Company property (devices, documents, data). Final settlement shall be processed after completion of Exit Clearance.</p>

    <h3 style="font-size:12pt">11. Post-Employment Restrictions</h3>
    <p>For six (6) months after leaving, the Employee shall not solicit Company clients for competing business, nor poach Company employees. Confidentiality and non-disparagement obligations survive termination indefinitely.</p>

    <h3 style="font-size:12pt">12. Social Media &amp; Non-Disparagement</h3>
    <p>The Employee shall not, during or after employment, make defamatory or disparaging remarks about the Company, its employees or clients, whether verbally or online (LinkedIn, Facebook, Instagram, Twitter/X, WhatsApp etc.). Participation in hostile social media campaigns shall constitute misconduct and may invite civil or criminal action under the Prevention of Electronic Crimes Act, 2016 (PECA) and the Defamation Ordinance, 2002.</p>

    <h3 style="font-size:12pt">13. Background Verification</h3>
    <p>Employment is subject to verification of CNIC, credentials and references. False information shall result in dismissal.</p>

    <h3 style="font-size:12pt">14. Governing Law &amp; Jurisdiction</h3>
    <p>This Agreement is governed by the laws of the Islamic Republic of Pakistan. The courts of Lahore, Punjab shall have exclusive jurisdiction. Failure to enforce a right shall not constitute waiver; if any clause is found invalid, the remainder shall continue in effect.</p>

    <h3 style="font-size:12pt">15. Entire Agreement</h3>
    <p>This Agreement constitutes the entire agreement between the Parties. No amendment is valid unless made in writing and signed by the Company.</p>

    <h3 style="font-size:12pt">HR Closing Statement</h3>
    <p>Convertt is committed to providing a professional, ethical and growth-oriented workplace. By joining, you become part of a team that values excellence, integrity and innovation. We welcome you and look forward to a successful association.</p>

    <h3 style="font-size:12pt">Employee Declaration &amp; Acceptance</h3>
    <p>I, <strong>${escapeHtml(emp.fullName)}</strong>${emp.cnic ? `, CNIC ${escapeHtml(emp.cnic)}` : ''}, hereby confirm and declare that:</p>
    <ol>
      <li>All documents, credentials and information I have provided are true and accurate. I understand that any false or misleading information shall constitute misconduct and may result in dismissal.</li>
      <li>I have read, understood and accepted this Employment Agreement and its Annexures, including the Company's Code of Conduct, Confidentiality, Intellectual Property, Non-Disparagement and Disciplinary Policies.</li>
      <li>I agree to abide by all present and future Company policies and acknowledge that the Company may amend its policies in line with applicable law.</li>
    </ol>
    <p>I reaffirm that any work created during employment is the exclusive property of the Company and that confidentiality and non-disparagement obligations survive termination.</p>

    <p style="margin-top:18px">Signed and accepted on ${fmtDate(startDate)}.</p>

    <table class="sig-grid">
      <tr>
        <td>
          <div class="esign-slot" data-esign="Syed Khawer"><span class="esign-hint">Click to sign</span></div>
          <div class="sig-line"></div>
          <div class="sig-name">Syed Khawer</div>
          <div class="sig-role">Director Administration, Convertt</div>
          <div class="sig-date">Date: _____________________</div>
        </td>
        <td>
          <div class="esign-slot" data-esign="${escapeHtml(emp.fullName)}"><span class="esign-hint">Click to sign</span></div>
          <div class="sig-line"></div>
          <div class="sig-name">${escapeHtml(emp.fullName)}</div>
          <div class="sig-role">CNIC: ${emp.cnic ? escapeHtml(emp.cnic) : '_____________________'}</div>
          <div class="sig-date">Date: _____________________</div>
        </td>
      </tr>
    </table>
  `
  return {
    html: wrap('Employment Agreement', body, DEFAULT_SIGNATORY, 'letter', {
      employeeId: emp.id, docType: intern ? 'employment_agreement_intern' : 'employment_agreement', noSignOff: true,
    }),
    title: `Employment Agreement - ${emp.fullName}`,
  }
}

/**
 * Employee Non-Disclosure & Intellectual Property Agreement.
 *
 * Follows Convertt's issued NDA: the company is a sole proprietorship (not
 * "Ltd"), and the clause set is the real one — confidentiality with its
 * exclusions, IP assignment, non-disparagement under PECA, return and
 * destruction with written certification, and the liquidated-damages figure.
 * Signed separately from, and in addition to, the Employment Agreement.
 */
function nda({ emp }: Ctx) {
  const start = emp.joiningDate ?? new Date()
  const body = `
    <div class="doc-title">Employee Non-Disclosure &amp; Intellectual Property Agreement</div>
    <p style="text-align:center;font-style:italic;margin-top:-6px">(Private &amp; Confidential)</p>

    <p><strong>Date:</strong> ${fmtDate(start)}</p>
    <p>This Non-Disclosure and Intellectual Property Agreement (&ldquo;Agreement&rdquo;) is entered into between:</p>
    <p><strong>Convertt</strong>, a sole proprietorship organised under the laws of the Islamic Republic of Pakistan, having its office at Office #201, 5th Floor, Mega Tower, Main Gulberg, Lahore, Pakistan (the &ldquo;Company&rdquo;),</p>
    <p><strong>AND</strong></p>
    <p><strong>${escapeHtml(emp.fullName)}</strong>${emp.cnic ? `, CNIC ${escapeHtml(emp.cnic)}` : ''}${emp.designation ? `, ${escapeHtml(emp.designation)}` : ''}${emp.address ? `, residing at ${escapeHtml(emp.address)}` : ''} (the &ldquo;Employee&rdquo;).</p>
    <p>The Company and the Employee are collectively referred to as the &ldquo;Parties&rdquo;.</p>

    <h3 style="font-size:12pt;margin-top:18px">1. Purpose</h3>
    <p>The Employee acknowledges that during employment they will have access to sensitive, confidential and proprietary information of the Company and its clients. This Agreement governs protection of such information, assignment of intellectual property, and restrictions on use or disclosure during and after employment.</p>

    <h3 style="font-size:12pt">2. Confidential Information</h3>
    <p>2.1 &ldquo;Confidential Information&rdquo; includes all non-public information relating to the Company&rsquo;s business, clients, products, designs, codes, strategies, financials, marketing plans, trade secrets, systems and other proprietary data, whether in written, oral, digital or any other form.</p>
    <p>2.2 The Employee shall:</p>
    <ul>
      <li>Keep all Confidential Information strictly confidential;</li>
      <li>Not disclose it to any third party without prior written authorisation;</li>
      <li>Not copy, duplicate, store, download or retain Confidential Information on any personal device, cloud account, email or storage media;</li>
      <li>Not use it for personal gain or for the benefit of any third party.</li>
    </ul>
    <p>2.3 Upon termination of employment, the Employee shall immediately return all Confidential Information and delete any copies from personal devices, emails or accounts.</p>
    <p>2.4 These obligations survive termination of employment and remain indefinite.</p>

    <h3 style="font-size:12pt">3. Exclusions</h3>
    <p>Confidential Information does not include information that:</p>
    <ul>
      <li>Is or becomes public through no fault of the Employee;</li>
      <li>Was lawfully obtained by the Employee prior to disclosure by the Company; or</li>
      <li>Must be disclosed under law, provided the Employee gives prior notice to the Company.</li>
    </ul>

    <h3 style="font-size:12pt">4. Intellectual Property Ownership</h3>
    <p>4.1 All work, inventions, designs, content, code, documentation and creative output produced during employment (&ldquo;Work Product&rdquo;) shall be the sole and exclusive property of the Company.</p>
    <p>4.2 The Employee irrevocably assigns all rights, title and interest in the Work Product to the Company, including copyright, patents, trademarks, designs and trade secrets.</p>
    <p>4.3 The Employee waives any claim to ownership, royalties or additional compensation beyond salary for such Work Product.</p>
    <p>4.4 These obligations survive termination of employment.</p>

    <h3 style="font-size:12pt">5. Non-Disparagement &amp; Social Media</h3>
    <p>5.1 The Employee shall not, during or after employment, post, publish, circulate or endorse any defamatory, disparaging or negative statements about the Company, its management, employees or clients, including but not limited to LinkedIn, Facebook, Instagram, Twitter/X, WhatsApp, blogs, forums or any digital platform.</p>
    <p>5.2 Any grievance must be raised internally with the Company. Public commentary or online campaigns against the Company shall constitute misconduct and reputational harm.</p>
    <p>5.3 Breach of this clause may constitute cyber harassment or cyber bullying under the Prevention of Electronic Crimes Act, 2016 (PECA) and defamation under the Defamation Ordinance, 2002, entitling the Company to civil and criminal remedies.</p>

    <h3 style="font-size:12pt">6. Return &amp; Destruction of Materials</h3>
    <p>6.1 The Employee shall not retain, copy or store any Company-owned information, documents or property after termination of employment.</p>
    <p>6.2 Upon termination, the Employee shall:</p>
    <ul>
      <li>Return all Company devices, data, credentials and documents;</li>
      <li>Permanently delete any Company-related files, emails or data stored on personal devices or cloud accounts;</li>
      <li>Provide written certification that no Company information remains in their possession.</li>
    </ul>

    <h3 style="font-size:12pt">7. Remedies &amp; Liquidated Damages</h3>
    <p>7.1 The Employee acknowledges that breach of this Agreement will cause irreparable harm to the Company, for which monetary damages alone may be insufficient.</p>
    <p>7.2 The Company shall be entitled to:</p>
    <ul>
      <li>Injunctive relief (stay orders) from court to stop or prevent further breach;</li>
      <li>Recovery of actual damages suffered due to breach, including loss of business, clients or reputation;</li>
      <li>Recovery of legal costs and expenses.</li>
    </ul>
    <p>7.3 In addition, the Employee agrees that for any proven breach of this Agreement, the Company shall be entitled to liquidated damages of <strong>PKR 2,000,000 (Two Million Pakistani Rupees)</strong>, in addition to actual damages and other remedies available under law.</p>

    <h3 style="font-size:12pt">8. Governing Law &amp; Jurisdiction</h3>
    <p>This Agreement shall be governed by the laws of the Islamic Republic of Pakistan. Courts at Lahore, Punjab shall have exclusive jurisdiction.</p>

    <h3 style="font-size:12pt">9. Entire Agreement</h3>
    <p>This Agreement constitutes the entire understanding between the Parties regarding confidentiality, intellectual property and non-disparagement, and supersedes any prior discussions or agreements.</p>

    <p style="margin-top:18px">Signed and accepted on ${fmtDate(start)}.</p>

    <table class="sig-grid">
      <tr>
        <td>
          <div class="esign-slot" data-esign="Syed Khawer"><span class="esign-hint">Click to sign</span></div>
          <div class="sig-line"></div>
          <div class="sig-name">Syed Khawer</div>
          <div class="sig-role">Director Administration, Convertt</div>
          <div class="sig-date">Date: _____________________</div>
        </td>
        <td>
          <div class="esign-slot" data-esign="${escapeHtml(emp.fullName)}"><span class="esign-hint">Click to sign</span></div>
          <div class="sig-line"></div>
          <div class="sig-name">${escapeHtml(emp.fullName)}</div>
          <div class="sig-role">CNIC: ${emp.cnic ? escapeHtml(emp.cnic) : '_____________________'}</div>
          <div class="sig-date">Date: _____________________</div>
        </td>
      </tr>
    </table>
  `
  return {
    html: wrap('NDA', body, DEFAULT_SIGNATORY, 'letter', {
      employeeId: emp.id, docType: 'nda', noSignOff: true,
    }),
    title: `NDA - ${emp.fullName}`,
  }
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

  // Paired down the page rather than stacked: eight questions each followed by
  // a full-width box ran to five pages, which nobody prints and nobody fills in.
  const q = (n: number, heading: string, prompt: string, tall = false) => `
    <div>
      <h3>${n}. ${escapeHtml(heading)}</h3>
      <p>${escapeHtml(prompt)}</p>
      <div class="answer${tall ? ' tall' : ''}"></div>
    </div>`

  const body = `
    <div class="doc-title">Exit Interview Form</div>
    <table class="kv">
      <tr><td>Employee Name</td><td>${escapeHtml(emp.fullName)}</td>
          <td>Employee ID</td><td>${escapeHtml(emp.employeeCode)}</td></tr>
      <tr><td>Designation</td><td>${escapeHtml(emp.designation)}</td>
          <td>Department</td><td>${escapeHtml(emp.department?.name ?? '—')}</td></tr>
      <tr><td>Last Working Day</td><td>${fmtDate(lastDay)}</td>
          <td>Interview Date</td><td>________________________</td></tr>
      <tr><td>Conducted By</td><td colspan="3">________________________</td></tr>
    </table>
    <p style="font-style:italic;color:#475569;margin-bottom:10pt">
      All responses are confidential and used to improve the workplace.
    </p>

    <div class="cols">
      ${q(1, 'Reason for Leaving', 'Your primary reason(s) for leaving Convertt:', true)}
      ${q(2, 'Job Role & Responsibilities', 'How well did the role match what was set out at hiring?', true)}
    </div>
    <div class="cols">
      ${q(3, 'Manager & Team', 'How would you describe working with your manager and team?')}
      ${q(4, 'Company Culture & Environment', 'What did you enjoy most? What would you change?')}
    </div>
    <div class="cols">
      ${q(5, 'Compensation & Benefits', 'Were you satisfied with your compensation and benefits?')}
      ${q(6, 'Career Growth', 'Did you have opportunities to grow at Convertt?')}
    </div>

    <h3>7. Would You Recommend Convertt?</h3>
    <p>Would you recommend Convertt as a workplace? &nbsp; ☐ Yes &nbsp; ☐ Maybe &nbsp; ☐ No &nbsp;&nbsp; Why or why not?</p>
    <div class="answer"></div>

    <h3>8. Suggestions for Improvement</h3>
    <p>Anything else you would want us to hear?</p>
    <div class="answer tall"></div>

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
  return {
    html: wrap('Exit Interview Form', body, DEFAULT_SIGNATORY, 'form'),
    title: `Exit Interview - ${emp.fullName}`,
  }
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
