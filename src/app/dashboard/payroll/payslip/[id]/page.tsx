/**
 * /dashboard/payroll/payslip/[id] — redirects to the real slip.
 *
 * There were two salary-slip renderers in the codebase and they had drifted
 * apart. This was the one most of the app linked to; the one at
 * /payslip/[id]/print is the one matched to the issued PDF — Calibri, the
 * measured column widths, rules only where the original draws them.
 *
 * Kept as a redirect rather than deleted so existing links and anything
 * already sent to an employee still land somewhere. Nothing renders here, so
 * the two cannot drift again.
 */
import { redirect } from 'next/navigation'

export default async function LegacyPayslipPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/payslip/${id}/print`)
}
