import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { FileText } from 'lucide-react'
import ExitClearanceDetailClient from './_client'
import { formatDate } from '@/lib/utils'
import { exitDocumentsFor, type ExitScenario } from '@/lib/exit-documents'
import { ExitDocumentBoard, type AttachedDoc } from './documents/_components/exit-document-board'

interface PageProps { params: Promise<{ id: string }> }

export default async function ExitClearanceDetailPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) redirect('/login')

  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? payload.role

  const clearance = await prisma.exitClearance.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          status: true, joiningDate: true, exitDate: true,
          department: { select: { name: true } },
          reportingManager: { select: { id: true, fullName: true } },
          assets: { where: { returnedDate: null }, include: { asset: { select: { name: true, type: true, serialNo: true } } } },
          // For the documents section below: the scenario is derived from
          // whether they resigned, and a row only counts as done once a file
          // is filed under its label.
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

  // Mirror of the API access rule: HR sees everything; the departing
  // employee can view (acknowledgment + handover steps). Everyone else out.
  const isHR = effectiveRole === 'HR_ADMIN'
  const isSelf = me.employee?.id === clearance.employeeId
  if (!isHR && !isSelf) redirect('/dashboard/lifecycle/exit')

  // Only actual (non-previewing) HR drives clearance actions.
  const canAct = effectiveRole === 'HR_ADMIN' && payload.role === 'HR_ADMIN'

  // No scenario column on the clearance, so it is derived: a resignation record
  // or a RESIGNED status means they left of their own accord, and the four
  // company-initiated documents must not be offered.
  const scenario: ExitScenario =
    clearance.employee.resignation || clearance.employee.status === 'RESIGNED'
      ? 'RESIGNATION'
      : 'TERMINATION'
  const exitDocs = exitDocumentsFor(scenario)

  // Uploads are filed under the prerequisite's own label, so that is what maps
  // a stored file back to its row.
  const attached: Record<string, AttachedDoc | undefined> = {}
  for (const d of exitDocs) {
    const hit = clearance.employee.documents.find((doc) => doc.name === d.label)
    if (hit) {
      attached[d.key] = { id: hit.id, name: hit.name, createdAt: formatDate(hit.createdAt) }
    }
  }
  const lastWorkingDay = clearance.lastWorkingDay
    ? clearance.lastWorkingDay.toISOString().slice(0, 10)
    : null

  return (
    <div className="space-y-3">
      {/* Section 7. The documents used to sit behind a button on their own
          screen, so the checklist could say "1 / 6 sections cleared" while
          nothing on it knew whether a single letter had been issued. One
          question — is this person finished? — needs one page to answer it.

          Generate is unchanged and still on every row. */}
      {isHR && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            7 &middot; Exit documents
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Generate a draft, then upload the signed copy. A row only counts as done
            once a file is on record.
          </p>
          <ExitDocumentBoard
            employeeId={clearance.employee.id}
            employeeName={clearance.employee.fullName}
            scenario={scenario}
            documents={exitDocs}
            attached={attached}
            canEdit={canAct}
            lastWorkingDay={lastWorkingDay}
          />
        </div>
      )}

    <ExitClearanceDetailClient
      initial={JSON.parse(JSON.stringify(clearance))}
      canAct={canAct}
      isSelf={isSelf}
    />
    </div>
  )
}
