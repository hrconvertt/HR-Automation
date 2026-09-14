/**
 * The candidate board is the Pipeline view of the Recruiting module
 * (/dashboard/recruiting?tab=pipeline). This older standalone board was linked
 * from nowhere and showed the same candidates a second way, without the
 * knockout gate. The route stays so old links and bookmarks still land on the
 * real board, the same way /dashboard/recruiting/analytics does.
 */
import { redirect } from 'next/navigation'

export default function RecruitingPipelinePage() {
  redirect('/dashboard/recruiting?tab=pipeline')
}
