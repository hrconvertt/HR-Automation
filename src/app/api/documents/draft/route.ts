/**
 * POST   /api/documents/draft — save the edited copy of a generated document.
 * DELETE /api/documents/draft — throw the edits away and go back to the template.
 *
 * Called by the Done-editing button inside the generated document itself, which
 * is a plain HTML page opened in its own tab. It posts the edited body back so
 * that reopening the document shows what was written rather than the template
 * again.
 *
 * The draft is not the issued document. The signed PDF still gets printed and
 * uploaded into EmployeeDocument; this only stops HR retyping the same
 * amendments every time they open a letter.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

/** Generous — an agreement runs long — but not a place to park a file. */
const MAX_HTML = 400_000

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = request.cookies.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN') return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  return { payload }
}

export async function POST(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({}))
  const employeeId = String(body.employeeId ?? '')
  const docType = String(body.docType ?? '')
  const html = String(body.html ?? '')

  if (!employeeId || !docType) {
    return NextResponse.json({ error: 'employeeId and docType required' }, { status: 400 })
  }
  if (!html.trim()) {
    return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })
  }
  if (html.length > MAX_HTML) {
    return NextResponse.json({ error: 'That document is too large to save' }, { status: 413 })
  }

  await prisma.documentDraft.upsert({
    where: { employeeId_docType: { employeeId, docType } },
    update: { html, editedById: auth.payload!.userId },
    create: { employeeId, docType, html, editedById: auth.payload!.userId },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const employeeId = searchParams.get('employeeId') ?? ''
  const docType = searchParams.get('docType') ?? ''
  if (!employeeId || !docType) {
    return NextResponse.json({ error: 'employeeId and docType required' }, { status: 400 })
  }

  await prisma.documentDraft.deleteMany({ where: { employeeId, docType } })
  return NextResponse.json({ ok: true })
}
