import { redirect } from 'next/navigation'

/**
 * The job description builder became the first step of the job post editor.
 * Old links and bookmarks land there.
 */
export default function NewJDPage() {
  redirect('/dashboard/recruiting/jobs/new')
}
