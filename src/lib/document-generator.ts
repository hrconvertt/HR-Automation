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
  /** Agreements are not letters. The Employment Agreement and the NDA are
   *  issued as plain paged documents — no gradient bars, no letterhead block,
   *  and A4 page seams so the screen matches the printed copy. */
  plain?: boolean
}

function wrap(
  title: string,
  body: string,
  signatory: Signatory = DEFAULT_SIGNATORY,
  variant: DocVariant = 'letter',
  meta: WrapMeta = {},
): string {
  const isForm = variant === 'form'
  const isPlain = !!meta.plain
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
    ${isForm || isPlain ? 'display: none;' : ''}
  }
  .doc::before { top: 0; }
  .doc::after  { bottom: 0; }
  /* A plain agreement sheet. Page seams were drawn here for a moment and they
     sliced through mid-sentence, so the screen just shows a clean sheet; the
     printer still paginates it to A4 via @page. */
  .doc.paged { min-height: 297mm; }
  @media print { .doc.paged { box-shadow: none; } }
  /* Never split a clause off its heading across a page break. */
  .doc h3 { break-after: avoid; page-break-after: avoid; }
  .doc table.sig-grid { break-inside: avoid; page-break-inside: avoid; }
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
  <div class="doc${isPlain ? ' paged' : ''}" id="doc">
    ${isPlain ? '' : `<div class="letterhead">
      <div class="logo"><img src="${LOGO_DATA_URI}" alt="Convertt"></div>
      <div class="addr">${LETTERHEAD_ADDRESS_LINES.join('<br>')}</div>
    </div>
    <div class="letter-date">${letterDate(new Date())}</div>`}
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

/**
 * Convertt – Employment Agreement.
 *
 * Reproduces the issued document word for word. Only the person-specific
 * blanks are filled from the record (name, CNIC, address, designation, salary,
 * dates); the clause text is not paraphrased, reordered or "improved" — this
 * is a signed legal document, so it has to read exactly as HR issues it.
 */
