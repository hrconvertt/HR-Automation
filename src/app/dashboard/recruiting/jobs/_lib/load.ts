import { cookies } from 'next/headers'
import type { JobRequisition } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { parseSections, splitJdIntoSections } from '@/lib/job-post'
import type { EditorJob } from '../_components/types'

export interface Viewer {
  signedIn: boolean
  role: string
  isHR: boolean
  employeeId: string | null
}

/** Who is looking — preview mode acts as the previewed role, as on every page. */
export async function resolveViewer(): Promise<Viewer> {
  const c = await cookies()
  const payload = await verifyToken(c.get('hr_token')?.value)
  if (!payload) return { signedIn: false, role: 'EMPLOYEE', isHR: false, employeeId: null }
  const u = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  const preview = u?.role === 'HR_ADMIN' ? c.get('hr_preview_role')?.value : undefined
  const role = preview ?? u?.role ?? 'EMPLOYEE'
  return { signedIn: true, role, isHR: role === 'HR_ADMIN', employeeId: u?.employee?.id ?? null }
}

export const NEW_JOB: EditorJob = {
  id: null,
  status: 'DRAFT',
  jdStatus: null,
  title: '',
  departmentId: '',
  positionLevel: 'MID_LEVEL',
  type: 'FULL_TIME',
  vacancies: 1,
  location: 'Lahore',
  isRemote: false,
  internalCode: '',
  minExperienceYears: '',
  educationLevel: 'BACHELORS',
  salaryMin: '',
  salaryMax: '',
  salaryCurrency: 'PKR',
  closingDate: '',
  sections: { summary: '', responsibilities: '', requirements: '', niceToHave: '', benefits: '' },
}

// Lines the job description writes itself from the experience and education
// boxes. A job written before the editor carries them in its markdown, and
// importing them as requirements would print them twice on the next save.
const GENERATED_REQUIREMENT = /^(\d+(\.\d+)?\+ (years|months) of relevant experience|.+ degree or equivalent|\d+(\.\d+)?\+ years experience)$/i

export function toEditorJob(r: JobRequisition): EditorJob {
  const s = parseSections(r.jdSections) ?? (() => {
    const split = splitJdIntoSections(r.jdContent)
    return { ...split, requirements: split.requirements.filter((l) => !GENERATED_REQUIREMENT.test(l)) }
  })()
  return {
    id: r.id,
    status: r.status,
    jdStatus: r.jdStatus,
    title: r.title,
    departmentId: r.departmentId ?? '',
    positionLevel: r.positionLevel ?? 'MID_LEVEL',
    type: r.type,
    vacancies: r.vacancies,
    location: r.location ?? '',
    isRemote: r.isRemote,
    internalCode: r.internalCode ?? '',
    minExperienceYears: r.minExperienceYears != null ? String(r.minExperienceYears) : '',
    educationLevel: r.educationLevel ?? '',
    salaryMin: r.salaryMin != null ? String(r.salaryMin) : '',
    salaryMax: r.salaryMax != null ? String(r.salaryMax) : '',
    salaryCurrency: r.salaryCurrency ?? 'PKR',
    closingDate: r.closingDate ? r.closingDate.toISOString().slice(0, 10) : '',
    sections: {
      summary: s.summary,
      responsibilities: s.responsibilities.join('\n'),
      requirements: s.requirements.join('\n'),
      niceToHave: s.niceToHave.join('\n'),
      benefits: s.benefits.join('\n'),
    },
  }
}
