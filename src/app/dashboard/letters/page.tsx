import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { FileText } from 'lucide-react'
import { RequestLetterDialog } from '@/components/letters/request-letter-dialog'
import { LettersBoard, type LetterRow } from '@/components/letters/letters-board'

type Role = 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'EXECUTIVE'

export default async function LettersPage() {
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
  const role = (previewRole ?? user.role) as Role
  const employeeId = user.employee?.id ?? null
  const isPreviewMode = user.role === 'HR_ADMIN' && !!previewRole && previewRole !== 'HR_ADMIN'

  // Scope WHERE by role
  let where: Record<string, unknown> = {}
  if (role === 'EMPLOYEE') {
    if (!employeeId) where = { id: '__none__' }
    else where = { employeeId }
  } else if (role === 'MANAGER' && employeeId) {
    where = {
      OR: [
        { employeeId },
        { employee: { reportingManagerId: employeeId } },
      ],
    }
  }

  const lettersRaw = await prisma.letterRequest.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true, employeeCode: true, fullName: true, designation: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: [{ requestedAt: 'desc' }],
    take: 500,
  })

  // Serialize dates for the client component
  const letters: LetterRow[] = lettersRaw.map((l) => ({
    id: l.id,
    letterNumber: l.letterNumber,
    letterType: l.letterType,
    purpose: l.purpose,
    destinationCountry: l.destinationCountry,
    bankName: l.bankName,
    travelFrom: l.travelFrom ? l.travelFrom.toISOString() : null,
    travelTo: l.travelTo ? l.travelTo.toISOString() : null,
    status: l.status,
    rejectionReason: l.rejectionReason,
    requestedAt: l.requestedAt.toISOString(),
    employeeId: l.employeeId,
    employee: {
      id: l.employee.id,
      employeeCode: l.employee.employeeCode,
      fullName: l.employee.fullName,
      designation: l.employee.designation,
      department: l.employee.department ? { name: l.employee.department.name } : null,
    },
  }))

  const canRequest = role === 'EMPLOYEE' && !isPreviewMode && !!employeeId

  return (
    <div className="space-y-5">
      {/* Header â€” charcoal hero */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Letters</h1>
              <p className="text-sm text-white/85 mt-1">
                {role === 'EMPLOYEE' && 'Request formal letters â€” experience, salary certificate, visa NOC, and more.'}
                {role === 'MANAGER'  && 'Track letter requests across your team.'}
                {role === 'HR_ADMIN' && 'Review pending letter requests and issue auto-numbered formal letters.'}
                {role === 'EXECUTIVE' && 'Letter issuance activity across the company.'}
              </p>
            </div>
          </div>
          {canRequest && <RequestLetterDialog />}
        </div>
      </div>

      {/* Employee: request-a-letter polished card pinned at top */}
      {role === 'EMPLOYEE' && canRequest && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Need a letter?</h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Pick from 8 letter types â€” Experience, Salary Certificate, NOC for Visa, Bonafide,
              Confirmation, Relieving, Service Certificate, Warning. HR will review and issue.
            </p>
          </div>
          <RequestLetterDialog />
        </div>
      )}

      <LettersBoard
        letters={letters}
        role={role}
        employeeId={employeeId}
        isPreviewMode={isPreviewMode}
      />
    </div>
  )
}
