/**
 * /dashboard/leave/[id] — single leave request detail.
 *
 * Renders:
 *   - Employee + leave-type + date range + days + status badge
 *   - Reason
 *   - Attachment download (if uploaded)
 *   - Approval/rejection comments (if any)
 *   - Edit / Withdraw buttons for the requester while PENDING / PENDING_HR
 */

import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Paperclip } from 'lucide-react'
import { LEAVE_STATUS_LABELS, LEAVE_STATUS_TONE, formatDays } from '@/lib/leave-types'
import { LeaveDetailActions } from './_actions'

interface RouteProps {
  params: Promise<{ id: string }>
}

export default async function LeaveDetailPage({ params }: RouteProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  const myEmpId = me?.employee?.id ?? null

  const req = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          employeeCode: true,
          designation: true,
          reportingManagerId: true,
        },
      },
    },
  })
  if (!req) notFound()

  const previewRole = payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const role = previewRole ?? payload.role

  // Visibility: requester, their manager, HR, exec, or stage-1 approver.
  const canSee =
    role === 'HR_ADMIN' ||
    role === 'EXECUTIVE' ||
    req.employee.id === myEmpId ||
    req.employee.reportingManagerId === myEmpId ||
    req.stageOneApproverId === myEmpId
  if (!canSee) {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6 text-sm text-slate-700">
        You don&apos;t have access to this leave request.
      </div>
    )
  }

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  const isMine = req.employee.id === myEmpId
  const pending = req.status === 'PENDING' || req.status === 'PENDING_HR'

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <Link href="/dashboard/leave" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Leave
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Leave request</h1>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Employee</p>
              <p className="text-base font-semibold text-slate-900">{req.employee.fullName}</p>
              <p className="text-xs text-slate-500">{req.employee.employeeCode} · {req.employee.designation ?? '—'}</p>
            </div>
            <Badge variant={LEAVE_STATUS_TONE[req.status] ?? 'secondary'}>
              {LEAVE_STATUS_LABELS[req.status] ?? req.status}
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Type</p>
              <p className="text-sm text-slate-900 mt-0.5">{req.leaveType}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Days</p>
              <p className="text-sm text-slate-900 mt-0.5">{formatDays(req.days)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Dates</p>
              <p className="text-sm text-slate-900 mt-0.5">
                {fmt(req.fromDate)} → {fmt(req.toDate)}
                {req.firstDayHalf && <span className="text-xs text-slate-500"> · first day half</span>}
                {req.lastDayHalf && <span className="text-xs text-slate-500"> · last day half</span>}
              </p>
            </div>
          </div>

          {req.reason && (
            <div className="pt-3 border-t border-slate-100">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Reason</p>
              <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{req.reason}</p>
            </div>
          )}

          {req.attachmentUrl && (
            <div className="pt-3 border-t border-slate-100">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Attachment</p>
              <a
                href={`/api/leave/${req.id}/attachment`}
                className="inline-flex items-center gap-1.5 mt-1 text-sm text-slate-900 hover:underline"
              >
                <Paperclip className="w-3.5 h-3.5" /> Download attachment
              </a>
            </div>
          )}

          {req.status === 'REJECTED' && req.rejectedReason && (
            <div className="pt-3 border-t border-slate-100">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Rejection reason</p>
              <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{req.rejectedReason}</p>
            </div>
          )}

          {req.status === 'APPROVED' && req.approvalComment && (
            <div className="pt-3 border-t border-slate-100">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Approver comment</p>
              <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{req.approvalComment}</p>
            </div>
          )}

          {isMine && pending && (
            <div className="pt-3 border-t border-slate-100">
              <LeaveDetailActions id={req.id} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
