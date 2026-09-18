/**
 * GET /api/letters/:id/pdf[?download=1] — a letter on the letterhead, as a PDF.
 *
 * Approved and issued letters: the employee, their manager and HR. A request
 * still waiting: HR only, drawn from the record as it would be issued, so HR
 * can read it before approving.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { renderLetterText } from '@/lib/pdf/employment-letter'
import { letterLabel, storedLetterText } from '@/lib/letter-text'
import { draftTemplateLetter, resolveLetterAccess } from '@/lib/letters-server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolveLetterAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const letter = await prisma.letterRequest.findUnique({
    where: { id },
    include: { employee: { select: { fullName: true, reportingManagerId: true } } },
  })
  if (!letter) return NextResponse.json({ error: 'Letter not found.' }, { status: 404 })

  const isHr = access.effectiveRole === 'HR_ADMIN'
  const mine = !!access.employeeId && letter.employeeId === access.employeeId
  const myTeam = !!access.employeeId && letter.employee.reportingManagerId === access.employeeId
  if (!isHr && !mine && !myTeam) return NextResponse.json({ error: 'You cannot open this letter.' }, { status: 403 })

  const issued = letter.status === 'APPROVED' || letter.status === 'GENERATED'
  let text = issued ? storedLetterText(letter) : null
  if (!issued) {
    if (!isHr || letter.status !== 'PENDING') {
      return NextResponse.json({ error: 'This letter has not been approved.' }, { status: 403 })
    }
    text = (await draftTemplateLetter(letter.letterType, letter.employeeId, letter))?.text ?? null
  }
  if (!text) return NextResponse.json({ error: 'This letter has no text.' }, { status: 404 })

  const { bytes, fits } = await renderLetterText(text)
  const name = `${letter.employee.fullName} - ${letterLabel(letter.letterType)}`.replace(/[^a-zA-Z0-9 ._-]/g, '')
  const disposition = request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${name}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Letter-Fits': fits ? '1' : '0',
    },
  })
}
