'use client'

/**
 * The job post editor — Workable's five steps for creating a job, on one
 * JobRequisition row.
 *
 * The header carries the job's name and state ("[Draft] Account Manager") and
 * the buttons that act on the whole job: Save draft and Save & continue on The
 * Job, Preview job and Publish on the rest. A manager's last button is Submit
 * for approval instead — their job becomes a request HR decides, as before.
 *
 * The Job's boxes live here rather than in their step, so switching steps and
 * coming back does not lose what was typed, and Publish can save them first.
 */

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, CheckCircle2, ExternalLink, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ManpowerFormButton } from '@/components/recruiting/manpower-form-button'
import { safeFetch } from '@/lib/safe-fetch'
import { missingForPublish } from '@/lib/job-post'
import {
  STEPS, jobPayload, sectionsFromJob,
  type EditorDetails, type EditorJob, type StepKey,
} from './types'
import { StepJob } from './step-job'
import { StepApplicationForm } from './step-application-form'
import { StepFindCandidates } from './step-find-candidates'
import { StepTeam } from './step-team'
import { StepWorkflow } from './step-workflow'
import { JobPreviewDialog } from './job-preview-dialog'

interface Props {
  job: EditorJob
  step: StepKey
  isHR: boolean
  canEdit: boolean
  departments: { id: string; name: string }[]
  details: EditorDetails | null
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

const STATUS_PREFIX: Record<string, string> = {
  DRAFT: '[Draft]',
  PENDING: '[Waiting for HR]',
  PAUSED: '[Paused]',
  CLOSED: '[Closed]',
  FILLED: '[Filled]',
}

export function JobPostEditor({ job: initial, step, isHR, canEdit, departments, details }: Props) {
  const router = useRouter()
  const [job, setJob] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [busy, setBusy] = useState<null | 'draft' | 'continue' | 'publish'>(null)
  const [error, setError] = useState<{ text: string; needsForm?: boolean } | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const dirty = JSON.stringify(job) !== JSON.stringify(saved)
  const isDraft = job.status === 'DRAFT'
  const published = job.status === 'OPEN' && job.jdStatus === 'POSTED'
  const canPublish = canEdit && !!job.id && (isDraft || (isHR && job.status === 'OPEN' && !published))
  const prefix = STATUS_PREFIX[job.status] ?? (job.status === 'OPEN' && !published ? '[Not published]' : '')

  async function putJob(id: string) {
    return safeFetch(`/api/recruiting/requisitions/${id}/post`, {
      method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ job: jobPayload(job) }),
    })
  }

  async function save(then: 'stay' | 'continue') {
    setError(null)
    setJustSaved(false)
    if (then === 'continue') {
      const missing = missingForPublish({ title: job.title, departmentId: job.departmentId || null }, sectionsFromJob(job))
      if (missing.length) { setError({ text: `Fill in ${missing.join(', ')} to continue.` }); return }
    } else if (job.title.trim().length < 2) {
      setError({ text: 'Give the job a title before saving it.' }); return
    }

    setBusy(then === 'continue' ? 'continue' : 'draft')
    let id = job.id
    if (id) {
      const r = await putJob(id)
      if (!r.ok) { setBusy(null); setError({ text: r.error ?? 'Could not save the job.' }); return }
    } else {
      const r = await safeFetch<{ requisition?: { id: string } }>('/api/recruiting/requisitions', {
        method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ job: jobPayload(job) }),
      })
      id = r.data?.requisition?.id ?? null
      if (!r.ok || !id) { setBusy(null); setError({ text: r.error ?? 'Could not save the job.' }); return }
    }
    setBusy(null)
    setSaved(job)

    if (then === 'continue') router.push(`/dashboard/recruiting/jobs/${id}?step=form`)
    else if (!job.id) router.push(`/dashboard/recruiting/jobs/${id}`)
    else { setJustSaved(true); router.refresh() }
  }

  async function publish() {
    if (!job.id) return
    setError(null)
    setBusy('publish')
    if (dirty) {
      const r = await putJob(job.id)
      if (!r.ok) { setBusy(null); setError({ text: r.error ?? 'Could not save The Job before publishing.' }); return }
      setSaved(job)
    }
    const r = await safeFetch<{ status?: string; needsForm?: boolean }>(
      `/api/recruiting/requisitions/${job.id}/publish`, { method: 'POST' },
    )
    setBusy(null)
    if (!r.ok) {
      setError({
        text: r.error ?? 'Could not publish the job.',
        needsForm: !!r.data?.needsForm,
      })
      return
    }
    if (isHR) {
      router.push(`/dashboard/recruiting/jobs/${job.id}?step=find`)
      router.refresh()
    } else {
      router.push('/dashboard/recruiting?tab=requests')
    }
  }

  const deptName = departments.find((d) => d.id === job.departmentId)?.name ?? null

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/dashboard/recruiting?tab=requisitions"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Job Requisitions
        </Link>
        <div className="mt-1 flex items-start justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-slate-900 min-w-0 break-words">
            {prefix && <span className="text-slate-400 font-normal mr-2">{prefix}</span>}
            {job.title.trim() || 'New job post'}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            {dirty && <span className="text-xs text-amber-700">Unsaved changes on The Job</span>}
            {justSaved && !dirty && (
              <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            {job.id && (
              <Link
                href={`/dashboard/recruiting/jobs/${job.id}/candidates`}
                className="inline-flex items-center h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                View candidates
              </Link>
            )}
            {job.id && details && (
              <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                <Eye className="w-4 h-4 mr-1.5" /> Preview job
              </Button>
            )}
            {published && (
              <a
                href={`/careers/${job.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                View on careers page <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {canEdit && step === 'job' && (isDraft ? (
              <>
                <Button variant="outline" size="sm" onClick={() => save('stay')} disabled={!!busy}>
                  {busy === 'draft' ? 'Saving…' : 'Save draft'}
                </Button>
                <Button size="sm" onClick={() => save('continue')} disabled={!!busy}>
                  {busy === 'continue' ? 'Saving…' : 'Save & continue'}
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => save('stay')} disabled={!!busy}>
                {busy === 'draft' ? 'Saving…' : 'Save changes'}
              </Button>
            ))}
            {canPublish && step !== 'job' && (
              <Button size="sm" onClick={publish} disabled={!!busy}>
                {busy === 'publish'
                  ? (isHR ? 'Publishing…' : 'Submitting…')
                  : (isHR ? 'Publish' : 'Submit for approval')}
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {error.text}
              {/* The form page takes the form's own id, and a new job has no
                  form yet — so this is the board's Form button, which starts
                  one on first click and opens it after. */}
              {error.needsForm && job.id && (
                <span className="mt-2 flex items-center gap-2">
                  Requisition form:
                  <ManpowerFormButton
                    requisitionId={job.id}
                    existingFormId={details?.manpowerForm?.id ?? null}
                    status={details?.manpowerForm?.status ?? null}
                  />
                </span>
              )}
            </span>
          </div>
        )}
        {!canEdit && (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            You can read this job. Only HR can change it now that it has been decided.
          </p>
        )}
      </div>

      <nav aria-label="Job post steps" className="grid grid-cols-2 md:grid-cols-5 gap-1 border-b border-slate-200 pb-2">
        {STEPS.map((s) => {
          const active = s.key === step
          const enabled = !!job.id || s.key === 'job'
          const cls = `block rounded-lg px-3 py-2.5 ${
            active ? 'bg-slate-100' : enabled ? 'hover:bg-slate-50' : 'opacity-50 cursor-not-allowed'
          }`
          const inner = (
            <>
              <span className="block text-sm font-semibold text-slate-900">{s.title}</span>
              <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">{s.blurb}</span>
            </>
          )
          return enabled && job.id ? (
            <Link key={s.key} href={`/dashboard/recruiting/jobs/${job.id}?step=${s.key}`}
              aria-current={active ? 'step' : undefined} className={cls}>
              {inner}
            </Link>
          ) : (
            <div key={s.key} className={cls} title={enabled ? undefined : 'Save The Job first'}
              aria-current={active ? 'step' : undefined}>
              {inner}
            </div>
          )
        })}
      </nav>

      {step === 'job' && (
        <StepJob
          job={job}
          onChange={setJob}
          departments={departments}
          canEdit={canEdit}
          isDraft={isDraft}
          busy={!!busy}
          onSave={save}
        />
      )}
      {job.id && details && step === 'form' && (
        <StepApplicationForm
          jobId={job.id}
          jobTitle={job.title}
          initial={details.form}
          knockoutFields={details.knockoutFields}
          requirements={sectionsFromJob(job).requirements}
          isHR={isHR}
          canEdit={canEdit}
        />
      )}
      {job.id && details && step === 'find' && (
        <StepFindCandidates
          jobId={job.id}
          title={job.title}
          status={job.status}
          published={published}
          isHR={isHR}
          gateReason={details.gateReason}
          manpowerForm={details.manpowerForm}
          poolMatches={details.poolMatches}
          referralsAskedAt={details.referralsAskedAt}
          onPublish={canPublish ? publish : undefined}
        />
      )}
      {job.id && details && step === 'team' && (
        <StepTeam
          jobId={job.id}
          members={details.members}
          requester={details.requester}
          employees={details.employees}
          canEdit={canEdit}
        />
      )}
      {job.id && details && step === 'workflow' && (
        <StepWorkflow jobId={job.id} initial={details.rounds} canEdit={canEdit} />
      )}

      {job.id && details && (
        <JobPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          job={job}
          departmentName={deptName}
          form={details.form}
        />
      )}
    </div>
  )
}
