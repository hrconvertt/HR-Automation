/**
 * Outer-tab shell for the unified Time & Attendance module.
 *
 * Server component — renders the appropriate view based on the active tab
 * and the caller's role. Tabs are URL-driven (?tab=…) so they're
 * bookmarkable and back-button works.
 *
 * Tab visibility matrix:
 *   EMPLOYEE          : My Time | My Leave
 *   LEAD / MANAGER    : My Time | My Leave | Attendance Grid (team) | Approvals
 *   HR_ADMIN          : My Time | My Leave | Attendance Grid (all + edit) | Approvals
 *   EXECUTIVE         : My Time | My Leave | Attendance Grid (read-only, no export)
 *
 * Role gating is enforced both here (tab visibility) and server-side in the
 * underlying API routes — a user who deep-links to ?tab=approvals without
 * permission falls back to My Time.
 */

import Link from 'next/link'
import { Clock, Plane, Inbox, Users } from 'lucide-react'
import MyTimeView from '@/app/dashboard/attendance/_views/my-time-view'
import MyLeaveView from '@/app/dashboard/leave/_views/my-leave-view'
import AdminTimeView from '@/app/dashboard/attendance/_views/admin-time-view'
import TeamTimeView from '@/app/dashboard/attendance/_views/team-time-view'
import ExecutiveTimeView from '@/app/dashboard/attendance/_views/executive-time-view'
import { ApprovalsInbox } from './approvals-inbox'

type TabKey = 'my-time' | 'my-leave' | 'team-time' | 'approvals'

interface Props {
  role: string
  employeeId: string | null
  employeeName: string | null
  initialTab: string
  departments: string[]
}

function canSeeApprovals(role: string): boolean {
  return role === 'HR_ADMIN' || role === 'MANAGER' || role === 'LEAD'
}

function canSeeTeamTime(role: string): boolean {
  return role === 'HR_ADMIN' || role === 'MANAGER' || role === 'LEAD' || role === 'EXECUTIVE'
}

// Legacy aliases for back-compat with old URLs.
function normalizeTab(tab: string): string {
  if (tab === 'today') return 'my-time'
  if (tab === 'leave') return 'my-leave'
  if (tab === 'calendar') return 'my-time'
  if (tab === 'grid') return 'my-time'  // legacy redirect — grid lives in /dashboard/attendance now
  return tab
}

export function TimeShell({ role, employeeId, employeeName, initialTab, departments }: Props) {
  const teamLabel =
    role === 'HR_ADMIN' || role === 'EXECUTIVE' ? 'Everyone' : 'Team Time'
  const tabs: { key: TabKey; label: string; icon: typeof Clock; show: boolean }[] = [
    { key: 'my-time',   label: 'My Time',   icon: Clock, show: true },
    { key: 'my-leave',  label: 'My Leave',  icon: Plane, show: true },
    { key: 'team-time', label: teamLabel,   icon: Users, show: canSeeTeamTime(role) },
    { key: 'approvals', label: 'Approvals', icon: Inbox, show: canSeeApprovals(role) },
  ]

  const normalized = normalizeTab(initialTab)
  const activeTab: TabKey =
    (tabs.find((t) => t.key === normalized && t.show)?.key ?? 'my-time') as TabKey

  return (
    <div className="space-y-6">
      {/* Tab bar — URL-driven, server-rendered */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit flex-wrap">
        {tabs.filter((t) => t.show).map((t) => {
          const Icon = t.icon
          const isActive = t.key === activeTab
          return (
            <Link
              key={t.key}
              href={`/dashboard/time?tab=${t.key}`}
              className={
                'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ' +
                (isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800')
              }
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </Link>
          )
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'my-time' && employeeId && (
          <MyTimeView employeeId={employeeId} employeeName={employeeName ?? ''} />
        )}
        {activeTab === 'my-time' && !employeeId && (
          <div className="rounded-2xl bg-gray-50 border border-gray-200 p-6 text-sm text-gray-600">
            No personal time record for this account.
          </div>
        )}
        {activeTab === 'my-leave' && employeeId && (
          <MyLeaveView employeeId={employeeId} employeeName={employeeName ?? ''} />
        )}
        {activeTab === 'my-leave' && !employeeId && (
          <div className="rounded-2xl bg-gray-50 border border-gray-200 p-6 text-sm text-gray-600">
            No personal leave record for this account.
          </div>
        )}
        {activeTab === 'team-time' && canSeeTeamTime(role) && (
          <>
            {role === 'HR_ADMIN' && <AdminTimeView />}
            {(role === 'MANAGER' || role === 'LEAD') && employeeId && (
              <TeamTimeView managerEmployeeId={employeeId} managerName={employeeName ?? ''} />
            )}
            {role === 'EXECUTIVE' && <ExecutiveTimeView />}
          </>
        )}
        {activeTab === 'approvals' && canSeeApprovals(role) && (
          <ApprovalsInbox role={role} />
        )}
      </div>
    </div>
  )
}
