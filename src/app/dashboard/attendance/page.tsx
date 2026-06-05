/**
 * Legacy attendance page — kept for back-compat / bookmarks / notification deep
 * links. Redirects to the unified Time & Attendance module's "Today" tab.
 */

import { redirect } from 'next/navigation'

export default function LegacyAttendancePage() {
  redirect('/dashboard/time?tab=today')
}
