/**
 * Interview scheduling is the My Schedule view of the Recruiting module
 * (/dashboard/recruiting?tab=schedule). This older standalone page was linked
 * from nowhere and listed the same interviews a second way. The route stays so
 * old links and bookmarks still land on the real schedule.
 */
import { redirect } from 'next/navigation'

export default function RecruitingSchedulingPage() {
  redirect('/dashboard/recruiting?tab=schedule')
}