function employmentAgreement({ emp, extras }: Ctx, kind: 'permanent' | 'intern') {
  const salary = emp.salary
  const gross = salary
    ? salary.basic + salary.houseRent + salary.utilities + salary.food + salary.fuel + salary.medicalAllowance + salary.otherAllowance
    : 0
  const startDate = extras.effectiveDate ? new Date(extras.effectiveDate) : emp.joiningDate ?? new Date()
  const intern = kind === 'intern'
  const longDate = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const blank = (v: string | null | undefined, w = 28) => (v ? escapeHtml(v) : '_'.repeat(w))
  const hours = emp.timings ?? '10:00 AM to 7:00 PM, Monday to Friday'

  const body = `
    <div class="doc-title">Convertt &ndash; Employment Agreement</div>
    <p style="text-align:center;font-style:italic;margin-top:-6px">(Private &amp; Confidential)</p>

    <p><strong>Date:</strong> ${longDate(startDate)}<br>
    <strong>Employee ID:</strong> ${blank(emp.employeeCode, 18)}</p>

    <p>This Employment Agreement (&ldquo;Agreement&rdquo;) is made between:</p>
    <p><strong>Convertt</strong> (the &ldquo;Company&rdquo;), a sole proprietorship with its office at Office #201, 5th Floor Mega Tower, Main Gulberg, Lahore, Punjab, Pakistan,</p>
    <p><strong>AND</strong></p>
    <p><strong>${escapeHtml(emp.fullName)}</strong>, CNIC: ${blank(emp.cnic, 20)}, ${emp.fatherOrHusbandName ? `S/O ${escapeHtml(emp.fatherOrHusbandName)}` : 'S/O ______________________'}, residing at ${blank(emp.address, 34)} (the &ldquo;Employee&rdquo;).</p>
    <p>Together referred to as the &ldquo;Parties.&rdquo;</p>

    <h3 style="font-size:12pt;margin-top:18px">Part I &ndash; Appointment &amp; Position</h3>
    <p>Convertt is pleased to appoint you as a <strong>${escapeHtml(extras.designation?.trim() || emp.designation || '[Designation]')}</strong>. We value your skills and dedication, and we look forward to a productive and successful association. This agreement outlines the terms and conditions of your ${intern ? 'traineeship' : 'employment'}, balancing the Company&rsquo;s operational requirements with our commitment to supporting your professional development.</p>
    <p>Your employment shall commence on ${longDate(startDate)}, subject to the terms herein.</p>

    <h3 style="font-size:12pt">2. Probation and Confirmation</h3>
    <p>2.1 The first three (3) months of service will constitute a probationary period.</p>
    <p>2.2 During probation, either party may terminate employment within the period of 15 days.</p>
    <p>2.3 Upon satisfactory completion of the probation period, your employment will be confirmed in writing. Probation may be extended once for one (1) month at the Company&rsquo;s discretion.</p>

    <h3 style="font-size:12pt">Part II &ndash; Role, Remuneration &amp; Benefits</h3>
    <h3 style="font-size:12pt">3. Duties &amp; Responsibilities</h3>
    <p>You shall perform your duties diligently, maintain professional conduct and comply with the lawful directions of the Company. Your responsibilities will evolve as the Company grows and you may be assigned additional tasks aligned with your skills.</p>

    <h3 style="font-size:12pt">4. Exclusivity of Service</h3>
    <p>During employment, you shall not engage in any outside work, consultancy or business, whether paid or unpaid, that may conflict with your responsibilities to Convertt, without prior written consent.</p>

    <h3 style="font-size:12pt">5. Hours of Work</h3>
    <p>Normal working hours are ${escapeHtml(hours)}, with one (1) hour for lunch. The Company expects punctuality and consistent attendance.</p>

    <h3 style="font-size:12pt">6. Compensation</h3>
    <p>6.1 You will be paid a gross monthly salary of <strong>${gross > 0 ? fmtMoney(gross) : 'PKR ______________'}</strong>, payable at the end of each calendar month, subject to lawful deductions under the Income Tax Ordinance, 2001.</p>
    <p>6.2 The Company may, at its discretion, provide bonuses, incentives or salary revisions. Such benefits are discretionary and may be varied.</p>

    <h3 style="font-size:12pt">7. Benefits</h3>
    <p>The Company is a growing organization committed to providing equal opportunities for career development and professional growth. In addition to your salary, you may be considered for performance-based bonuses, appraisals or other incentives, as determined by the Company from time to time at its sole discretion.</p>
    <p>Any additional benefits or programs that may be introduced in the future shall be communicated separately and shall apply equally to all eligible employees. These benefits are discretionary and do not form part of the guaranteed terms of employment.</p>

    <h3 style="font-size:12pt">8. Leave and Holidays</h3>
    <p>8.1 You will be entitled to three (3) paid leave days per month in case of a permanent employee and you will be entitled to two (2) paid leave days per month in the probation period, which may be used as sick or casual leave.</p>
    <p>8.2 After completing fourteen (14) months of service, you will be entitled to a minimum of fourteen (24) days paid annual leave, as per Factories Act 1934 and Standing Orders Ordinance 1968.</p>
    <p>8.3 The Sandwich Rule applies: if you take leave on either side of a weekend/public holiday, the intervening days will also be counted as leave.</p>
    <p>8.4 All leave requires approval first by your Manager and then HR.</p>
    <p>8.5 Public holidays declared by the Government of Pakistan will be observed.</p>

    <h3 style="font-size:12pt">Part III &ndash; Policies &amp; Conduct</h3>
    <h3 style="font-size:12pt">9. Confidentiality</h3>
    <p>You shall maintain confidentiality of all Company, client and partner information during and after employment. Any unauthorised disclosure may lead to termination and legal proceedings under the Prevention of Electronic Crimes Act, 2016 (PECA) and other applicable laws.</p>

    <h3 style="font-size:12pt">10. Intellectual Property</h3>
    <p>All work produced by you during employment, including code, designs, content and documentation, shall be the property of the Company. You irrevocably assign all intellectual property rights to the Company. This obligation survives termination.</p>

    <h3 style="font-size:12pt">11. Code of Conduct</h3>
    <p>The Company expects you to:</p>
    <ul>
      <li>Act with integrity, professionalism and respect.</li>
      <li>Avoid harassment, discrimination or misconduct.</li>
      <li>Uphold ethical behaviour in dealings with colleagues, clients and vendors.</li>
    </ul>

    <h3 style="font-size:12pt">12. IT &amp; Security</h3>
    <p>You shall comply with Company IT and data security policies. All devices, systems and accounts remain Company property. The Company reserves the right to monitor its systems in compliance with law.</p>

    <h3 style="font-size:12pt">13. Social Media &amp; Non-Disparagement</h3>
    <p>You shall not, during or after employment, make defamatory or disparaging remarks about the Company, its employees or clients, whether verbally or online (LinkedIn, Facebook, Instagram, Twitter/X, WhatsApp etc.). Participation in hostile social media campaigns shall constitute misconduct and may invite civil/criminal action under PECA and Defamation Ordinance, 2002.</p>

    <h3 style="font-size:12pt">Part IV &ndash; Discipline, Termination &amp; Exit</h3>
    <h3 style="font-size:12pt">14. Disciplinary Process</h3>
    <p>14.1 In line with the Standing Orders Ordinance, 1968, no Employee shall be dismissed without due process.</p>
    <p>14.2 The process shall include:</p>
    <ul>
      <li>Written Show Cause Notice (3&ndash;7 working days to reply).</li>
      <li>Domestic Inquiry if explanation unsatisfactory.</li>
      <li>Fair hearing before disciplinary action.</li>
    </ul>
    <p>14.3 Gross misconduct (fraud, theft, harassment, insubordination, reputational harm, breach of confidentiality) may result in summary dismissal without notice.</p>

    <h3 style="font-size:12pt">15. Termination</h3>
    <p>15.1 During probation: termination by either party within 15 days of notice period.</p>
    <p>15.2 After confirmation: termination by either party with one (1) month written notice or salary in lieu.</p>
    <p>15.3 Immediate termination for gross misconduct.</p>

    <h3 style="font-size:12pt">16. Return of Property &amp; Exit Clearance</h3>
    <p>On termination, you shall return all Company property (devices, documents, data). Final settlement shall be processed after completion of Exit Clearance (Annexure E).</p>

    <h3 style="font-size:12pt">17. Post-Employment Restrictions</h3>
    <p>For six (6) months after leaving, you shall not:</p>
    <ul>
      <li>Solicit Company clients for competing business.</li>
      <li>Poach Company employees.</li>
    </ul>
    <p>Your confidentiality and non-disparagement obligations survive termination indefinitely.</p>

    <h3 style="font-size:12pt">Part V &ndash; Legal &amp; General</h3>
    <h3 style="font-size:12pt">18. Background Verification</h3>
    <p>Employment is subject to verification of CNIC, credentials and references. False information shall result in dismissal.</p>

    <h3 style="font-size:12pt">19. Force Majeure</h3>
    <p>The Company shall not be liable for delays or failures caused by events beyond its control (natural disasters, government action, pandemics, strikes).</p>

    <h3 style="font-size:12pt">20. Waiver &amp; Severability</h3>
    <p>Failure to enforce a right shall not constitute waiver. If any clause is found invalid, the remainder shall continue in effect.</p>

    <h3 style="font-size:12pt">21. Governing Law &amp; Jurisdiction</h3>
    <p>This Agreement is governed by the laws of the Islamic Republic of Pakistan. The courts of Lahore, Punjab shall have exclusive jurisdiction.</p>

    <h3 style="font-size:12pt">22. Entire Agreement</h3>
    <p>This Agreement, together with Annexures A&ndash;E, constitutes the entire agreement. No amendment is valid unless made in writing and signed by the Company.</p>

    <h3 style="font-size:12pt">HR Closing Statement</h3>
    <p>Convertt is committed to providing a professional, ethical and growth-oriented workplace. By joining, you become part of a team that values excellence, integrity and innovation. We welcome you and look forward to a successful association.</p>

    <h3 style="font-size:12pt">Employee Declaration &amp; Acceptance</h3>
    <p>I, <strong>${escapeHtml(emp.fullName)}</strong>, CNIC: ${blank(emp.cnic, 20)}, hereby confirm and declare that:</p>
    <ol>
      <li>All documents, credentials and information I have provided are true and accurate. I understand that any false or misleading information shall constitute misconduct and may result in dismissal.</li>
      <li>I have read, understood and accepted this Employment Agreement and its Annexures, including the Company&rsquo;s Code of Conduct, Confidentiality, Intellectual Property, Non-Disparagement and Disciplinary Policies.</li>
      <li>I agree to abide by all present and future Company policies and acknowledge that the Company may amend its policies in line with applicable law.</li>
    </ol>
    <p>I reaffirm that any work created during employment is the exclusive property of the Company and that confidentiality and non-disparagement obligations survive termination.</p>

    <p style="margin-top:18px">Signed and accepted on ${longDate(startDate)}.</p>

    <table class="sig-grid">
      <tr>
        <td>
          <div class="sig-role" style="margin-bottom:6pt"><strong>For Convertt:</strong></div>
          <div class="esign-slot" data-esign="Syed Khawer"><span class="esign-hint">Click to sign</span></div>
          <div class="sig-line"></div>
          <div class="sig-role">Signature</div>
          <div class="sig-date">Title: _____________________</div>
          <div class="sig-date">Date: _____________________</div>
        </td>
        <td>
          <div class="sig-role" style="margin-bottom:6pt"><strong>For Employee:</strong></div>
          <div class="esign-slot" data-esign="${escapeHtml(emp.fullName)}"><span class="esign-hint">Click to sign</span></div>
          <div class="sig-line"></div>
          <div class="sig-role">Signature</div>
          <div class="sig-date">Date: _____________________</div>
          <div class="sig-date">CNIC: ${emp.cnic ? escapeHtml(emp.cnic) : '_____________________'}</div>
        </td>
      </tr>
    </table>
  `
  return {
    html: wrap('Employment Agreement', body, DEFAULT_SIGNATORY, 'letter', {
      employeeId: emp.id, docType: intern ? 'employment_agreement_intern' : 'employment_agreement', noSignOff: true, plain: true,
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
/**
 * NDA – Employee Non-Disclosure & Intellectual Property Agreement.
 *
 * Reproduces the issued document word for word. Only the Employee Details
 * block is filled from the record; every clause is verbatim, because this is
 * a signed legal document and paraphrasing it changes what was agreed.
 */
function nda({ emp }: Ctx) {
  const start = emp.joiningDate ?? new Date()
  const longDate = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const line = (v: string | null | undefined, w = 30) => (v ? escapeHtml(v) : '_'.repeat(w))

  const body = `
    <div style="font-size:10.5pt;line-height:1.45;margin-bottom:18pt">
      Mega Tower 5th floor, Office<br>
      #201 Gulberg Lahore,<br>
      Pakistan<br>
      +92 4237458015<br>
      +92 3700488685
    </div>
    <div class="doc-title">NDA &ndash; Employee Non-Disclosure &amp; Intellectual Property Agreement</div>
    <p style="text-align:center;font-style:italic;margin-top:-6px">(Private &amp; Confidential)</p>

    <p><strong>Date:</strong> ${longDate(start)}</p>

    <p>This Non-Disclosure and Intellectual Property Agreement (&ldquo;Agreement&rdquo;) is entered into between:</p>
    <p><strong>Convertt</strong>, a sole proprietorship organized under the laws of the Islamic Republic of Pakistan, having its office at Office #201, 5th Floor, Mega Tower, Main Gulberg, Lahore, Pakistan (hereinafter referred to as the &ldquo;Company&rdquo;),</p>
    <p><strong>AND</strong></p>
    <p><strong>Employee Details</strong></p>
    <ul>
      <li>Full Name: ${line(emp.fullName, 32)}</li>
      <li>Father/Spouse Name: ${line(emp.fatherOrHusbandName, 28)}</li>
      <li>CNIC: ${line(emp.cnic, 26)}</li>
      <li>Designation: ${line(emp.designation, 26)}</li>
      <li>Residential Address: ${line(emp.address, 40)}</li>
      <li>Email: ${line(emp.email, 36)} (hereinafter referred to as the &ldquo;Employee&rdquo;).</li>
    </ul>
    <p>The Company and the Employee are collectively referred to as the &ldquo;Parties.&rdquo;</p>

    <h3 style="font-size:12pt;margin-top:18px">1. Purpose of Agreement</h3>
    <p>During the course of employment, the Employee will have access to confidential, proprietary, and sensitive information relating to the Company, its clients, operations, systems, and business affairs. This Agreement sets out the Employee&rsquo;s obligations regarding confidentiality, intellectual property ownership, non-disparagement, and post-employment conduct, both during and after the term of employment.</p>

    <h3 style="font-size:12pt">2. Definition of Confidential Information</h3>
    <p>&ldquo;Confidential Information&rdquo; includes, without limitation, all information that is not publicly available and that relates to the Company or its clients, whether disclosed directly or indirectly, including but not limited to:</p>
    <ul>
      <li>Client identities, data, credentials, communications, and CRM records</li>
      <li>Designs, layouts, wireframes, code, scripts, automations, workflows, SOPs</li>
      <li>Business strategies, pricing, proposals, margins, forecasts, and financial data</li>
      <li>Internal tools, systems, methodologies, processes, and know-how</li>
      <li>HR matters, internal discussions, disputes, policies, and decisions</li>
      <li>Any information learned, observed, inferred, or accessed as a result of employment</li>
    </ul>
    <p>Confidential Information includes information in written, oral, visual, electronic, digital, or any other form, regardless of whether marked as confidential.</p>

    <h3 style="font-size:12pt">3. Confidentiality Obligations</h3>
    <p>The Employee agrees that they shall, during employment and at all times thereafter:</p>
    <ul>
      <li>Maintain strict confidentiality of all Confidential Information</li>
      <li>Not disclose, publish, share, transmit, or make available any Confidential Information to any third party without prior written authorization from the Company</li>
      <li>Not copy, download, store, retain, or back up Confidential Information on personal devices, email accounts, cloud storage, or external media</li>
      <li>Not use Confidential Information for personal benefit or for the benefit of any third party</li>
    </ul>
    <p>These obligations survive termination of employment without limitation in time, unless the information lawfully enters the public domain through no fault of the Employee.</p>

    <h3 style="font-size:12pt">4. Exclusions</h3>
    <p>Confidential Information does not include information that the Employee can clearly demonstrate:</p>
    <ul>
      <li>Was lawfully known to the Employee prior to disclosure by the Company</li>
      <li>Becomes publicly available without breach of this Agreement</li>
      <li>Is required to be disclosed by law or court order, provided prior written notice is given to the Company where legally permissible</li>
    </ul>

    <h3 style="font-size:12pt">5. Intellectual Property &amp; Work Product</h3>
    <ul>
      <li>All work, materials, inventions, designs, developments, code, content, documentation, and creative output created or contributed to by the Employee during employment (&ldquo;Work Product&rdquo;) shall be deemed work-for-hire and shall be the exclusive property of the Company.</li>
      <li>To the extent any Work Product is not deemed work-for-hire, the Employee hereby irrevocably assigns all rights, title, and interest, including intellectual property rights, to the Company.</li>
      <li>The Employee waives any moral rights, claims to ownership, royalties, or additional compensation in respect of such Work Product, beyond agreed remuneration.</li>
    </ul>
    <p>These obligations survive termination of employment.</p>

    <h3 style="font-size:12pt">6. Non-Solicitation and Post-Employment Restrictions</h3>
    <p>The Employee acknowledges that the Company&rsquo;s client base and staff are proprietary assets. Therefore, for a period of twelve (12) months following the termination of employment for any reason, the Employee shall not, directly or indirectly:</p>
    <ul>
      <li>Solicit, provide services to, or accept any business from any client of the Company with whom the Employee had contact or performed work for during their employment.</li>
      <li>Induce, encourage, or attempt to solicit any employee or contractor of the Company to leave their employment or engagement with Convertt.</li>
    </ul>

    <h3 style="font-size:12pt">7. Non-Disparagement &amp; Public Communications</h3>
    <ul>
      <li>The Employee agrees not to make, publish, or circulate any false, misleading, defamatory, or harmful statements regarding the Company, its management, employees, clients, or business affairs, during or after employment.</li>
      <li>This includes statements made on social media platforms, messaging applications, blogs, forums, interviews, or any public or semi-public medium.</li>
      <li>Legitimate grievances must be raised internally through appropriate Company channels. Public disclosure of internal matters or disputes constitutes a breach of this Agreement.</li>
      <li>The Parties acknowledge that breaches may attract civil and criminal liability under applicable laws, including the <strong>Prevention of Electronic Crimes Act, 2016</strong> and <strong>Defamation Ordinance, 2002</strong>.</li>
    </ul>

    <h3 style="font-size:12pt">8. Return and Destruction of Company Property</h3>
    <p>Upon termination of employment, or upon request:</p>
    <ul>
      <li>The Employee shall immediately return all Company property, devices, documents, data, credentials, and materials</li>
      <li>Permanently delete all Company-related information from personal devices and accounts</li>
      <li>Confirm in writing that no Company information remains in their possession or control</li>
    </ul>

    <h3 style="font-size:12pt">9. Remedies for Breach</h3>
    <ul>
      <li>The Employee acknowledges that breach of this Agreement may cause irreparable harm to the Company.</li>
      <li>The Company shall be entitled to seek: (i) Injunctive relief; (ii) Recovery of actual damages; (iii) Recovery of legal costs and expenses.</li>
      <li>Any monetary compensation agreed herein is a genuine pre-estimate of loss and not a penalty, and does not limit the Company&rsquo;s right to seek additional remedies available under law.</li>
    </ul>

    <h3 style="font-size:12pt">10. Governing Law &amp; Jurisdiction</h3>
    <p>This Agreement shall be governed by and construed in accordance with the laws of the Islamic Republic of Pakistan. Courts at Lahore, Punjab shall have exclusive jurisdiction.</p>

    <h3 style="font-size:12pt">11. Severability</h3>
    <p>If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.</p>

    <h3 style="font-size:12pt">12. Entire Agreement</h3>
    <p>This Agreement constitutes the entire understanding between the Parties and supersedes all prior agreements or understandings relating to confidentiality and intellectual property.</p>

    <h3 style="font-size:12pt">Signatures</h3>
    <table class="sig-grid">
      <tr>
        <td>
          <div class="sig-role" style="margin-bottom:6pt"><strong>For Employee:</strong></div>
          <div class="esign-slot" data-esign="${escapeHtml(emp.fullName)}"><span class="esign-hint">Click to sign</span></div>
          <div class="sig-line"></div>
          <div class="sig-role">Signature</div>
          <div class="sig-date">Name: ${emp.fullName ? escapeHtml(emp.fullName) : '_____________________'}</div>
          <div class="sig-date">Date: _____________________</div>
        </td>
        <td>
          <div class="sig-role" style="margin-bottom:6pt"><strong>For Convertt (Employer):</strong></div>
          <div class="esign-slot" data-esign="Syed Khawer"><span class="esign-hint">Click to sign</span></div>
          <div class="sig-line"></div>
          <div class="sig-role">Signature</div>
          <div class="sig-date">Full Name: _____________________</div>
          <div class="sig-date">Date: _____________________</div>
        </td>
      </tr>
    </table>
  `
  return {
    html: wrap('NDA', body, DEFAULT_SIGNATORY, 'letter', {
      employeeId: emp.id, docType: 'nda', noSignOff: true, plain: true,
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
