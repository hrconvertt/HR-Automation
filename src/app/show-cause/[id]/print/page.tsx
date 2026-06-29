import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { COMPANY } from '@/lib/letter-templates'
import { PrintButton } from '@/components/letters/print-button'

interface PageProps { params: Promise<{ id: string }> }

const PRINT_CSS = `
  @page { size: A4; margin: 22mm 20mm; }
  html, body { background: #fff; }
  body { font-family: 'Times New Roman', Georgia, serif; color: #111827; }
  @media print {
    .no-print { display: none !important; }
    .letter-page { box-shadow: none !important; margin: 0 !important; }
  }
  @media screen {
    body { background: #f3f4f6; padding: 24px 0; }
  }
`

export default async function PrintShowCausePage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const tokenPayload = await verifyToken(token)
  if (!tokenPayload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: tokenPayload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role

  const notice = await prisma.showCause.findUnique({
    where: { id },
    include: {
      employee: {
        select: { id: true, fullName: true, employeeCode: true, designation: true, department: { select: { name: true } } },
      },
    },
  })
  if (!notice) notFound()

  // Auth: HR, Executive, or the employee themselves can view + print.
  const isOwn = notice.employeeId === user.employee?.id
  const isHR = effectiveRole === 'HR_ADMIN'
  const isExec = effectiveRole === 'EXECUTIVE'
  if (!isOwn && !isHR && !isExec) {
    return (
      <div style={{ padding: 40 }}>
        <h1 style={{ color: '#b91c1c', fontSize: 20, fontWeight: 700 }}>Access denied</h1>
        <p style={{ color: '#7f1d1d', marginTop: 8 }}>
          You don&apos;t have permission to view this Show Cause notice.
        </p>
      </div>
    )
  }

  if (!notice.issueDate || (notice.status !== 'ISSUED' && notice.status !== 'RESPONDED' && notice.status !== 'RESOLVED' && notice.status !== 'ESCALATED_TO_PIP')) {
    return (
      <div style={{ padding: 40 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Notice not yet issued</h1>
        <p style={{ color: '#374151', marginTop: 8 }}>
          This Show Cause is in <strong>{notice.status}</strong> status. It must be formally issued by HR before it can be printed.
        </p>
      </div>
    )
  }

  const issueDate = new Date(notice.issueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const deadline = notice.deadline
    ? new Date(notice.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : null

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div
        className="letter-page"
        style={{
          maxWidth: '210mm',
          margin: '0 auto',
          minHeight: '297mm',
          background: '#fff',
          padding: '20mm 18mm',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          boxSizing: 'border-box',
        }}
      >
        <div
          className="no-print"
          style={{
            marginBottom: 24, paddingBottom: 12,
            borderBottom: '1px dashed #d1d5db',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            Preview — use your browser&apos;s Print (Ctrl/Cmd&nbsp;+&nbsp;P) and save as PDF.
          </span>
          <PrintButton />
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{if(window.matchMedia('(min-width: 600px)').matches){setTimeout(function(){window.print();},400);}}catch(e){}})();`,
            }}
          />
        </div>

        {/* Letterhead */}
        <header style={{ borderBottom: '2px solid #111827', paddingBottom: 14, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: 2, margin: 0, color: '#111827' }}>
                {COMPANY.name.toUpperCase()}
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#4b5563' }}>{COMPANY.address}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#4b5563' }}>{COMPANY.website}</p>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#374151' }}>
              <p style={{ margin: 0 }}>
                <strong>Ref:</strong>{' '}
                <span style={{ fontFamily: 'Menlo, Consolas, monospace' }}>SC/{notice.id.slice(-8).toUpperCase()}</span>
              </p>
              <p style={{ margin: '2px 0 0' }}><strong>Date:</strong> {issueDate}</p>
            </div>
          </div>
        </header>

        <h2 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', textDecoration: 'underline', margin: '0 0 24px' }}>
          SHOW CAUSE NOTICE
        </h2>

        {/* Addressee block */}
        <div style={{ fontSize: 13, lineHeight: 1.75, color: '#1f2937', marginBottom: 24 }}>
          <p style={{ margin: 0 }}><strong>To:</strong></p>
          <p style={{ margin: '4px 0 0' }}>{notice.employee.fullName}</p>
          <p style={{ margin: 0 }}>{notice.employee.designation}{notice.employee.department?.name ? ` · ${notice.employee.department.name}` : ''}</p>
          <p style={{ margin: 0 }}>Employee Code: {notice.employee.employeeCode}</p>
        </div>

        {/* Subject */}
        <p style={{ fontSize: 13, margin: '0 0 16px' }}>
          <strong>Subject:</strong> Show Cause Notice — {notice.issueType.replace('_', ' ')}
          {notice.occurrenceNo > 1 ? ` (Occurrence #${notice.occurrenceNo})` : ''}
        </p>

        {/* Body */}
        <div style={{ fontSize: 13, lineHeight: 1.85, color: '#1f2937', whiteSpace: 'pre-wrap' }}>
          <p style={{ margin: '0 0 12px' }}>Dear {notice.employee.fullName.split(' ')[0]},</p>

          <p style={{ margin: '0 0 12px' }}>
            This notice is issued to you in connection with the following concern observed in your conduct / performance:
          </p>

          <div style={{
            padding: '12px 16px',
            background: '#f9fafb',
            borderLeft: '3px solid #111827',
            margin: '12px 0',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
          }}>
            {notice.description || notice.meetingConcerns || notice.escalationReason || 'See attached pattern record.'}
          </div>

          <p style={{ margin: '12px 0' }}>
            You are hereby required to <strong>show cause in writing</strong> as to why disciplinary action should not be taken against you under the company&apos;s policies and applicable labour laws.
          </p>

          {deadline && (
            <p style={{ margin: '12px 0' }}>
              Your written response must reach the HR department by <strong>{deadline}</strong>. Failure to respond within the stipulated time may result in further disciplinary action being initiated without further notice.
            </p>
          )}

          <p style={{ margin: '12px 0' }}>
            You may submit your response through the HR portal or directly to the HR department. You are entitled to present any mitigating circumstances or supporting evidence in your defence.
          </p>

          <p style={{ margin: '12px 0' }}>
            This notice is issued without prejudice to the company&apos;s rights under the employment contract and applicable laws.
          </p>
        </div>

        {/* Signature block */}
        <div style={{ marginTop: 56, display: 'flex', justifyContent: 'space-between', gap: 48 }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: '1px solid #111827', paddingTop: 6, fontSize: 12 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{notice.issuedBy ?? 'Human Resources'}</p>
              <p style={{ margin: '2px 0 0', color: '#4b5563' }}>For {COMPANY.name}</p>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: '1px solid #111827', paddingTop: 6, fontSize: 12 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>Employee Acknowledgement</p>
              <p style={{ margin: '2px 0 0', color: '#4b5563' }}>{notice.employee.fullName}</p>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 48, paddingTop: 12, borderTop: '1px solid #e5e7eb', fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>
          This is a computer-generated notice issued through the Convertt HR system. For verification, contact HR at {COMPANY.website}.
        </div>
      </div>
    </>
  )
}
