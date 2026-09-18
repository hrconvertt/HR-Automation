import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveViewer } from '../jobs/_lib/load'
import { NoAccess } from '../jobs/_components/no-access'
import { CandidatesCrm, type CrmRow } from './candidates-crm'

/**
 * Candidates — every person who has applied or been sourced for any job, in
 * one searchable list: Workable's Talent CRM.
 *
 * With ?forJob= it becomes Resurfaced candidates: people from other jobs,
 * ranked by how much of that job's title and requirements their record
 * mentions, and not already on it, ready to be added with their CV.
 */
const STOP = new Set([
  'and', 'the', 'for', 'with', 'you', 'our', 'your', 'will', 'are', 'from', 'that', 'this', 'have', 'has', 'able',
  'work', 'working', 'team', 'years', 'year', 'experience', 'strong', 'good', 'skills', 'knowledge', 'ability',
  'senior', 'junior', 'associate', 'intern', 'lead', 'head', 'executive', 'officer', 'specialist', 'must', 'should',
  'including', 'across', 'within', 'using', 'such', 'other', 'into', 'more', 'plus', 'least', 'role', 'job', 'convertt',
])

function words(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[^a-z0-9+#.]+/).map((w) => w.replace(/\.+$/, ''))
    .filter((w) => w.length >= 3 && !STOP.has(w)))]
}

export default async function RecruitingCandidatesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sp = await searchParams
  const viewer = await resolveViewer()
  if (!viewer.signedIn) redirect('/login')
  if (!viewer.isHR && viewer.role !== 'MANAGER') {
    return <NoAccess message="Only HR and hiring managers can search candidates." />
  }

  const [jobs, departments, rows] = await Promise.all([
    prisma.jobRequisition.findMany({
      where: { status: { not: 'REJECTED' } },
      select: { id: true, title: true, status: true, departmentId: true, requirements: true, description: true, jdContent: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.candidate.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3000,
      select: {
        id: true, fullName: true, email: true, phone: true, stage: true, source: true, createdAt: true,
        requisitionId: true, currentRole: true, currentCompany: true, pastCompanies: true, education: true,
        educationLevel: true, location: true, skills: true, experience: true, yearsExperience: true,
        matchScore: true, inTalentPool: true, poolTags: true, knockoutStatus: true, notes: true,
        experienceSummary: true, evaluation: true, hrNotes: true, screening: true, cvUrl: true,
      },
    }),
  ])
  const jobById = new Map(jobs.map((j) => [j.id, j]))
  const deptName = new Map(departments.map((d) => [d.id, d.name]))

  const forJob = sp.forJob ? jobById.get(sp.forJob) ?? null : null
  // For resurfacing: the job's own words, the title's weighted three times.
  const titleWords = forJob ? words(forJob.title) : []
  const bodyWords = forJob
    ? words(`${forJob.requirements ?? ''} ${forJob.description ?? ''} ${(forJob.jdContent ?? '').slice(0, 4000)}`).filter((w) => !titleWords.includes(w)).slice(0, 80)
    : []
  const alreadyOn = forJob
    ? new Set(rows.filter((r) => r.requisitionId === forJob.id).map((r) => r.email.toLowerCase()))
    : new Set<string>()

  const crm: CrmRow[] = rows
    .filter((r) => !forJob || (r.requisitionId !== forJob.id && !alreadyOn.has(r.email.toLowerCase())))
    .map((r) => {
      const job = jobById.get(r.requisitionId)
      const hay = [r.fullName, r.currentRole, r.currentCompany, r.pastCompanies, r.education, r.location, r.skills,
        r.experienceSummary, r.evaluation, r.hrNotes, r.notes, r.screening, r.poolTags, job?.title].filter(Boolean).join(' ').toLowerCase()
      let relevance = 0
      const hits: string[] = []
      if (forJob) {
        for (const w of titleWords) if (hay.includes(w)) { relevance += 3; hits.push(w) }
        for (const w of bodyWords) if (hay.includes(w)) { relevance += 1; if (hits.length < 8) hits.push(w) }
      }
      const skills = (() => {
        try { const v = JSON.parse(r.skills ?? ''); return Array.isArray(v) ? v.map(String) : [] } catch { return (r.skills ?? '').split(',').map((s) => s.trim()).filter(Boolean) }
      })()
      return {
        id: r.id,
        fullName: r.fullName,
        email: r.email.endsWith('@no-email.com') ? null : r.email,
        phone: r.phone,
        headline: [r.currentRole, r.currentCompany].filter(Boolean).join(' at ') || null,
        pastCompanies: r.pastCompanies,
        education: r.education ?? r.educationLevel,
        location: r.location,
        skills: skills.slice(0, 8),
        years: r.yearsExperience ?? (r.experience != null ? Math.floor(r.experience) : null),
        stage: r.knockoutStatus === 'FAILED' && r.stage !== 'HIRED' ? 'KNOCKED_OUT' : r.stage,
        source: r.source,
        createdAt: r.createdAt.toISOString(),
        jobId: r.requisitionId,
        jobTitle: job?.title ?? '—',
        department: job?.departmentId ? deptName.get(job.departmentId) ?? null : null,
        matchScore: r.matchScore,
        inTalentPool: r.inTalentPool,
        hasCv: !!r.cvUrl,
        haystack: hay,
        relevance,
        hits,
      }
    })

  return (
    <CandidatesCrm
      rows={forJob ? crm.filter((r) => r.relevance > 0).sort((a, b) => b.relevance - a.relevance || (b.matchScore ?? 0) - (a.matchScore ?? 0)) : crm}
      jobs={jobs.map((j) => ({ id: j.id, title: j.title, status: j.status, department: j.departmentId ? deptName.get(j.departmentId) ?? null : null }))}
      departments={departments.map((d) => d.name)}
      forJob={forJob ? { id: forJob.id, title: forJob.title } : null}
    />
  )
}
