/**
 * Outer-tab shell for the unified Time & Attendance module.
 *
 * Server component — renders the appropriate Attendance / Leave / Calendar /
 * Approvals view based on the active tab and the caller's role. Tabs are
 * URL-driven (?tab=…) so they're bookmarkable and back-button works.
 */

import Link from 'next/link'
import { Clock, Calendar, Plane, Inbox } from 'lucide-react'
import { CalendarView } from './calendar-view'
import { ApprovalsInbox } from './approvals-inbox'
import MyTimeView from '@/app/dashboard/attendance/_views/my-time-view'
import TeamTimeView from '@/app/dashboard/attendance/_views/team-time-view'
import AdminTimeView from '@/app/dashboard/attendance/_views/admin-time-view'
import ExecutiveTimeView from '@/app/dashboard/attendance/_views/executive-time-view'
import MyLeaveView from '@/app/dashboard/leave/_views/my-leave-view'
import TeamLeaveView from '@/app/dashboard/leave/_views/team-leave-view'
import AdminLeaveView from '@/app/dashboard/leave/_views/admin-leave-view'
import ExecutiveLeaveView from '@/app/dashboard/leave/_views/executive-leave-view'

type TabKey = 'today' | 'calendar' | 'leave' | 'approvals'

interface Props {
  role: string
  employeeId: string | null
  employeeName: string | null
  initialTab: string
}

export function TimeShell({ role, employeeId, employeeName, initialTab }: Props) {
  const showApprovals = role === 'MANAGER' || role === 'HR_ADMIN'

  const tabs: { key: TabKey; label: string; icon: typeof Clock; show: boolean }[] = [
    { key: 'today',     label: 'Today',     icon: Clock,    show: true },
    { key: 'calendar',  label: 'Calendar',  icon: Calendar, show: true },
    { key: 'leave',     label: 'Leave',     icon: Plane,    show: true },
    { key: 'approvals', label: 'Approvals', icon: Inbox,    show: showApprovals },
  ]
  const activeTab: TabKey = (tabs.find((t) => t.key === initialTab && t.show)?.key ?? 'today') as TabKey

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
        {activeTab === 'today' && <TodayPanel role={role} employeeId={employeeId} employeeName={employeeName} />}
        {activeTab === 'calendar' && <CalendarView role={role} />}
        {activeTab === 'leave' && <LeavePanel role={role} employeeId={employeeId} employeeName={employeeName} />}
        {activeTab === 'approvals' && showApprovals && <ApprovalsInbox role={role} />}
      </div>
    </div>
  )
}

function TodayPanel({ role, employeeId, employeeName }: { role: string; employeeId: string | null; employeeName: string | null }) {
  if (role === 'HR_ADMIN') return <AdminTimeView />
  if (role === 'EXECUTIVE') return <ExecutiveTimeView />
  if (role === 'MANAGER' && employeeId)
    return <TeamTimeView managerEmployeeId={employeeId} managerName={employeeName ?? ''} />
  if (employeeId)
    return <MyTimeView employeeId={employeeId} employeeName={employeeName ?? ''} />
  return null
}

function LeavePanel({ role, employeeId, employeeName }: { role: string; employeeId: string | null; employeeName: string | null }) {
  if (role === 'HR_ADMIN') return <AdminLeaveView />
  if (role === 'EXECUTIVE') return <ExecutiveLeaveView />
  if (role === 'MANAGER' && employeeId)
    return <TeamLeaveView managerEmployeeId={employeeId} managerName={employeeName ?? ''} />
  if (employeeId)
    return <MyLeaveView employeeId={employeeId} employeeName={employeeName ?? ''} />
  return null
}

