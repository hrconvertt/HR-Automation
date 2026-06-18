import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AutoPrint, PrintButton } from './auto-print'

interface PageProps { params: Promise<{ id: string }> }

const PRINT_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  html, body { background: #fff; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111827; font-size: 11pt; line-height: 1.45; }
  @media print {
    .no-print { display: none !important; }
    .report-page { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
    h1, h2, h3 { page-break-after: avoid; }
    section { page-break-inside: avoid; }
  }
  @media screen {
    body { background: #f3f4f6; padding: 24px 0; }
    .report-page { max-width: 800px; margin: 0 auto; background: #fff; padding: 32px 36px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 6px; }
  }
  h1 { font-size: 18pt; margin: 0 0 4px; }
  h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: 1.2px; color: #6b7280; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
  h3 { font-size: 10pt; color: #374151; margin: 10px 0 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { padding: 6px 8px; border: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
  th { background: #f9fafb; font-weight: 600; color: #374151; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; }
  .field { flex: 1 1 30%; min-width: 160px; }
  .field-label { font-size: 8pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.6px; }
  .field-value { font-size: 11pt; font-weight: 500; color: #111827; margin-top: 2px; }
  .bar { background: #e5e7eb; height: 10px; border-radius: 4px; overflow: hidden; margin-top: 3px; }
  .bar-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #6366f1); }
  .sig-block { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 28px; }
  .sig { border-top: 1px solid #9ca3af; padding-top: 4px; font-size: 9pt; text-align: center; color: #6b7280; }
  .rating-hero { display: flex; align-items: center; gap: 18px; padding: 14px 18px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; }
  .rating-number { font-size: 36pt; font-weight: 700; color: #4f46e5; line-height: 1; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 9pt; font-weight: 600; }
  .badge-exceeds { background: #d1fae5; color: #065f46; }
  .badge-meets { background: #dbeafe; color: #1e40af; }
  .badge-below { background: #fef3c7; color: #92400e; }
  .badge-unsat { background: #fee2e2; color: #991b1b; }
  .narrative { font-size: 10pt; color: #374151; white-space: pre-wrap; background: #f9fafb; padding: 10px 12px; border-radius: 4px; border-left: 3px solid #d1d5db; }
  .print-btn { background: #2563eb; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; }
`

const DIM_LABELS: Array<[keyof DimScores, string]> = [
  ['teamworkScore', 'Teamwork'],
  ['ownershipScore', 'Ownership'],
  ['communicationScore', 'Communication'],
  ['reliabilityScore', 'Reliability'],
  ['initiativeScore', 'Initiative'],
  ['adaptabilityScore', 'Adaptability'],
]

interface DimScores {
  teamworkScore: number | null
  ownershipScore: number | null
  communicationScore: number | null
  reliabilityScore: number | null
  initiativeScore: number | null
  adaptabilityScore: number | null
}

function categoryBadgeClass(cat: string | null): string {
  if (cat === 'EXCEEDS') return 'badge badge-exceeds'
  if (cat === 'MEETS') return 'badge badge-meets'
  if (cat === 'BELOW') return 'badge badge-below'
  if (cat === 'UNSATISFACTORY') return 'badge badge-unsat'
  return 'badge'
}

function fmtPct(n: number | null | undefined, total: number | null | undefined): string {
  if (n == null || !total || total === 0) return '—'
  return `${Math.round((n / total) * 100)}%`
}

export default async function PerformanceReportPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  const myEmpId = user.employee?.id ?? null

  const review = await prisma.performanceReview.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          department: { select: { name: true } },
          reportingManager: { select: { id: true, fullName: true } },
          reportingManagerId: true,
        },
      },
      goals: true,
    },
  })
  if (!review) notFound()

  const isOwn = review.employeeId === myEmpId
  const isMyTeamMember = review.employee.reportingManagerId === myEmpId
  const isHR = effectiveRole === 'HR_ADMIN'

  // Authorization: HR always; employee + manager only when HR_FINALIZED
  const canView = isHR || ((isOwn || isMyTeamMember) && review.status === 'HR_FINALIZED')
  if (!canView) {
    return (
      <div style={{ padding: 40 }}>
        <h1 style={{ color: '#b91c1c', fontSize: 20, fontWeight: 700 }}>Report not available</h1>
        <p style={{ color: '#7f1d1d', marginTop: 8 }}>
          The performance report becomes printable once HR has finalized this review.
        </p>
      </div>
    )
  }

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const totalGoalWeight = review.goals.reduce((sum, g) => sum + (g.weight || 0), 0)
  const punctuality = review.daysWorked && review.lateArrivalCount != null
    ? `${Math.max(0, Math.round(((review.daysWorked - review.lateArrivalCount) / review.daysWorked) * 100))}%`
    : '—'

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <AutoPrint />
      <div className="no-print" style={{ maxWidth: 800, margin: '0 auto 12px', padding: '0 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <a href={`/dashboard/performance/${review.id}`} style={{ background: '#e5e7eb', color: '#374151', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Back</a>
        <PrintButton />
      </div>

      <article className="report-page">
        {/* Header */}
        <header style={{ borderBottom: '2px solid #4f46e5', paddingBottom: 12, marginBottom: 18 }}>
          <h1>Performance Report</h1>
          <p style={{ color: '#6b7280', fontSize: 10, margin: 0 }}>Convertt · Issued {today}</p>
          <div className="row" style={{ marginTop: 14 }}>
            <div className="field">
              <div className="field-label">Employee</div>
              <div className="field-value">{review.employee.fullName}</div>
            </div>
            <div className="field">
              <div className="field-label">Code</div>
              <div className="field-value">{review.employee.employeeCode}</div>
            </div>
            <div className="field">
              <div className="field-label">Designation</div>
              <div className="field-value">{review.employee.designation}</div>
            </div>
            <div className="field">
              <div className="field-label">Department</div>
              <div className="field-value">{review.employee.department?.name ?? '—'}</div>
            </div>
            <div className="field">
              <div className="field-label">Period</div>
              <div className="field-value">{review.reviewPeriod} · {review.reviewType}</div>
            </div>
            <div className="field">
              <div className="field-label">Manager</div>
              <div className="field-value">{review.employee.reportingManager?.fullName ?? '—'}</div>
            </div>
          </div>
        </header>

        {/* 1. Overall Rating */}
        <section>
          <h2>Overall Rating</h2>
          <div className="rating-hero">
            <div className="rating-number">{review.overallRating != null ? review.overallRating.toFixed(1) : '—'}</div>
            <div>
              <p style={{ margin: 0, fontSize: 9, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.6 }}>Final Category</p>
              <p style={{ margin: '4px 0 0' }}>
                <span className={categoryBadgeClass(review.finalCategory)}>{review.finalCategory ?? '—'}</span>
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 9, color: '#6b7280' }}>
                Behavioral avg: {review.behavioralAvg?.toFixed(1) ?? '—'} · Individual: {review.individualScore?.toFixed(1) ?? '—'} · Time: {review.timeScore?.toFixed(1) ?? '—'}
              </p>
            </div>
          </div>
        </section>

        {/* 2. Work Assessment */}
        <section>
          <h2>Work Assessment</h2>
          <p style={{ fontSize: 10, color: '#6b7280', margin: '0 0 6px' }}>
            Individual score: <strong>{review.individualScore?.toFixed(1) ?? '—'}</strong> · Total goal weight: {totalGoalWeight}
          </p>
          {review.goals.length === 0 ? (
            <p style={{ fontSize: 10, color: '#6b7280' }}>No goals recorded for this period.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Goal</th>
                  <th>KPI / Target</th>
                  <th style={{ width: 70 }}>Weight</th>
                  <th style={{ width: 90 }}>Achievement</th>
                  <th style={{ width: 90 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {review.goals.map((g) => (
                  <tr key={g.id}>
                    <td>{g.description}</td>
                    <td style={{ fontSize: 9, color: '#374151' }}>
                      {g.kpi ? <div><strong>{g.kpi}</strong></div> : null}
                      {g.target ? <div>{g.target}</div> : null}
                    </td>
                    <td className="tabular-nums">{g.weight}</td>
                    <td className="tabular-nums">{g.achievement != null ? `${g.achievement}%` : '—'}</td>
                    <td>{g.status.replace('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {(review.goalsOnTime != null || review.goalsLate != null) && (
            <p style={{ fontSize: 10, color: '#6b7280', marginTop: 6 }}>
              On-time delivery: {review.goalsOnTime ?? 0} on time · {review.goalsLate ?? 0} late
              {' · '}{fmtPct(review.goalsOnTime, (review.goalsOnTime ?? 0) + (review.goalsLate ?? 0))}
            </p>
          )}
        </section>

        {/* 3. Behavioral */}
        <section>
          <h2>Behavioral Assessment</h2>
          <table>
            <tbody>
              {DIM_LABELS.map(([key, label]) => {
                const v = (review as unknown as DimScores)[key]
                const pct = v != null ? Math.max(0, Math.min(100, (v / 5) * 100)) : 0
                return (
                  <tr key={key}>
                    <td style={{ width: '30%' }}>{label}</td>
                    <td>
                      <div className="bar"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
                    </td>
                    <td style={{ width: 60, textAlign: 'right' }}>{v != null ? `${v.toFixed(1)} / 5` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        {/* 4. Time & Attendance */}
        <section>
          <h2>Time &amp; Attendance</h2>
          <div className="row">
            <div className="field">
              <div className="field-label">Days Worked</div>
              <div className="field-value">{review.daysWorked ?? '—'}</div>
            </div>
            <div className="field">
              <div className="field-label">Days Absent</div>
              <div className="field-value">{review.daysAbsent ?? '—'}</div>
            </div>
            <div className="field">
              <div className="field-label">Days on Leave</div>
              <div className="field-value">{review.daysOnLeave ?? '—'}</div>
            </div>
            <div className="field">
              <div className="field-label">Late Arrivals</div>
              <div className="field-value">{review.lateArrivalCount ?? '—'}</div>
            </div>
            <div className="field">
              <div className="field-label">Avg Hours / Day</div>
              <div className="field-value">{review.avgHoursPerDay != null ? review.avgHoursPerDay.toFixed(2) : '—'}</div>
            </div>
            <div className="field">
              <div className="field-label">Punctuality</div>
              <div className="field-value">{punctuality}</div>
            </div>
          </div>
        </section>

        {/* 5. Manager Narrative */}
        <section>
          <h2>Manager Narrative</h2>
          {review.managerFeedback ? (
            <div className="narrative">{review.managerFeedback}</div>
          ) : (
            <p style={{ fontSize: 10, color: '#6b7280', fontStyle: 'italic' }}>No narrative recorded.</p>
          )}
        </section>

        {/* 6. Self-Assessment */}
        <section>
          <h2>Self-Assessment</h2>
          <h3>Achievements</h3>
          <div className="narrative">{review.achievements || '—'}</div>
          <h3>Learnings</h3>
          <div className="narrative">{review.learnings || '—'}</div>
          <h3>Team Contribution</h3>
          <div className="narrative">{review.teamContribution || '—'}</div>
        </section>

        {/* 7. HR Finalization */}
        <section>
          <h2>HR Finalization</h2>
          <div className="row">
            <div className="field">
              <div className="field-label">Overall Rating</div>
              <div className="field-value">{review.overallRating != null ? review.overallRating.toFixed(1) : '—'}</div>
            </div>
            <div className="field">
              <div className="field-label">Final Category</div>
              <div className="field-value">
                <span className={categoryBadgeClass(review.finalCategory)}>{review.finalCategory ?? '—'}</span>
              </div>
            </div>
            <div className="field">
              <div className="field-label">Status</div>
              <div className="field-value">{review.status.replace('_', ' ')}</div>
            </div>
          </div>
        </section>

        {/* 8. Signatures */}
        <div className="sig-block">
          <div className="sig">Employee<br/><span style={{ fontSize: 8 }}>Date: ____________</span></div>
          <div className="sig">Manager<br/><span style={{ fontSize: 8 }}>Date: ____________</span></div>
          <div className="sig">HR<br/><span style={{ fontSize: 8 }}>Date: ____________</span></div>
        </div>
      </article>
    </>
  )
}
