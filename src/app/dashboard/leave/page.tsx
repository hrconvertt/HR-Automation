/**
 * Legacy leave page — kept for back-compat / bookmarks / notification deep
 * links. Redirects to the unified Time & Attendance module's "Leave" tab.
 */

import { redirect } from 'next/navigation'

export default function LegacyLeavePage() {
  redirect('/dashboard/time?tab=leave')
}
