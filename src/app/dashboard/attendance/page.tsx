/**
 * Legacy /dashboard/attendance entry — now merged into the unified
 * "Time & Attendance" page at /dashboard/time.
 *
 * Kept as a redirect so existing bookmarks / links continue to work.
 * The per-employee detail drill-down at /dashboard/attendance/[employeeId]
 * stays where it is.
 */

import { redirect } from 'next/navigation'

export default function AttendanceRedirect() {
  redirect('/dashboard/time?tab=grid')
}
