/**
 * The employment letter is written in Letters → Write a letter now, with every
 * other letter type. Probation pages and the document checklist still link
 * here, so this passes them on.
 */
import { redirect } from 'next/navigation'

export default async function EmploymentLetterPage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string }>
}) {
  const sp = await searchParams
  const q = new URLSearchParams({ type: 'EMPLOYMENT', ...(sp.employeeId ? { employeeId: sp.employeeId } : {}) })
  redirect(`/dashboard/letters/write?${q}`)
}
