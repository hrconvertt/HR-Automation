import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { LETTER_TYPE_LABEL, COMPANY, type LetterType } from '@/lib/letter-templates'
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

export default async function PrintLetterPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const tokenPayload = verifyToken(token)
  if (!tokenPayload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: tokenPayload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  const myEmpId = user.employee?.id ?? null

  const letter = await prisma.letterRequest.findUnique({
    where: { id },
    include: {
      employee: {
        select: { id: true, fullName: true, employeeCode: true, designation: true },
      },
    },
  })
  if (!letter) notFound()

  // Authorization: only the employee themselves OR HR can view print page
  const isOwn = letter.employeeId === myEmpId
  const isHR = effectiveRole === 'HR_ADMIN'
  if (!isOwn && !isHR) {
    return (
      <div style={{ padding: 40 }}>
        <h1 style={{ color: '#b91c1c', fontSize: 20, fontWeight: 700 }}>Access denied</h1>
        <p style={{ color: '#7f1d1d', marginTop: 8 }}>
          You don&apos;t have permission to view this letter.
        </p>
      </div>
    )
  }

  if (letter.status === 'PENDING' || letter.status === 'REJECTED' || !letter.letterBody) {
    return (
      <div style={{ padding: 40 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Letter not available</h1>
        <p style={{ color: '#374151', marginTop: 8 }}>
          This letter is in <strong>{letter.status}</strong> status. It must be approved by HR before it can be printed.
        </p>
      </div>
    )
  }

  const subject = LETTER_TYPE_LABEL[letter.letterType as LetterType] ?? 'Letter'
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

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
        {/* Top action bar — hidden on print */}
        <div
          className="no-print"
          style={{
            marginBottom: 24,
            paddingBottom: 12,
            borderBottom: '1px dashed #d1d5db',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            Preview — use your browser&apos;s Print (Ctrl/Cmd&nbsp;+&nbsp;P) and save as PDF.
          </span>
          <PrintButton />
          {/* Auto-trigger print when this page loads */}
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
                <span style={{ fontFamily: 'Menlo, Consolas, monospace' }}>{letter.letterNumber ?? '—'}</span>
              </p>
              <p style={{ margin: '2px 0 0' }}><strong>Date:</strong> {today}</p>
            </div>
          </div>
        </header>

        {/* Subject */}
        <h2 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', textDecoration: 'underline', margin: '0 0 24px' }}>
          {subject.toUpperCase()}
        </h2>

        {/* Body */}
        <div style={{ fontSize: 13, lineHeight: 1.75, color: '#1f2937', whiteSpace: 'pre-wrap' }}>
          {letter.letterBody}
        </div>

        {/* Footer note */}
        <div style={{ marginTop: 48, paddingTop: 12, borderTop: '1px solid #e5e7eb', fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>
          This is a computer-generated letter issued through the Convertt HR system. For verification, contact us at {COMPANY.website}.
        </div>
      </div>
    </>
  )
}
