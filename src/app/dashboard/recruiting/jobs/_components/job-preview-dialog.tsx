'use client'

/**
 * Preview job — the careers page as an applicant will see it, built from
 * what is in the editor now, including The Job's unsaved boxes.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ApplyForm } from '@/components/careers/apply-form'
import { renderMarkdown } from '@/lib/markdown'
import { composeJdContent, type ApplicationFormConfig } from '@/lib/job-post'
import { sectionsFromJob, type EditorJob } from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: EditorJob
  departmentName: string | null
  form: ApplicationFormConfig
}

const num = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s))

export function JobPreviewDialog({ open, onOpenChange, job, departmentName, form }: Props) {
  const md = composeJdContent({
    title: job.title,
    departmentName,
    positionLevel: job.positionLevel,
    type: job.type,
    vacancies: job.vacancies,
    location: job.location,
    isRemote: job.isRemote,
    minExperienceYears: num(job.minExperienceYears),
    educationLevel: job.educationLevel || null,
    salaryMin: num(job.salaryMin),
    salaryMax: num(job.salaryMax),
    salaryCurrency: job.salaryCurrency,
    closingDate: job.closingDate || null,
  }, sectionsFromJob(job))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview — as it appears on your careers page</DialogTitle>
        </DialogHeader>
        <article
          className="prose prose-slate max-w-none prose-headings:tracking-tight prose-h1:text-3xl prose-h2:mt-8 prose-h2:text-xl prose-li:my-1 prose-p:leading-relaxed"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }}
        />
        <section className="mt-8 border-t border-slate-200 pt-6">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Apply for this role</h2>
          <div className="mt-4">
            <ApplyForm requisitionId={job.id ?? 'preview'} jobTitle={job.title} config={form} preview />
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}
