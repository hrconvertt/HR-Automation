import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { LETTER_TYPE_LABEL, COMPANY, type LetterType } from '@/lib/letter-templates'
import { LOGO_DATA_URI } from '@/lib/brand-logo'
import { LETTERHEAD_ADDRESS_LINES } from '@/lib/brand'
import { PrintButton } from '@/components/letters/print-button'
import { LetterBody } from '@/components/letters/letter-body'

interface PageProps { params: Promise<{ id: string }> }

/**
 * The browser puts the page title in the Save-as-PDF filename box, so the
 * title is the filename. It used to read "Employment Letter", which meant
 * every letter for every employee arrived in Downloads under the same name
 * and had to be renamed by hand before it could be filed or sent.
 *
 * "Sheikh Taha Adnan - Employment Letter" sorts by person and says who it is
 * for. Slashes and colons are stripped because Windows will not have them in
 * a filename.
 */
export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const letter = await prisma.letterRequest.findUnique({
    where: { id },
    select: { letterType: true, employee: { select: { fullName: true } } },
  })
  if (!letter) return { title: 'Letter' }
  const kind = LETTER_TYPE_LABEL[letter.letterType as LetterType] ?? 'Letter'
  const clean = (v: string) => v.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
  return { title: `${clean(letter.employee.fullName)} - ${clean(kind)}` }
}

const PRINT_CSS = `
  @page { size: A4; margin: 0; }
  html, body { background: #fff; }
  body { font-family: 'Times New Roman', Georgia, serif; color: #111827; }
  @media print {
    .no-print { display: none !important; }
    .letter-page {
      box-shadow: none !important;
      margin: 0 !important;
      /* Exactly one sheet: any extra height starts a second, near-empty page. */
      min-height: auto !important;
      height: 297mm;
    }
  }
  @media screen {
    body { background: #f3f4f6; padding: 24px 0; }
  }
`

export default async function PrintLetterPage({ params }: PageProps) {
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
          position: 'relative',
        }}
      >
        {/* The blue gradient bars the issued letters are printed on. */}
        <div style={{
          position: 'absolute', top: 0, left: '10mm', right: '10mm', height: '4.5mm',
          background: 'linear-gradient(90deg, #0857E5 0%, #277FB1 100%)',
          WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
        }} />
        <div style={{
          position: 'absolute', bottom: 0, left: '10mm', right: '10mm', height: '4.5mm',
          background: 'linear-gradient(90deg, #0857E5 0%, #277FB1 100%)',
          WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
        }} />
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

        {/* Letterhead — the real mark and address block, the same ones the
            offer letter and agreements carry. This page used to draw its own:
            a bold "CONVERTT" text wordmark over a one-line address, which is
            not the company's letterhead and did not match a single issued
            document. */}
        <header style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_DATA_URI} alt="Convertt" style={{ height: 36, display: 'block' }} />
            <div style={{ textAlign: 'right', fontSize: 11, lineHeight: 1.45, color: '#1a1a1a' }}>
              {LETTERHEAD_ADDRESS_LINES.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#374151', marginTop: 18 }}>
            <p style={{ margin: 0 }}>
              <strong>Ref:</strong>{' '}
              <span style={{ fontFamily: 'Menlo, Consolas, monospace' }}>{letter.letterNumber ?? '—'}</span>
            </p>
            <p style={{ margin: '2px 0 0' }}><strong>Date:</strong> {today}</p>
          </div>
        </header>

        {/* Subject */}
        <h2 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', textDecoration: 'underline', margin: '0 0 24px' }}>
          {subject.toUpperCase()}
        </h2>

        {/* Body — editable by HR, because the generated wording is a starting
            point and a letter routinely needs a sentence changed before it is
            signed. */}
        <LetterBody
          letterId={letter.id}
          initialBody={letter.letterBody ?? ''}
          canEdit={effectiveRole === 'HR_ADMIN'}
        />

        {/* Who issued it. A confirmation letter with no signatory reads as a
            system printout rather than a company letter. */}
        <div style={{ marginTop: 52, fontSize: 13, color: '#1f2937' }}>
          {/* Room for a wet signature between the sign-off and the name. */}
          <p style={{ margin: '0 0 66px' }}>Yours sincerely,</p>
          <div style={{ borderTop: '1px solid #1a1a1a', width: 200, marginBottom: 5 }} />
          <p style={{ margin: 0, fontWeight: 700 }}>{letter.signedByName ?? 'Syed Khawer'}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11 }}>
            {letter.signedByTitle ?? 'Director Administration'}, Convertt
          </p>
        </div>


      </div>
    </>
  )
}
