/**
 * The Manpower Requisition Form, on paper.
 *
 * Boxed throughout, as the issued form is — the position block, the terms with
 * their tick boxes, the free-text responsibilities, the department's headcount,
 * the requirement rows, then the approval chain and the two standing notes.
 */
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const d = (x: Date | null) =>
  x ? x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''

/** A printed tick box. Checked when the option is the one chosen. */
function Box({ on }: { on: boolean }) {
  return <span className="box">{on ? '☒' : '☐'}</span>
}

const NATURE_LABEL: Record<string, string> = {
  REPLACEMENT: 'Replacement',
  ADDITION: 'Addition to the existing resource',
  NEW_POSITION: 'A new position altogether',
}

export default async function ManpowerRequisitionPrintPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  const f = await prisma.manpowerRequisition.findUnique({
    where: { id },
    include: { requisition: { select: { title: true, departmentId: true } } },
  })
  if (!f) notFound()

  const dept = f.requisition.departmentId
    ? await prisma.department.findUnique({
      where: { id: f.requisition.departmentId }, select: { name: true },
    })
    : null

  const rows: [string, string][] = [
    ['Grade:', f.grade ?? ''],
    ['Department Head:', f.departmentHead ?? ''],
    ['Reporting Head:', f.reportingHead ?? ''],
    ['Whether replacement or addition to the existing resource or a new position altogether:',
      f.requirementNature ? NATURE_LABEL[f.requirementNature] ?? '' : ''],
    ['If a replacement, Name and Designation of the position to be replaced:', f.replacingWhom ?? ''],
    ['Educational qualification (Must have):', f.qualificationMust ?? ''],
    ['Educational qualification (Additional):', f.qualificationAdditional ?? ''],
    ['Desired yrs of experience:', f.desiredExperience ?? ''],
    ['Skills :', f.skills ?? ''],
    ['Place of work:', f.placeOfWork ?? ''],
    ['Requirement to be filled in by', d(f.fillBy)],
  ]

  const signs: [string, string, string, string][] = [
    ['Requested by:', f.requestedBy ?? '', 'Requisition date:', d(f.requisitionDate)],
    ['Dept / Division Head:', f.divisionHead ?? '', 'Reviewed date:', d(f.divisionHeadDate)],
    ['Head HR', f.headHr ?? '', 'Reviewed Date:', d(f.headHrDate)],
    ['Director (Personnel)/ Director (Finance)/ Director (Technical)', f.director ?? '',
      'Approval date:', d(f.directorDate)],
    ['Chairman & Managing Director', f.managingDirector ?? '', 'Approval date:', d(f.managingDirectorDate)],
  ]

  return (
    <>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { .no-print { display: none !important } }
        body { background: #fff }
        .sheet { font-family: Calibri, 'Segoe UI', Arial, sans-serif; color: #000;
                 max-width: 186mm; margin: 0 auto; padding: 6mm 0; font-size: 10pt }
        .sheet h1 { text-align: center; font-size: 12pt; font-weight: bold; margin: 0 0 14pt }
        .sheet h1 u { text-decoration: underline }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10pt }
        td, th { border: 1px solid #000; padding: 4pt 6pt; vertical-align: top; font-size: 10pt }
        td.k { font-weight: bold; width: 30% }
        td.k2 { font-weight: bold; width: 24% }
        .box { font-size: 12pt; margin-left: 6pt }
        .desc { min-height: 120pt }
        .note { border: 1px solid #000; padding: 5pt 7pt; font-size: 9.5pt; margin-top: 12pt }
        .note p { margin: 0 0 3pt }
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
        <h1>MANPOWER <u>REQUISITION</u> FORM</h1>

        <table>
          <tbody>
            <tr>
              <td className="k">Job Code (If applicable)</td><td>{f.jobCode ?? ''}</td>
              <td className="k2">No of Positions</td><td>{f.noOfPositions ?? ''}</td>
            </tr>
            <tr>
              <td className="k">Department</td><td>{dept?.name ?? ''}</td>
              <td className="k2">Designation</td><td>{f.designation ?? f.requisition.title}</td>
            </tr>
            <tr>
              <td className="k">Cost Center (If applicable)</td><td colSpan={3}>{f.costCenter ?? ''}</td>
            </tr>
          </tbody>
        </table>

        <table>
          <tbody>
            <tr>
              <td className="k">State whether the proposed appointment is</td>
              <td>Permanent <Box on={f.appointmentType === 'PERMANENT'} /></td>
              <td>Temporary <Box on={f.appointmentType === 'TEMPORARY'} /></td>
            </tr>
            <tr>
              <td className="k">Is this a sanctioned position?</td>
              <td>YES <Box on={f.sanctioned === true} /></td>
              <td>NO <Box on={f.sanctioned === false} /></td>
            </tr>
            <tr>
              <td className="k">Has the Job Description been attached?</td>
              <td>YES <Box on={f.jdAttached === true} /></td>
              <td>NO <Box on={f.jdAttached === false} /></td>
            </tr>
            <tr>
              <td className="k">If the position is temporary, State the duration of the contract:-</td>
              <td colSpan={2}>{f.contractDuration ?? ''}</td>
            </tr>
            <tr>
              <td colSpan={3}>
                <strong>Work Description / Responsibilities*:</strong>{' '}
                (Attach Job Description additionally)
                <br />
                <span style={{ fontSize: '9pt' }}>
                  *Please specify the Roles and Responsibilities in detail
                  [More elaborate for informing Manpower Consultants]
                </span>
                <div className="desc" style={{ whiteSpace: 'pre-wrap', marginTop: '6pt' }}>
                  {f.workDescription ?? ''}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <table>
          <tbody>
            <tr>
              <td className="k">Manpower currently available in the Department</td>
              <td className="k2">Permanent Employees:</td>
              <td>{f.currentPermanent ?? ''}</td>
            </tr>
            <tr>
              <td className="k">Temporary Employees:</td>
              <td className="k2">Consultants, if any:-</td>
              <td>{f.currentConsultants ?? ''}</td>
            </tr>
            <tr>
              <td>{f.currentTemporary ?? ''}</td>
              <td colSpan={2} />
            </tr>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td colSpan={2}>{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table>
          <tbody>
            {signs.map(([who, name, dateLabel, dateValue]) => (
              <tr key={who}>
                <td className="k"><strong>{who}</strong></td>
                <td style={{ width: '20%' }}>{name}</td>
                <td className="k2"><strong>{dateLabel}</strong></td>
                <td>{dateValue}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="note">
          <p><strong>Note:</strong></p>
          <p>All the fields provided are mandatory and must be filled with sufficient details.</p>
          <p>
            Filling up this form and getting it approved becomes mandatory even for temporary
            appointment at sites.
          </p>
          <p>All the requisitions will be processed only after the necessary approvals.</p>
        </div>
      </div>
    </>
  )
}
