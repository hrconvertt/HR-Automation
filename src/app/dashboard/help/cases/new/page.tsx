/** Help Center → Create Case. */
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { HelpHero } from '@/components/help/help-hero'
import { CreateCaseForm } from './_components/create-case-form'

export default async function CreateCasePage(
  { searchParams }: { searchParams: Promise<{ type?: string; about?: string; for?: string }> },
) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  const sp = await searchParams
  const live = { status: 'ACTIVE', deletedAt: null }

  // HR opens cases for anyone, a manager for themselves or a direct report,
  // everyone else for themselves.
  let people: { id: string; fullName: string }[] = []
  if (viewer.actualRole === 'HR_ADMIN' && !viewer.isPreviewMode) {
    people = await prisma.employee.findMany({ where: live, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } })
  } else if (viewer.employeeId) {
    const [me, reports] = await Promise.all([
      prisma.employee.findUnique({ where: { id: viewer.employeeId }, select: { id: true, fullName: true } }),
      viewer.effectiveRole === 'MANAGER'
        ? prisma.employee.findMany({ where: { ...live, reportingManagerId: viewer.employeeId }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } })
        : Promise.resolve([]),
    ])
    people = [...(me ? [me] : []), ...reports]
  }

  if (people.length === 0) {
    return (
      <p className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center text-sm text-slate-500">
        Your login is not linked to an employee record, so a case cannot be opened from it.
      </p>
    )
  }
  const defaultForId = sp.for && people.some((p) => p.id === sp.for)
    ? sp.for
    : people.find((p) => p.id === viewer.employeeId)?.id ?? people[0].id

  return (
    <div className="pb-8">
      <HelpHero />
      <div className="max-w-6xl mx-auto -mt-10 relative">
        <CreateCaseForm people={people} defaultForId={defaultForId} presetType={sp.type} presetTitle={sp.about} />
      </div>
    </div>
  )
}
