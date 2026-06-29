/**
 * Time Tracking — role-routed single-view page.
 *
 * Inner tabs (My Time / My Leave / Everyone / Approvals) have been removed.
 * Leave + approvals live in the Leave module now.
 *
 * Role landing:
 *   EMPLOYEE                                  → MyTimeView
 *   MANAGER / LEAD                            → TeamTimeView (Everyone)
 *   HR_ADMIN                                  → AdminTimeView (Everyone)
 *   EXECUTIVE                                 → ExecutiveTimeView (Everyone)
 */

import MyTimeView from '@/app/dashboard/attendance/_views/my-time-view'
import AdminTimeView from '@/app/dashboard/attendance/_views/admin-time-view'
import TeamTimeView from '@/app/dashboard/attendance/_views/team-time-view'
import ExecutiveTimeView from '@/app/dashboard/attendance/_views/executive-time-view'
import { TimesheetPanel } from './timesheet-panel'

interface Props {
  role: string
  employeeId: string | null
  employeeName: string | null
  initialTab: string
  departments: string[]
  timeTrackingMode?: 'BASIC' | 'TIMESHEET' | 'JOBS'
  timesheetCategories?: string[]
}

export function TimeShell({
  role,
  employeeId,
  employeeName,
  timeTrackingMode = 'BASIC',
  timesheetCategories = [],
}: Props) {
  // HR / Executive / Manager / Lead all land on the team-wide view directly.
  if (role === 'HR_ADMIN') return <AdminTimeView />
  if (role === 'EXECUTIVE') return <ExecutiveTimeView />
  if ((role === 'MANAGER' || role === 'LEAD') && employeeId) {
    return <TeamTimeView managerEmployeeId={employeeId} managerName={employeeName ?? ''} />
  }

  // Employee — personal time + optional timesheet panel.
  if (!employeeId) {
    return (
      <div className="rounded-2xl bg-gray-50 border border-gray-200 p-6 text-sm text-gray-600">
        No personal time record for this account.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <MyTimeView employeeId={employeeId} employeeName={employeeName ?? ''} />
      {(timeTrackingMode === 'TIMESHEET' || timeTrackingMode === 'JOBS') && (
        <TimesheetPanel mode={timeTrackingMode} categories={timesheetCategories} />
      )}
    </div>
  )
}
