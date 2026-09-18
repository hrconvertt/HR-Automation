/**
 * Letters → Write a letter. Every letter type in the one editor: pick the
 * letter and the employee, change any line, watch the letterhead PDF follow,
 * then save it (it is kept under Letter requests) or download it.
 *
 *   ?type=&employeeId=   start a new letter (the probation page links here)
 *   ?request=<id>        approve a received request with the wording shown
 *   ?letter=<id>         change the wording of a letter already approved or issued
 *
 * HR only.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { storedLetterText, WRITABLE_LETTERS } from '@/lib/letter-text'
import { LetterWriter, type WriterStart } from './letter-writer'

export default async function WriteLetterPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; employeeId?: string; request?: string; letter?: string }>
}) {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = (payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined) ?? payload.role
  if (role !== 'HR_ADMIN') {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">Only HR writes letters. You can request one from Letter requests.</p>
      </div>
    )
  }

  const sp = await searchParams
  const staff = await prisma.employee.findMany({
    where: { deletedAt: null },
    select: { id: true, fullName: true, employeeCode: true, designation: true, status: true },
    orderBy: { fullName: 'asc' },
  })

  let start: WriterStart = {
    mode: 'new',
    type: WRITABLE_LETTERS.some((l) => l.type === sp.type) ? sp.type! : 'EMPLOYMENT',
    employeeId: sp.employeeId && staff.some((s) => s.id === sp.employeeId) ? sp.employeeId : '',
  }

  const id = sp.request ?? sp.letter
  if (id) {
    const l = await prisma.letterRequest.findUnique({ where: { id } })
    if (l && sp.request && l.status === 'PENDING') {
      start = {
        mode: 'request', id: l.id, type: l.letterType, employeeId: l.employeeId,
        details: {
          purpose: l.purpose ?? '', bankName: l.bankName ?? '', destinationCountry: l.destinationCountry ?? '',
          travelFrom: l.travelFrom?.toISOString().slice(0, 10) ?? '', travelTo: l.travelTo?.toISOString().slice(0, 10) ?? '',
        },
      }
    } else if (l && sp.letter && (l.status === 'APPROVED' || l.status === 'GENERATED')) {
      start = {
        mode: 'letter', id: l.id, type: l.letterType, employeeId: l.employeeId,
        letterNumber: l.letterNumber, text: storedLetterText(l),
      }
    }
  }

  return (
    <LetterWriter
      staff={staff.map((s) => ({
        id: s.id, fullName: s.fullName, employeeCode: s.employeeCode, designation: s.designation,
        left: ['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'].includes(s.status ?? ''),
      }))}
      start={start}
    />
  )
}
