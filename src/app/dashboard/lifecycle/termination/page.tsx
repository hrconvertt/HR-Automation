import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ShieldAlert } from 'lucide-react'

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  INITIATED: { label: 'Initiated', tone: 'bg-slate-100 text-slate-800 border-slate-200' },
  MEETING_SCHEDULED: { label: 'Meeting Scheduled', tone: 'bg-slate-100 text-slate-800 border-slate-200' },
  MEETING_HELD: { label: 'Meeting Held', tone: 'bg-slate-100 text-slate-800 border-slate-200' },
  NOTICE_ISSUED: { label: 'Notice Issued', tone: 'bg-slate-100 text-slate-800 border-slate-200' },
  IN_EXIT_CLEARANCE: { label: 'In Exit Clearance', tone: 'bg-slate-100 text-slate-800 border-slate-200' },
  COMPLETED: { label: 'Completed', tone: 'bg-slate-100 text-slate-800 border-slate-200' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-slate-50 text-slate-500 border-slate-200 line-through' },
}

export default async function TerminationListPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? payload.role
  if (effectiveRole !== 'HR_ADMIN' && effectiveRole !== 'EXECUTIVE') {
    redirect('/dashboard')
  }

  const terminations = await prisma.termination.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          department: { select: { name: true } },
        },
      },
    },
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-6 flex items-center gap-3">
        <ShieldAlert className="w-6 h-6 text-slate-700" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">Terminations</h1>
          <p className="text-xs text-slate-500 mt-0.5">HR-initiated termination workflow. Ends in Exit Clearance.</p>
        </div>
      </header>

      {terminations.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
          <ShieldAlert className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">No termination workflows on record.</p>
          <p className="text-xs text-slate-400 mt-1">Start from a Show Cause via &quot;Proceed to Termination&quot;.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Employee</th>
                <th className="text-left px-4 py-2 font-semibold">Reason</th>
                <th className="text-left px-4 py-2 font-semibold">Last Working Day</th>
                <th className="text-left px-4 py-2 font-semibold">Status</th>
                <th className="text-left px-4 py-2 font-semibold">Initiated</th>
                <th className="text-right px-4 py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {terminations.map((t) => {
                const meta = STATUS_LABEL[t.status] ?? STATUS_LABEL.INITIATED
                return (
                  <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{t.employee.fullName}</div>
                      <div className="text-xs text-slate-500">{t.employee.employeeCode} · {t.employee.designation}{t.employee.department?.name ? ` · ${t.employee.department.name}` : ''}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 text-xs">{t.reasonCategory.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-slate-700 text-xs">{new Date(t.lastWorkingDay).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded border ${meta.tone}`}>{meta.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(t.createdAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                      {t.initiatedByName && <div className="text-[11px]">by {t.initiatedByName}</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/dashboard/lifecycle/termination/${t.id}`} className="text-slate-700 hover:text-slate-900 font-semibold text-xs underline underline-offset-2">
                        Open
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
