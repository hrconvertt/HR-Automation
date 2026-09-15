import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { NEW_JOB, resolveViewer } from '../_lib/load'
import { JobPostEditor } from '../_components/job-post-editor'
import { NoAccess } from '../_components/no-access'

/**
 * New Job Post — the first step of the editor, before there is a job to hold
 * the others. Saving it creates the draft; the remaining steps open from there.
 */
export default async function NewJobPostPage() {
  const viewer = await resolveViewer()
  if (!viewer.signedIn) redirect('/login')
  if (!viewer.isHR && viewer.role !== 'MANAGER') {
    return <NoAccess message="Only HR and hiring managers can write job posts." />
  }

  const departments = await prisma.department.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return (
    <JobPostEditor
      job={NEW_JOB}
      step="job"
      isHR={viewer.isHR}
      canEdit
      departments={departments}
      details={null}
    />
  )
}
