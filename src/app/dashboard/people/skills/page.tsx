/**
 * People → Skills. Who can cover what.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SkillsClient } from './_components/skills-client'

export default async function SkillsPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role

  const people = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, designation: true },
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Skills</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Who can cover what, and how deep it goes — so &ldquo;who picks this up while they are
          away&rdquo; has an answer that is not a guess.
        </p>
      </div>
      <SkillsClient
        people={people}
        canEdit={role === 'HR_ADMIN' || role === 'EXECUTIVE'}
      />
    </div>
  )
}
