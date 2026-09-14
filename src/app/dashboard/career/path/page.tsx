/** Career → Plan: the Career Path Builder. */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { PathBuilder } from '../_components/path-builder'

export default async function CareerPathPage() {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  const me = viewer.employeeId
    ? await prisma.employee.findUnique({ where: { id: viewer.employeeId }, select: { designation: true } })
    : null
  if (!me) redirect('/dashboard/career')

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/career" className="text-sm text-slate-600 underline underline-offset-2">← Career Hub</Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">Career Path Builder</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Start from your role, add the moves you want to make, and save the path. Roles come from Convertt&apos;s job profiles and open requisitions.
        </p>
      </div>
      <PathBuilder currentRole={me.designation} />
    </div>
  )
}
