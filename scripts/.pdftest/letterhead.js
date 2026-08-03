"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEFT_MARGIN = exports.BODY_PARA_GAP = exports.BODY_LEADING = exports.BODY_FONT_SIZE = exports.BODY_TOP_FROM_TOP = exports.MAX_WIDTH = exports.PAGE_H = exports.PAGE_W = void 0;
exports.textY = textY;
exports.drawParagraph = drawParagraph;
exports.startLetter = startLetter;
exports.finishLetter = finishLetter;
/**
 * Convertt letterhead, rendered as a real PDF.
 *
 * Every constant below is measured from the official sample PDF — not styled by
 * eye. This exists because the previous HTML approach could not match: HTML
 * stacks elements in flow order while the real letter places each element at an
 * absolute point, it substituted a typed word for the logo image, and it asked
 * the browser for Roboto (silently falling back to Arial, which changes every
 * line break). Same geometry, same logo, same embedded fonts — so the output is
 * identical rather than approximated.
 *
 * Do not "tidy" these numbers. They are the document.
 */
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const pdf_lib_1 = require("pdf-lib");
const fontkit_1 = __importDefault(require("@pdf-lib/fontkit"));
const ASSETS = node_path_1.default.join(process.cwd(), 'src/assets/letterhead');
// ── Page ────────────────────────────────────────────────────────────────────
exports.PAGE_W = 595.28;
exports.PAGE_H = 841.89;
const LEFT_MARGIN = 56.7;
exports.LEFT_MARGIN = LEFT_MARGIN;
const RIGHT_MARGIN = exports.PAGE_W - 58.3; // aligns with the address block's right edge
exports.MAX_WIDTH = RIGHT_MARGIN - LEFT_MARGIN;
// ── Gradient bars ───────────────────────────────────────────────────────────
const GRADIENT_LEFT = { r: 0x08 / 255, g: 0x57 / 255, b: 0xe5 / 255 };
const GRADIENT_RIGHT = { r: 0x27 / 255, g: 0x7f / 255, b: 0xb1 / 255 };
const BAR_INSET = 28.9;
const BAR_HEIGHT = 12.8;
// ── Fixed elements ──────────────────────────────────────────────────────────
const LOGO_X = 60.1;
const LOGO_TOP_FROM_TOP = 64.9;
const LOGO_W = 174.0;
const COMPANY_ADDRESS_LINES = [
    'Mega Tower 5th floor, Office #201',
    'Gulberg Lahore, Pakistan',
    '+92 42 37458015',
    '+1 (716) 980-7724',
];
const ADDRESS_TOP_FROM_TOP = 68.0;
const ADDRESS_RIGHT = 537.7;
const ADDRESS_LEADING = 14.0;
const ADDRESS_FONT_SIZE = 10.5;
const DATE_TOP_FROM_TOP = 161.9;
const DATE_FONT_SIZE = 11;
const SUBJECT_TOP_FROM_TOP = 257.7;
const SUBJECT_FONT_SIZE = 13;
exports.BODY_TOP_FROM_TOP = 311.1;
exports.BODY_FONT_SIZE = 12;
exports.BODY_LEADING = 16.5;
exports.BODY_PARA_GAP = 12.0;
const SIGNATURE_NAME_TOP_FROM_TOP = 687.5;
const SIGNATURE_NAME_FONT_SIZE = 14;
const SIGNATURE_TITLE_TOP_FROM_TOP = 708.6;
const SIGNATURE_TITLE_FONT_SIZE = 10;
const TEXT_BLACK = (0, pdf_lib_1.rgb)(0x1a / 255, 0x1a / 255, 0x1a / 255);
/** Roboto's ascent as a fraction of font size — converts a "top of text"
 *  measurement into the baseline pdf-lib draws from. */
const ASCENT_RATIO = 0.78;
/** Distance-from-top -> bottom-origin y for the *baseline* of text. */
function textY(topFromTop, fontSize) {
    return exports.PAGE_H - (topFromTop + fontSize * ASCENT_RATIO);
}
function drawGradientBar(page, y) {
    // 240 vertical strips approximating the gradient, each overdrawn by 0.6pt so
    // no hairline seams appear between them at print resolution.
    const steps = 240;
    const totalW = exports.PAGE_W - 2 * BAR_INSET;
    const stripW = totalW / steps;
    for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        page.drawRectangle({
            x: BAR_INSET + i * stripW,
            y,
            width: stripW + 0.6,
            height: BAR_HEIGHT,
            color: (0, pdf_lib_1.rgb)(GRADIENT_LEFT.r + (GRADIENT_RIGHT.r - GRADIENT_LEFT.r) * t, GRADIENT_LEFT.g + (GRADIENT_RIGHT.g - GRADIENT_LEFT.g) * t, GRADIENT_LEFT.b + (GRADIENT_RIGHT.b - GRADIENT_LEFT.b) * t),
        });
    }
}
/**
 * Draw one logical paragraph, wrapping at MAX_WIDTH.
 * Returns the baseline the next line should use.
 */
