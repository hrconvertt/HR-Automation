/**
 * /dashboard/leave/[id] — one leave or WFH request.
 *
 * The page used to be a single card in a 768px column on a 1900px screen, with
 * evidence as one line inside it. Evidence is the thing an approver actually
 * has to look at, so it gets a panel of its own with the files rendered rather
 * than named — a challan is read by looking at it.
 *
 * The documents get the room. The text beside them sits in a fixed 380px
 * column, because a reason does not read better at 900px wide, and four short
 * values spread across 1900px is diluting the screen rather than using it.
 */

import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'
import { LEAVE_STATUS_LABELS, LEAVE_STATUS_TONE, formatDays } from '@/lib/leave-types'
import { LeaveDetailActions } from './_actions'
import { EvidencePanel } from './_evidence-panel'

interface RouteProps {
  params: Promise<{ id: string }>
}

const VIA_LABEL: Record<string, string> = {
  EMAIL: 'by email', WHATSAPP: 'by WhatsApp', CALL: 'by call',
  IN_PERSON: 'in person', OTHER: '',
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
          id: true, fullName: true, employeeCode: true, designation: true,
          reportingManagerId: true,
        },
      },
      evidence: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, mime: true, size: true, createdAt: true },
      },
    },
  })
  if (!req) notFound()

  const previewRole = payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const role = previewRole ?? payload.role

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

  // Who signed it off. Ids on the row, names for the page.
  const approverIds = [req.managerApprovedById, req.approvedById, req.rejectedById]
    .filter((x): x is string => !!x)
  const approvers = approverIds.length
    ? await prisma.employee.findMany({
      where: { id: { in: approverIds } }, select: { id: true, fullName: true },
    })
    : []
  const nameOf = new Map(approvers.map((a) => [a.id, a.fullName]))

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
    })
  const fmtDateTime = (d: Date) =>
    d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC',
    })

  const isMine = req.employee.id === myEmpId
  const pending = req.status === 'PENDING' || req.status === 'PENDING_HR'
  const single = req.fromDate.toDateString() === req.toDate.toDateString()
  const isWfh = req.category === 'WFH'

  // How much notice that was — the only thing anyone reads a notification
  // time for.
  const noticeDays = req.notifiedAt
    ? Math.round(
      (Date.UTC(req.fromDate.getUTCFullYear(), req.fromDate.getUTCMonth(), req.fromDate.getUTCDate())
        - Date.UTC(req.notifiedAt.getUTCFullYear(), req.notifiedAt.getUTCMonth(), req.notifiedAt.getUTCDate()))
      / 86_400_000,
    )
    : null
  const noticeLabel = noticeDays == null ? null
    : noticeDays === 0 ? 'on the day'
      : noticeDays === 1 ? 'the day before'
        : noticeDays > 1 ? `${noticeDays} days before`
          : `${Math.abs(noticeDays)} day${noticeDays === -1 ? '' : 's'} after`

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href={isWfh ? '/dashboard/leave/wfh/approved' : '/dashboard/leave'}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to {isWfh ? 'WFH' : 'Leave'}
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            {isWfh ? 'Work from home' : 'Leave request'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {req.employee.fullName} · {req.employee.employeeCode}
            {req.employee.designation ? ` · ${req.employee.designation}` : ''}
          </p>
        </div>
        <Badge variant={LEAVE_STATUS_TONE[req.status] ?? 'secondary'}>
          {LEAVE_STATUS_LABELS[req.status] ?? req.status}
        </Badge>
      </div>

      {/* One strip, not four stretched boxes. Spreading four short values
          across 1900px is not using the screen, it is diluting it. */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap gap-x-10 gap-y-3">
        <Stat label="Type" value={req.leaveType} />
        <Stat label="Days" value={formatDays(req.days)} />
        <Stat
          label={single ? 'Date' : 'Dates'}
          value={single ? fmt(req.fromDate) : `${fmt(req.fromDate)} → ${fmt(req.toDate)}`}
          sub={[
            req.firstDayHalf ? 'first day half' : null,
            req.lastDayHalf ? 'last day half' : null,
          ].filter(Boolean).join(' · ') || undefined}
        />
        <Stat
          label="HR notified"
          value={req.notifiedAt ? fmtDateTime(req.notifiedAt) : 'not recorded'}
          muted={!req.notifiedAt}
          sub={req.notifiedAt
            ? [noticeLabel, req.notifiedVia ? VIA_LABEL[req.notifiedVia] ?? '' : '']
              .filter(Boolean).join(' · ')
            : undefined}
        />
      </div>

      {/* The documents get the room. They are what the page is opened for;
          the text beside them is a fixed column because a reason does not read
          better at 900px wide. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-4 items-start">
        <div className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Reason</h2>
            </div>
            <p className="px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap">
              {req.reason || <span className="text-slate-400">Not recorded.</span>}
            </p>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Decision</h2>
            </div>
            <dl className="px-4 py-3 space-y-2.5 text-sm">
              <Row term="Lead">
                {req.managerApprovedById
                  ? <>{nameOf.get(req.managerApprovedById) ?? '—'}
                    {req.managerApprovedAt && (
                      <span className="text-slate-400"> · {fmt(req.managerApprovedAt)}</span>
                    )}</>
                  : <span className="text-slate-400">not recorded</span>}
              </Row>
              <Row term="HR">
                {req.approvedById
                  ? <>{nameOf.get(req.approvedById) ?? '—'}
                    {req.approvedAt && (
                      <span className="text-slate-400"> · {fmt(req.approvedAt)}</span>
                    )}</>
                  : <span className="text-slate-400">not recorded</span>}
              </Row>
              {req.status === 'REJECTED' && (
                <Row term="Rejected">
                  <span className="text-red-700">
                    {req.rejectedReason || 'No reason given.'}
                    {req.rejectedById ? ` — ${nameOf.get(req.rejectedById) ?? ''}` : ''}
                  </span>
                </Row>
              )}
              {req.approvalComment && (
                <Row term="Comment">
                  <span className="text-slate-600">{req.approvalComment}</span>
                </Row>
              )}
            </dl>
          </section>

          {isMine && pending && (
            <section className="bg-white border border-slate-200 rounded-xl px-4 py-3">
              <LeaveDetailActions id={req.id} />
            </section>
          )}
        </div>

        <EvidencePanel
          requestId={req.id}
          initial={req.evidence.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }))}
          canAdd={role === 'HR_ADMIN' || isMine}
          canDelete={role === 'HR_ADMIN'}
        />
      </div>
    </div>
  )
}

function Stat({ label, value, sub, muted }: {
  label: string; value: string; sub?: string; muted?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${muted ? 'text-slate-400 font-normal' : 'text-slate-900'}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[70px_1fr] gap-3">
      <dt className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold pt-0.5">
        {term}
      </dt>
      <dd className="text-slate-900">{children}</dd>
    </div>
  )
}
