"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderEmploymentLetter = renderEmploymentLetter;
/**
 * Employment Letter as a real PDF, on the measured Convertt letterhead.
 *
 * Body copy is the issued sample (Umer Afzal, 1 July 2026) with nothing added.
 * Only the employee-specific values vary.
 */
const letterhead_1 = require("./letterhead");
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
/** "July 1, 2026" — the letterhead date format. */
function longDate(d) {
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
/** "1st July, 2026" — how the sample writes the joining date. */
function ordinalDate(d) {
    const n = d.getDate();
    const s = n % 10 === 1 && n !== 11 ? 'st'
        : n % 10 === 2 && n !== 12 ? 'nd'
            : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
    return `${n}${s} ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
}
async function renderEmploymentLetter(d) {
    const l = await (0, letterhead_1.startLetter)({
        letterDate: longDate(d.letterDate ?? new Date()),
        subject: 'Subject: Employment Letter',
    });
    let y = l.bodyStart;
    const para = (runs, gap = letterhead_1.BODY_PARA_GAP) => {
        y = (0, letterhead_1.drawParagraph)(l.page, l.fonts, runs, y);
        y -= gap;
    };
    para([{
            text: `On behalf of the HR team at Convertt, I am pleased to congratulate ${d.fullName}`
                + `${d.cnic ? ` CNIC ${d.cnic}` : ''} on your selection for the ${d.designation} position.`
                + ' We were impressed with your profile and are excited to welcome you to our team.',
        }]);
    para([{ text: 'Below are the details of your employment:' }], 4);
    // Joining date and probation are plain lines; the four terms below them are
    // bulleted. That asymmetry is how the issued letter reads.
    para([{ text: `Joining Date: ${ordinalDate(d.joiningDate)}` }], 0);
    para([{
            text: `Probation Period: ${d.probationMonths ?? 3} months, dependent upon your performance`,
        }], 2);
    const bulletIndent = 14;
    const bullets = [
        `Compensation: PKR ${d.compensation > 0 ? d.compensation.toLocaleString('en-US') : '[Compensation]'} per month`,
        `Timings: ${d.timings}`,
        `Working Days: ${d.workingDays}`,
        'Office Location: Convertt, Mega Tower – 63-B Main Boulevard Gulberg, 5th Floor, Office No. 201, Lahore',
    ];
    for (const b of bullets) {
        l.page.drawText('●', {
            x: letterhead_1.LEFT_MARGIN, y, size: 7, font: l.fonts.regular,
        });
        y = (0, letterhead_1.drawParagraph)(l.page, l.fonts, [{ text: b }], y, {
            x: letterhead_1.LEFT_MARGIN + bulletIndent,
            maxWidth: letterhead_1.MAX_WIDTH - bulletIndent,
            size: letterhead_1.BODY_FONT_SIZE,
            leading: letterhead_1.BODY_LEADING,
        });
    }
    y -= letterhead_1.BODY_PARA_GAP;
    para([{
            text: 'Convertt is a CRO-focused design and development agency working with ecommerce brands,'
                + ' dental practices, and weight loss clinics across the US, UK, and UAE. We’ve generated over'
                + ' $1B in tracked client revenue with an average 3.5X conversion uplift across 120+ projects.'
                + ' Our work sits at the intersection of conversion strategy, design, and development. We don’t'
                + ' just make things look good, we make them perform.',
        }]);
    para([{ text: 'We look forward to having you onboard and working together towards shared success.' }]);
    para([{ text: 'Congratulations once again!' }]);
    return (0, letterhead_1.finishLetter)(l);
}
