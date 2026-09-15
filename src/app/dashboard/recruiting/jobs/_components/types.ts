/**
 * What the job post editor's server pages hand its client steps. No 'use
 * client' and no Prisma: both sides import it.
 */
import {
  listFromText,
  type ApplicationFieldKey, type ApplicationFormConfig, type InterviewRound, type JdSections,
} from '@/lib/job-post'

export type StepKey = 'job' | 'form' | 'find' | 'team' | 'workflow'

export const STEPS: { key: StepKey; title: string; blurb: string }[] = [
  { key: 'job', title: 'The Job', blurb: 'Tell applicants why it’s great to work at Convertt.' },
  { key: 'form', title: 'Application Form', blurb: 'Design the application form for this role.' },
  { key: 'find', title: 'Find Candidates', blurb: 'Publish it, share it and ask for referrals.' },
  { key: 'team', title: 'Team Members', blurb: 'Add the people hiring for this job.' },
  { key: 'workflow', title: 'Workflow', blurb: 'Plan the interview rounds.' },
]

export const STEP_KEYS: string[] = STEPS.map((s) => s.key)

/** The first step's boxes as the form holds them — numbers stay strings while typed. */
export interface EditorJob {
  id: string | null
  status: string
  jdStatus: string | null
  title: string
  departmentId: string
  positionLevel: string
  type: string
  vacancies: number
  location: string
  isRemote: boolean
  internalCode: string
  minExperienceYears: string
  educationLevel: string
  salaryMin: string
  salaryMax: string
  salaryCurrency: string
  closingDate: string
  /** One line per item, as typed into the textareas. */
  sections: Record<keyof JdSections, string>
}

export interface EditorMember {
  id: string
  employeeId: string
  name: string
  designation: string
  role: string
}

export interface EditorPerson {
  id: string
  name: string
  designation: string
}

/** Everything the steps after The Job need. Null until the job has been saved once. */
export interface EditorDetails {
  form: ApplicationFormConfig
  /** Fields a hard knockout filter reads, which the form may not switch off. */
  knockoutFields: ApplicationFieldKey[]
  members: EditorMember[]
  requester: EditorPerson | null
  employees: EditorPerson[]
  rounds: InterviewRound[]
  /** Why the job cannot be published yet, when it cannot. */
  gateReason: string | null
  /** The Manpower Requisition Form the gate asks for, once one is started. */
  manpowerForm: { id: string; status: string } | null
  poolMatches: number
  referralsAskedAt: string | null
}

export interface JobTemplate {
  id: string
  title: string
  department: string | null
  jdContent: string
}

export function sectionsFromJob(job: EditorJob): JdSections {
  return {
    summary: job.sections.summary.trim(),
    responsibilities: listFromText(job.sections.responsibilities),
    requirements: listFromText(job.sections.requirements),
    niceToHave: listFromText(job.sections.niceToHave),
    benefits: listFromText(job.sections.benefits),
  }
}

/** The body the requisition APIs read with readJobFields. */
export function jobPayload(job: EditorJob) {
  return {
    title: job.title,
    departmentId: job.departmentId || null,
    positionLevel: job.positionLevel || null,
    type: job.type,
    vacancies: job.vacancies,
    location: job.location,
    isRemote: job.isRemote,
    internalCode: job.internalCode,
    minExperienceYears: job.minExperienceYears,
    educationLevel: job.educationLevel || null,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    closingDate: job.closingDate || null,
    sections: sectionsFromJob(job),
  }
}
