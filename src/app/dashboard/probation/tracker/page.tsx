import { redirect } from 'next/navigation'

/** The tracker is the Probation page now. Old links still land in the right place. */
export default function ProbationTrackerRedirect() {
  redirect('/dashboard/probation')
}
