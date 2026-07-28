import { redirect } from 'next/navigation'

/**
 * `/dashboard/probation` is preserved as a sidebar shortcut, but the
 * actual UI lives inside the unified Lifecycle module. Redirect with
 * the probation tab pre-selected so deep links + bookmarks still work.
 */
export default function ProbationRedirect() {
  redirect('/dashboard/lifecycle?tab=probation')
}
