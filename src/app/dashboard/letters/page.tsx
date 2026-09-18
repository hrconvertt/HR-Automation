/**
 * Letters → Letter requests. Every letter asked for or written, stored:
 * received requests, approved and issued letters, rejected requests. HR sees
 * everyone's, a manager their team's, an employee their own.
 *
 *   ?status=pending|approved|generated|rejected   the tab
 *   ?type=EXPERIENCE                              the letter type filter
 *   ?open=<id>                                    the letter opened on the right
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RequestLetterDialog } from '@/components/letters/request-letter-dialog'
import { LettersBoard, type LetterRow } from '@/components/letters/letters-board'

type Role = 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'EXECUTIVE'

export default async function LettersPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; status?: string; type?: string }>
}) {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) redirect('/login')

  const previewRole = user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const role = (previewRole ?? user.role) as Role
  const employeeId = user.employee?.id ?? null
  const isPreviewMode = user.role === 'HR_ADMIN' && !!previewRole && previewRole !== 'HR_ADMIN'

  let where: Record<string, unknown> = {}
  if (role === 'EMPLOYEE') {
    where = employeeId ? { employeeId } : { id: '__none__' }
  } else if (role === 'MANAGER' && employeeId) {
    where = { OR: [{ employeeId }, { employee: { reportingManagerId: employeeId } }] }
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

  const letters: LetterRow[] = lettersRaw.map((l) => ({
    id: l.id,
    letterNumber: l.letterNumber,
    letterType: l.letterType,
    purpose: l.purpose,
    destinationCountry: l.destinationCountry,
    bankName: l.bankName,
    travelFrom: l.travelFrom?.toISOString() ?? null,
    travelTo: l.travelTo?.toISOString() ?? null,
    status: l.status,
    rejectionReason: l.rejectionReason,
    requestedAt: l.requestedAt.toISOString(),
    reviewedAt: l.reviewedAt?.toISOString() ?? null,
    signedByName: l.signedByName,
    // Written in Write a letter: stored issued in the same moment it was made.
    // An employee's request always waits some time before HR approves it.
    writtenByHr: !!l.reviewedAt && Math.abs(l.reviewedAt.getTime() - l.requestedAt.getTime()) < 5000,
    employeeId: l.employeeId,
    employee: {
      id: l.employee.id,
      employeeCode: l.employee.employeeCode,
      fullName: l.employee.fullName,
      designation: l.employee.designation ?? '',
      department: l.employee.department ? { name: l.employee.department.name } : null,
    },
  }))

  const sp = await searchParams
  const canRequest = role === 'EMPLOYEE' && !isPreviewMode && !!employeeId
  const canWrite = role === 'HR_ADMIN' && !isPreviewMode

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Letter requests</h1>
          <p className="text-sm text-slate-500 mt-1">
            {role === 'EMPLOYEE' && 'Ask HR for a letter (experience, salary certificate, visa NOC and more) and download it here once it is approved.'}
            {role === 'MANAGER' && 'Letters requested by you and your team.'}
            {role === 'HR_ADMIN' && 'Every letter requested or written, kept here. Pick one to see its details and the letter itself.'}
            {role === 'EXECUTIVE' && 'Letters requested and issued across the company.'}
          </p>
        </div>
        {canWrite && (
          <Link href="/dashboard/letters/write">
            <Button><PenLine className="h-4 w-4" /> Write a letter</Button>
          </Link>
        )}
        {canRequest && <RequestLetterDialog />}
      </div>

      <LettersBoard
        letters={letters}
        role={role}
        employeeId={employeeId}
        isPreviewMode={isPreviewMode}
        initial={{ open: sp.open ?? null, status: sp.status ?? null, type: sp.type ?? null }}
      />
    </div>
  )
}
