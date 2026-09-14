/**
 * Help Desk became the Help Center's cases. The route stays so bookmarks and
 * old notification links still land somewhere useful.
 */
import { redirect } from 'next/navigation'

export default function HelpDeskPage() {
  redirect('/dashboard/help/cases')
}
