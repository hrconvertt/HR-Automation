/**
 * The appraisal, on paper.
 *
 * Laid out as the issued form is — the boxed header table, the rating index
 * above each scored block, sub totals, the overall assessment with its
 * banding, the reviewing officer's section, signatures and the HR box. What
 * prints has to be recognisable as the same document somebody signed.
 */
import { Fragment } from 'react'
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  SECTIONS, CORE_SECTIONS, RATING_INDEX, OVERALL_MAX,
  sectionMax, subTotal, overallTotal, overallAverage, bandFor,
  type Ratings, type GoalRow, type DevelopmentRow,
} from '@/lib/appraisal-form'

export const dynamic = 'force-dynamic'

const d = (x: Date | null) =>
  x ? x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''

export default async function AppraisalPrintPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  const form = await prisma.appraisalForm.findUnique({
    where: { id },
    include: {
      employee: {
        select: { fullName: true, employeeCode: true, joiningDate: true, dob: true },
      },
      appraiser: { select: { fullName: true } },
      reviewer: { select: { fullName: true } },
    },
  })
  if (!form) notFound()

  const ratings = (form.ratings as Ratings | null) ?? {}
  const goals = (form.goals as GoalRow[] | null) ?? []
  const development = (form.development as DevelopmentRow[] | null) ?? []
  const shown = form.isManagerial ? SECTIONS : CORE_SECTIONS
  const avg = overallAverage(ratings, 'appraiser')

  return (
    <>
      <style>{`
        @page { size: A4; margin: 14mm 12mm; }
        @media print { .no-print { display: none !important } }
        body { background: #fff }
        .sheet { font-family: 'Times New Roman', Georgia, serif; color: #000;
                 max-width: 186mm; margin: 0 auto; padding: 8mm 0; font-size: 11pt }
        .sheet h1 { text-align: center; font-size: 13pt; font-weight: bold;
                    text-decoration: underline; margin: 0 0 14pt }
        .sheet h2 { font-size: 11pt; font-weight: bold; margin: 16pt 0 5pt;
                    text-decoration: underline }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8pt }
        th, td { border: 1px solid #000; padding: 3pt 5pt; vertical-align: top;
                 font-size: 10.5pt }
        th { font-weight: bold; text-align: center }
        td.lbl { font-weight: bold; width: 22% }
        td.num { text-align: center; width: 13%; font-variant-numeric: tabular-nums }
        td.sec { font-weight: bold; text-decoration: underline }
        td.sub { text-align: right; font-weight: bold }
        .idx { font-weight: bold; text-decoration: underline; margin: 10pt 0 5pt;
               font-size: 10.5pt }
        .bands { display: flex; flex-wrap: wrap; gap: 4pt 24pt; margin: 6pt 0 12pt;
                 font-size: 10.5pt; font-style: italic }
        .sigs { display: flex; justify-content: space-around; margin: 26pt 0 10pt;
                text-align: center; font-size: 10.5pt }
        .sigs div { min-width: 46% }
        .rule { border-top: 1px solid #000; margin-bottom: 4pt }
        .hrbox { border: 1px solid #000; padding: 7pt; font-size: 10.5pt; line-height: 2.1 }
        .hrbox .head { font-weight: bold; text-align: center; border-bottom: 1px solid #000;
                       margin: -7pt -7pt 7pt; padding: 4pt; line-height: 1.4 }
        .fill { display: inline-block; min-width: 90pt; border-bottom: 1px solid #000;
                padding: 0 4pt; text-align: center }
        .brk { break-before: page }
      `}</style>

      <div className="no-print" style={{
        maxWidth: '186mm', margin: '0 auto', padding: '12px 0',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
          Use your browser&apos;s Print (Ctrl+P) and choose <strong>Save as PDF</strong>.
        </p>
      </div>

      <div className="sheet">
        <h1>PERFORMANCE APPRAISAL FORM</h1>

        <p style={{ margin: '0 0 8pt', fontSize: '10.5pt' }}>
          <strong>Employee Number:</strong> {form.employee.employeeCode ?? ''}
          <span style={{ marginLeft: '40pt' }}>
            <strong>Assessment Year / Period (</strong> {d(form.periodFrom)}
            <strong> to </strong> {d(form.periodTo)} <strong>)</strong>
          </span>
        </p>

        <table>
          <tbody>
            <tr>
              <td className="lbl">Name :</td><td>{form.employee.fullName}</td>
              <td className="lbl">Qualification :</td><td>{form.qualification ?? ''}</td>
            </tr>
            <tr>
              <td className="lbl">Code :</td><td>{form.employee.employeeCode ?? ''}</td>
              <td className="lbl">Experience : (in the company)</td>
              <td>{form.experienceCompany ?? ''}</td>
            </tr>
            <tr>
              <td className="lbl">Designation :</td><td>{form.designationAtReview ?? ''}</td>
              <td className="lbl">( Total exp )</td><td>{form.experienceTotal ?? ''}</td>
            </tr>
            <tr>
              <td className="lbl">Dept :</td><td>{form.departmentAtReview ?? ''}</td>
              <td className="lbl">Period in present post :</td>
              <td>{form.periodInPresentPost ?? ''}</td>
            </tr>
            <tr>
              <td className="lbl">DOJ :</td><td>{d(form.employee.joiningDate)}</td>
              <td className="lbl">Appraiser :</td><td>{form.appraiser?.fullName ?? ''}</td>
            </tr>
            <tr>
              <td className="lbl">DOB :</td><td>{d(form.employee.dob)}</td>
              <td className="lbl">Reviewer :</td><td>{form.reviewer?.fullName ?? ''}</td>
            </tr>
          </tbody>
        </table>

        <p className="idx">
          Rating Index: {RATING_INDEX.map((r) => `${r.label} – ${r.value}`).join('; ')}
        </p>

        <table>
          <thead>
            <tr>
              <th style={{ width: '8%' }}>SlNo</th>
              <th>PERFORMANCE CRITERIA</th>
              <th style={{ width: '13%' }}>Appraisee</th>
              <th style={{ width: '13%' }}>Appraiser</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((section) => (
              <Fragment key={section.key}>
                <tr>
                  <td className="num">{section.n}</td>
                  <td className="sec" colSpan={3}>{section.title.toUpperCase()}</td>
                </tr>
                {section.criteria.map((c) => (
                  <tr key={c.key}>
                    <td />
                    <td>{c.label}</td>
                    <td className="num">{ratings[c.key]?.appraisee ?? ''}</td>
                    <td className="num">{ratings[c.key]?.appraiser ?? ''}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} className="sub">Sub Total</td>
                  <td className="num">{subTotal(section, ratings, 'appraisee')}</td>
                  <td className="num">{subTotal(section, ratings, 'appraiser')}</td>
                </tr>
              </Fragment>
            ))}
            <tr>
              <td colSpan={2} className="sub">
                Total (Out of {form.isManagerial ? OVERALL_MAX : 100})
              </td>
              <td className="num">{overallTotal(ratings, 'appraisee')}</td>
              <td className="num">{overallTotal(ratings, 'appraiser')}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="brk">OVERALL ASSESSMENT</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: '8%' }}>SlNo</th><th>Criteria</th>
              <th style={{ width: '18%' }}>Appraiser</th>
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((sec, i) => (
              <tr key={sec.key}>
                <td className="num">{i + 1}</td>
                <td>{sec.title}</td>
                <td className="num">
                  {sec.managerialOnly && !form.isManagerial ? '—' : subTotal(sec, ratings, 'appraiser')}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={2} className="sub">TOTAL</td>
              <td className="num">{overallTotal(ratings, 'appraiser')}</td>
            </tr>
            <tr>
              <td colSpan={2} className="sub">
                AVERAGE (Total score/{OVERALL_MAX}*100)
              </td>
              <td className="num">{avg.toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
        <div className="bands">
          <span><strong>Above 90</strong> – Outstanding</span>
          <span><strong>B/w 80 &amp; 89</strong> – Very Good</span>
          <span><strong>B/w 70 &amp; 79</strong> – Good</span>
          <span><strong>B/w 50 &amp; 69</strong> – Average</span>
          <span><strong>Below 49</strong> – Poor</span>
        </div>
        {form.currentSalary != null && form.incrementAmount != null && form.incrementAmount > 0 && (
          <p style={{ fontSize: '10.5pt', margin: '0 0 10pt' }}>
            <strong>Increment earned:</strong>{' '}
            {(form.approvedPct ?? form.recommendedPct ?? 0)}% of PKR{' '}
            {Math.round(form.currentSalary).toLocaleString('en-PK')} ={' '}
            PKR {Math.round(form.incrementAmount).toLocaleString('en-PK')} — revised monthly
            salary PKR {Math.round(form.proposedSalary ?? 0).toLocaleString('en-PK')}.
          </p>
        )}
        {bandFor(avg) && (
          <p style={{ fontSize: '10.5pt', margin: '0 0 12pt' }}>
            <strong>Rating: {bandFor(avg)}</strong>
          </p>
        )}

        {development.length > 0 && (
          <table>
            <thead>
              <tr>
                <th style={{ width: '8%' }}>Sl No</th><th>Criteria</th>
                <th>Areas of Improvement</th><th>Required Training</th>
              </tr>
            </thead>
            <tbody>
              {development.map((r, i) => (
                <tr key={i}>
                  <td className="num">{i + 1}</td>
                  <td>{r.criteria}</td>
                  <td>{r.areas}</td>
                  <td>{r.training}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>PERFORMANCE REVIEW FORM (TO BE FILLED BY THE REVIEWING OFFICER)</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: '8%' }}>SlNo</th><th>Mutual Goals Set</th>
              <th>Actual Performance</th><th style={{ width: '18%' }}>Performance Rating</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((g, i) => (
              <tr key={i} style={{ height: '30pt' }}>
                <td className="num">{i + 1}</td>
                <td>{g.goal}</td><td>{g.actual}</td><td className="num">{g.rating}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="sigs">
          <div>
            <div className="rule" />
            <strong>Sign of the Appraiser</strong>
            <p style={{ margin: '10pt 0 0', textAlign: 'left' }}>
              Date: {d(form.appraiserSignedAt)}
            </p>
          </div>
          <div>
            <div className="rule" />
            <strong>Sign of the Reviewer</strong>
            <p style={{ margin: '10pt 0 0', textAlign: 'left' }}>
              Date: {d(form.reviewerSignedAt)}
            </p>
          </div>
        </div>

        <div className="hrbox">
          <div className="head">For HR Department use only</div>
          Appraisal completed on: <span className="fill">{d(form.completedOn)}</span><br />
          The employee is eligible for an increment of{' '}
          <span className="fill">
            {form.approvedPct != null || form.recommendedPct != null
              ? `${form.approvedPct ?? form.recommendedPct}%`
              : (form.incrementOf ?? '')}
          </span> w.e.f{' '}
          <span className="fill">{d(form.incrementWef)}</span><br />
          The employee can be promoted to{' '}
          <span className="fill">{form.promotedTo ?? ''}</span> w.e.f{' '}
          <span className="fill">{d(form.promotedWef)}</span><br />
          The employee can be transferred to{' '}
          <span className="fill">{form.transferredTo ?? ''}</span> department as{' '}
          <span className="fill">{form.transferredAs ?? ''}</span> w.e.f{' '}
          <span className="fill">{d(form.transferredWef)}</span><br />
          The employee needs training on the following areas:
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, minHeight: '30pt' }}>
            {form.trainingNeeds ?? ''}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20pt', fontSize: '10.5pt' }}>
          <span>Date {d(form.hrSignedAt)}</span>
          <span style={{ textAlign: 'center' }}>
            <span style={{ display: 'block', borderTop: '1px solid #000', minWidth: '110pt', marginBottom: '3pt' }} />
            <strong>Head – HR</strong>
          </span>
        </div>
      </div>
    </>
  )
}
