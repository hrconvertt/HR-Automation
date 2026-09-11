/**
 * Recruiting Analytics is part of the Recruiting dashboard now — its KPIs,
 * pipeline health, advertising and source charts sit beside the pipeline ring
 * and the queues (see ../_components/dashboard-view). This route stays so old
 * links and bookmarks still land somewhere, and that somewhere is the merged page.
 */
import { redirect } from 'next/navigation'

export default function RecruitingAnalyticsPage() {
  redirect('/dashboard/recruiting?tab=dashboard')
}