function drawParagraph(page, fonts, runs, yBaseline, { size = exports.BODY_FONT_SIZE, leading = exports.BODY_LEADING, x = LEFT_MARGIN, maxWidth = exports.MAX_WIDTH } = {}) {
    const words = [];
    for (const run of runs) {
        for (const tok of run.text.split(' ')) {
            if (tok !== '')
                words.push({ text: tok, bold: run.bold });
        }
    }
    if (!words.length)
        return yBaseline;
    const spaceW = fonts.regular.widthOfTextAtSize(' ', size);
    const lines = [[]];
    let lineW = 0;
    for (const w of words) {
        const font = w.bold ? fonts.bold : fonts.regular;
        const width = font.widthOfTextAtSize(w.text, size);
        const add = lines[lines.length - 1].length ? width + spaceW : width;
        if (lines[lines.length - 1].length && lineW + add > maxWidth) {
            lines.push([w]);
            lineW = width;
        }
        else {
            lines[lines.length - 1].push(w);
            lineW += add;
        }
    }
    let y = yBaseline;
    for (const line of lines) {
        let cx = x;
        line.forEach((w, idx) => {
            const font = w.bold ? fonts.bold : fonts.regular;
            // Trailing space on every word but the last, so the PDF text stream holds
            // real spaces — copy-paste and search depend on it.
            const text = idx === line.length - 1 ? w.text : `${w.text} `;
            page.drawText(text, { x: cx, y, size, font, color: TEXT_BLACK });
            cx += font.widthOfTextAtSize(text, size);
        });
        y -= leading;
    }
    return y;
}
/**
 * A page with the bars, logo, address, date and subject already placed.
 * Callers draw the body and then call `finish`.
 */
async function startLetter({ letterDate, subject }) {
    const pdf = await pdf_lib_1.PDFDocument.create();
    pdf.registerFontkit(fontkit_1.default);
    const fonts = {
        regular: await pdf.embedFont(node_fs_1.default.readFileSync(node_path_1.default.join(ASSETS, 'fonts/Roboto-Regular.ttf')), { subset: true }),
        bold: await pdf.embedFont(node_fs_1.default.readFileSync(node_path_1.default.join(ASSETS, 'fonts/Roboto-Bold.ttf')), { subset: true }),
    };
    const page = pdf.addPage([exports.PAGE_W, exports.PAGE_H]);
    drawGradientBar(page, exports.PAGE_H - BAR_HEIGHT);
    drawGradientBar(page, 0);
    const logo = await pdf.embedPng(node_fs_1.default.readFileSync(node_path_1.default.join(ASSETS, 'convertt_logo.png')));
    const logoH = (logo.height / logo.width) * LOGO_W;
    page.drawImage(logo, {
        x: LOGO_X,
        y: exports.PAGE_H - LOGO_TOP_FROM_TOP - logoH,
        width: LOGO_W,
        height: logoH,
    });
    COMPANY_ADDRESS_LINES.forEach((line, i) => {
        const w = fonts.regular.widthOfTextAtSize(line, ADDRESS_FONT_SIZE);
        page.drawText(line, {
            x: ADDRESS_RIGHT - w,
            y: textY(ADDRESS_TOP_FROM_TOP + i * ADDRESS_LEADING, ADDRESS_FONT_SIZE),
            size: ADDRESS_FONT_SIZE,
            font: fonts.regular,
            color: TEXT_BLACK,
        });
    });
    page.drawText(letterDate, {
        x: LEFT_MARGIN,
        y: textY(DATE_TOP_FROM_TOP, DATE_FONT_SIZE),
        size: DATE_FONT_SIZE, font: fonts.regular, color: TEXT_BLACK,
    });
    page.drawText(subject, {
        x: LEFT_MARGIN,
        y: textY(SUBJECT_TOP_FROM_TOP, SUBJECT_FONT_SIZE),
        size: SUBJECT_FONT_SIZE, font: fonts.bold, color: TEXT_BLACK,
    });
    return { pdf, page, fonts, bodyStart: textY(exports.BODY_TOP_FROM_TOP, exports.BODY_FONT_SIZE) };
}
/** Place the signature block at its measured position and serialise. */
async function finishLetter(l, signatory = { name: 'Syed Khawer', title: 'Director Administration' }) {
    l.page.drawText(signatory.name, {
        x: LEFT_MARGIN,
        y: textY(SIGNATURE_NAME_TOP_FROM_TOP, SIGNATURE_NAME_FONT_SIZE),
        size: SIGNATURE_NAME_FONT_SIZE, font: l.fonts.bold, color: TEXT_BLACK,
    });
    l.page.drawText(signatory.title, {
        x: LEFT_MARGIN,
        y: textY(SIGNATURE_TITLE_TOP_FROM_TOP, SIGNATURE_TITLE_FONT_SIZE),
        size: SIGNATURE_TITLE_FONT_SIZE, font: l.fonts.regular, color: TEXT_BLACK,
    });
    return l.pdf.save();
}
