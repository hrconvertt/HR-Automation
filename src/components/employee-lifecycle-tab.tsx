import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import RoleHistoryCard, { type RoleEntry, type ManagerOption } from '@/components/role-history-card'

interface CompRow { id: string; effectiveDate: string; type: string; oldSalary: number; newSalary: number; incrementPct: number | null; reason: string | null }
interface ReviewRow { id: string; reviewPeriod: string; reviewType: string; overallRating: number | null; finalCategory: string | null }

interface Props {
  employeeId: string
  joiningDate: string
  confirmationDate: string | null
  exitDate: string | null
  designation: string
  managerName: string | null
  roleEntries: RoleEntry[]
  managers: ManagerOption[]
  canEditRoles: boolean
  compensationHistory: CompRow[] | null
  reviews: ReviewRow[] | null
}

function tenureDescription(joiningDate: string, exitDate: string | null) {
  const start = new Date(joiningDate).getTime()
  const end = exitDate ? new Date(exitDate).getTime() : Date.now()
  const days = Math.max(0, Math.floor((end - start) / 86_400_000))
  const years = Math.floor(days / 365)
  const remDays = days - years * 365
  const months = Math.floor(remDays / 30)
  if (years === 0 && months === 0) return `${days} day${days === 1 ? '' : 's'}`
  if (years === 0) return `${months} month${months === 1 ? '' : 's'}`
  return `${years} year${years === 1 ? '' : 's'}, ${months} month${months === 1 ? '' : 's'}`
}

function nextMilestone(joiningDate: string): { years: number; daysAway: number } | null {
  const join = new Date(joiningDate)
  const today = new Date()
  const elapsedMs = today.getTime() - join.getTime()
  const yearsElapsed = elapsedMs / (365 * 86_400_000)
  const milestones = [1, 3, 5, 7, 10, 15, 20, 25]
  for (const m of milestones) {
    if (m > yearsElapsed) {
      const target = new Date(join); target.setFullYear(target.getFullYear() + m)
      const daysAway = Math.ceil((target.getTime() - today.getTime()) / 86_400_000)
      return { years: m, daysAway }
    }
  }
  return null
}

export default function EmployeeLifecycleTab({
  employeeId, joiningDate, confirmationDate, exitDate, designation, managerName,
  roleEntries, managers, canEditRoles, compensationHistory: _compensationHistory, reviews,
}: Props) {
  // compensationHistory is intentionally not rendered — single source of truth
  // lives on the Compensation tab (F4). Prop retained for caller back-compat.
  void _compensationHistory
  const tenure = tenureDescription(joiningDate, exitDate)
  const milestone = nextMilestone(joiningDate)

  return (
    <div className="space-y-4">
      {/* Tenure */}
      <Card>
        <CardHeader><CardTitle>Tenure Progress</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-gray-500 text-xs">At Convertt</dt>
              <dd className="text-gray-900 font-medium mt-1">{tenure}</dd>
              <dd className="text-xs text-gray-500 mt-0.5">Since {formatDate(joiningDate)}</dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs">Confirmation</dt>
              <dd className="text-gray-900 font-medium mt-1">
                {confirmationDate ? formatDate(confirmationDate) : 'On probation'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs">Next milestone</dt>
              <dd className="text-gray-900 font-medium mt-1">
                {milestone
                  ? `${milestone.daysAway} day${milestone.daysAway === 1 ? '' : 's'} to ${milestone.years}-year anniversary`
                  : '—'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Role History — editable card (F8) */}
      <RoleHistoryCard
        employeeId={employeeId}
        designation={designation}
        managerName={managerName}
        joiningDate={joiningDate}
        exitDate={exitDate}
        entries={roleEntries}
        managers={managers}
        canEdit={canEditRoles}
      />

      {/* Compensation Timeline — moved to dedicated Compensation tab.
          Keeping the prop in the interface for backward compatibility but
          intentionally not rendering it here (single source of truth).
       */}

      {/* Reviews — hidden entirely when there are no finalized reviews yet. */}
      {reviews && reviews.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Review History</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {reviews.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 border-l-2 border-slate-200 pl-3">
                  <div>
                    <p className="font-medium text-gray-900">{r.reviewPeriod}</p>
                    <p className="text-xs text-gray-500">{r.reviewType} · {r.finalCategory ?? '—'}</p>
                  </div>
                  <span className="text-xs text-gray-400">{r.overallRating ? `${r.overallRating}/5` : '—'}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
