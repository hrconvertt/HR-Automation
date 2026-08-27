/**
 * Printable Job Description — the page you save as PDF.
 *
 * JDs were only ever readable inside a dialog, so the ones Convertt actually
 * circulates lived as loose .docx/.pdf files in a Drive folder. This renders
 * the stored JD as a clean A4 document that Print → Save as PDF turns into the
 * file, so the JD in the system and the JD you send out are the same text.
 */
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { JdPrintView } from './jd-print-view'

export default async function JdPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  const req = await prisma.jobRequisition.findUnique({
    where: { id },
    select: {
      title: true,
      jdContent: true,
      description: true,
      requirements: true,
      departmentId: true,
    },
  })
  if (!req) notFound()

  // JobRequisition stores departmentId without a relation, so resolve the name.
  const dept = req.departmentId
    ? await prisma.department.findUnique({
        where: { id: req.departmentId },
        select: { name: true },
      })
    : null

  // Prefer the generated/approved JD; fall back to the raw fields so the page
  // is never blank for a requisition created before JDs were drafted.
  const body =
    req.jdContent?.trim() ||
    [req.description, req.requirements].filter(Boolean).join('\n\n') ||
    ''

  return <JdPrintView title={req.title} department={dept?.name ?? null} body={body} />
}
