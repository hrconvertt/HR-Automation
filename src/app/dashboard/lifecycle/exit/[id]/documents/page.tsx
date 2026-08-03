import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import { exitDocumentsFor, type ExitScenario } from '@/lib/exit-documents'
import { ExitDocumentBoard, type AttachedDoc } from './_components/exit-document-board'

/**
 * Document prerequisites for one exit clearance — the checklist HR works
 * through, on its own screen rather than crammed into the clearance form.
 */
export default async function ExitDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  const previewRole = me?.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? me?.role
  if (effectiveRole !== 'HR_ADMIN') {
    return (
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">Exit documents are HR-only.</p>
      </div>
    )
  }
  const canEdit = me?.role === 'HR_ADMIN' && !previewRole

  const clearance = await prisma.exitClearance.findUnique({
    where: { id },
    select: {
      id: true, lastWorkingDay: true, status: true,
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, status: true,
          resignation: { select: { id: true } },
          documents: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, name: true, createdAt: true },
          },
        },
      },
    },
  })
  if (!clearance) notFound()

  const emp = clearance.employee

  // No scenario column on the clearance, so it's derived: a resignation record
  // or a RESIGNED status means the person left of their own accord, and the
  // four company-initiated documents must not be offered.
  const scenario: ExitScenario =
    emp.resignation || emp.status === 'RESIGNED' ? 'RESIGNATION' : 'TERMINATION'

  const documents = exitDocumentsFor(scenario)

  // Uploads are filed under the prerequisite's own label, so that is what maps
  // a stored file back to its row.
  const attached: Record<string, AttachedDoc | undefined> = {}
  for (const d of documents) {
    const hit = emp.documents.find((doc) => doc.name === d.label)
    if (hit) {
      attached[d.key] = {
        id: hit.id,
        name: hit.name,
        createdAt: formatDate(hit.createdAt),
      }
    }
  }

  const lwd = clearance.lastWorkingDay
    ? clearance.lastWorkingDay.toISOString().slice(0, 10)
    : null

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/dashboard/lifecycle/exit/${clearance.id}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Exit Clearance
        </Link>
        <h1 className="text-lg font-semibold text-slate-900 mt-1">Exit Documents</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {emp.employeeCode} · Generate a draft, then upload the signed copy. A row only
          counts as done once a file is on record.
        </p>
      </div>

      <ExitDocumentBoard
        employeeId={emp.id}
        employeeName={emp.fullName}
        scenario={scenario}
        documents={documents}
        attached={attached}
        canEdit={canEdit}
        lastWorkingDay={lwd}
      />
    </div>
  )
}
