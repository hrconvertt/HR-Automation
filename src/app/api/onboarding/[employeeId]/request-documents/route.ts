/**
 * GET  /api/onboarding/[employeeId]/request-documents
 *   Build the request email for whatever documents are still outstanding.
 *   Read-only — does not record anything, so the dialog can preview it.
 *
 * POST /api/onboarding/[employeeId]/request-documents
 *   Same, and stamps documentsRequestedAt so the workspace shows it was asked.
 *
 * The list is computed from this person's own onboarding tasks: an
 * employee-uploadable task that is not yet complete and has no file attached is
 * still outstanding. Nobody is asked for a document they have already given.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { buildDocumentRequest, ONBOARDING_DOCUMENT_LABELS } from '@/lib/onboarding-request'

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = request.cookies.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN') return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  return { payload }
}

async function buildFor(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true, fullName: true, joiningDate: true,
      onboarding: {
        select: {
          tasks: {
            where: { isEmployeeUploadable: true },
            select: {
              documentType: true, title: true, isComplete: true, status: true,
              attachedDocumentId: true,
            },
          },
        },
      },
    },
  })
  if (!employee) return null

  // Outstanding = an upload task that is neither complete nor already backed by
  // a file. Falls back to the standard five when the checklist has no tasks yet.
  const tasks = employee.onboarding?.tasks ?? []
  const outstanding = tasks.filter(
    (t) => !t.attachedDocumentId && t.status !== 'COMPLETED' && t.status !== 'NOT_REQUIRED' && !t.isComplete,
  )

  const docs = (outstanding.length
    ? outstanding.map((t) => ({
        documentType: t.documentType ?? 'OTHER',
        label: t.documentType && ONBOARDING_DOCUMENT_LABELS[t.documentType]
          ? ONBOARDING_DOCUMENT_LABELS[t.documentType]
          : t.title,
      }))
    : Object.entries(ONBOARDING_DOCUMENT_LABELS)
        .filter(([k]) => k !== 'BANK')
        .map(([documentType, label]) => ({ documentType, label })))

  const base = process.env.APP_URL ?? 'https://hr.convertt.co'
  const email = buildDocumentRequest({
    employeeName: employee.fullName,
    docs,
    // The intake form is the front door — it collects the information and links
    // on to the document uploads.
    uploadUrl: `${base}/dashboard/onboarding/${employee.id}/intake`,
    firstDay: employee.joiningDate,
  })

  return { employee, docs, email }
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ employeeId: string }> }) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { employeeId } = await ctx.params
  const built = await buildFor(employeeId)
  if (!built) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  return NextResponse.json({ docs: built.docs, ...built.email })
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ employeeId: string }> }) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { employeeId } = await ctx.params
  const built = await buildFor(employeeId)
  if (!built) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // Record the ask. Create the checklist row if the hire predates onboarding.
  await prisma.onboardingChecklist.upsert({
    where: { employeeId },
    update: { documentsRequestedAt: new Date() },
    create: { employeeId, documentsRequestedAt: new Date() },
  })

  return NextResponse.json({ ok: true, docs: built.docs, ...built.email })
}
