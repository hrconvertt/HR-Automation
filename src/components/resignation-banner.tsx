import { formatDate } from '@/lib/utils'

interface Props {
  submittedAt: string
  intendedLastDay: string
  managerAckedAt: string | null
  status: string
  clearanceSections: { done: number; total: number } | null
}

export function ResignationBanner({ submittedAt, intendedLastDay, managerAckedAt, status, clearanceSections }: Props) {
  const last = new Date(intendedLastDay)
  const daysLeft = Math.max(0, Math.ceil((last.getTime() - Date.now()) / 86_400_000))
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-900">Resignation submitted on {formatDate(submittedAt)}</p>
          <p className="text-xs text-slate-900 mt-1">
            Last working day: <strong>{formatDate(intendedLastDay)}</strong> — {daysLeft} day{daysLeft === 1 ? '' : 's'} remaining
          </p>
        </div>
        <div className="text-xs space-y-1 text-slate-900">
          <p>{managerAckedAt
            ? <>Manager acknowledged on <strong>{formatDate(managerAckedAt)}</strong></>
            : <>Awaiting manager acknowledgment</>}</p>
          {clearanceSections ? (
            <p>Exit clearance: <strong>{clearanceSections.done} of {clearanceSections.total}</strong> sections complete</p>
          ) : managerAckedAt ? (
            <p>Exit clearance not yet started</p>
          ) : null}
          <p className="text-[11px] uppercase tracking-wide">{status.replace(/_/g, ' ')}</p>
        </div>
      </div>
    </div>
  )
}
