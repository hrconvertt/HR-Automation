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

export default async function PrintTerminationNoticePage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
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

  const termination = await prisma.termination.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          joiningDate: true, department: { select: { name: true } },
        },
      },
    },
  })
  if (!termination) notFound()

  // Auth: HR, Executive, or the employee themselves.
  const isOwn = termination.employeeId === user.employee?.id
  const isHR = effectiveRole === 'HR_ADMIN'
  const isExec = effectiveRole === 'EXECUTIVE'
  if (!isOwn && !isHR && !isExec) {
    return (
      <div style={{ padding: 40 }}>
        <h1 style={{ color: '#b91c1c', fontSize: 20, fontWeight: 700 }}>Access denied</h1>
        <p style={{ color: '#7f1d1d', marginTop: 8 }}>
          You don&apos;t have permission to view this termination notice.
        </p>
      </div>
    )
  }

  if (!termination.noticeIssuedAt) {
    return (
      <div style={{ padding: 40 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Notice not yet issued</h1>
        <p style={{ color: '#374151', marginTop: 8 }}>
          This termination is in <strong>{termination.status}</strong> status. The formal notice must be issued by HR before it can be printed.
        </p>
      </div>
    )
  }

  const noticeDate = new Date(termination.noticeIssuedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const lwd = new Date(termination.lastWorkingDay).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const joined = new Date(termination.employee.joiningDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const reasonLabel = termination.reasonCategory.replace(/_/g, ' ').toLowerCase()

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
                <span style={{ fontFamily: 'Menlo, Consolas, monospace' }}>TRM/{termination.id.slice(-8).toUpperCase()}</span>
              </p>
              <p style={{ margin: '2px 0 0' }}><strong>Date:</strong> {noticeDate}</p>
            </div>
          </div>
        </header>

        <h2 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', textDecoration: 'underline', margin: '0 0 24px' }}>
          TERMINATION NOTICE
        </h2>

        {/* Addressee */}
        <div style={{ fontSize: 13, lineHeight: 1.75, color: '#1f2937', marginBottom: 24 }}>
          <p style={{ margin: 0 }}><strong>To:</strong></p>
          <p style={{ margin: '4px 0 0' }}>{termination.employee.fullName}</p>
          <p style={{ margin: 0 }}>
            {termination.employee.designation}
            {termination.employee.department?.name ? ` · ${termination.employee.department.name}` : ''}
          </p>
          <p style={{ margin: 0 }}>Employee Code: {termination.employee.employeeCode}</p>
          <p style={{ margin: 0 }}>Date of Joining: {joined}</p>
        </div>

        <p style={{ fontSize: 13, margin: '0 0 16px' }}>
          <strong>Subject:</strong> Notice of Termination of Employment
        </p>

        <div style={{ fontSize: 13, lineHeight: 1.85, color: '#1f2937' }}>
          <p style={{ margin: '0 0 12px' }}>Dear {termination.employee.fullName.split(' ')[0]},</p>

          <p style={{ margin: '0 0 12px' }}>
            This letter serves as formal notice that your employment with {COMPANY.name} is being terminated
            on the grounds of <strong>{reasonLabel}</strong>
            {termination.showCauseId ? ', following the disciplinary proceedings previously issued to you under the Show Cause Notice referenced in your record' : ''}.
          </p>

          <div style={{
            padding: '12px 16px',
            background: '#f9fafb',
            borderLeft: '3px solid #111827',
            margin: '12px 0',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
          }}>
            {termination.reason}
          </div>

          <p style={{ margin: '12px 0' }}>
            Your last working day will be: <strong>{lwd}</strong>.
          </p>

          <p style={{ margin: '12px 0' }}>
            You are required to complete the exit clearance formalities, return all company property, and hand over
            all documents, credentials, and pending work to your reporting manager before the last working day.
          </p>

          <p style={{ margin: '12px 0' }}>
            Final settlement will be processed as per company policy and statutory requirements, including any
            payment of dues, leave encashment, and applicable deductions. The Finance department will communicate
            the settlement statement in due course.
          </p>

          <p style={{ margin: '12px 0' }}>
            This notice is issued without prejudice to the company&apos;s rights under the employment contract
            and applicable labour laws.
          </p>
        </div>

        {/* Signatures */}
        <div style={{ marginTop: 56, display: 'flex', justifyContent: 'space-between', gap: 48 }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: '1px solid #111827', paddingTop: 6, fontSize: 12 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{termination.initiatedByName ?? 'Human Resources'}</p>
              <p style={{ margin: '2px 0 0', color: '#4b5563' }}>For {COMPANY.name}</p>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: '1px solid #111827', paddingTop: 6, fontSize: 12 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>Employee Acknowledgement</p>
              <p style={{ margin: '2px 0 0', color: '#4b5563' }}>{termination.employee.fullName}</p>
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
