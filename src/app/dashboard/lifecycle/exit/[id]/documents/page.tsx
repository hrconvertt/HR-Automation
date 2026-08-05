/**
 * /dashboard/lifecycle/exit/[id]/documents — redirects to the clearance page.
 *
 * The exit documents are section 7 of the clearance now. They were a separate
 * screen, which is how the checklist could report "1 / 6 sections cleared"
 * while knowing nothing about whether a single letter had been issued.
 *
 * Kept as a redirect so existing links still land somewhere.
 */
import { redirect } from 'next/navigation'

export default async function ExitDocumentsPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/dashboard/lifecycle/exit/${id}`)
}
