'use client'

/**
 * A job's candidates, Workable-style: the stages across the top, the people
 * at the chosen stage on the left, the selected person on the right with the
 * button that moves them on.
 *
 * Drop CVs anywhere on the page and they are read into this job — the same
 * reading that fills the Requisition Workspace sheet, so both views show the
 * new people with every detail.
 */

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ChevronDown, FileSpreadsheet, FileText,
  Loader2, Pencil, Sheet, Upload, UserX, Users, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { ScheduleInterviewDialog } from '@/components/recruiting/schedule-interview-dialog'
import { getInitials } from '@/lib/utils'
import { TRACKER_COLUMNS, type TrackerKey } from '@/lib/candidate-tracker'
import {
  CV_ACCEPT, ImportSheetDialog, UploadCvsDialog, useCvUploads,
} from '../../../_components/intake-dialogs'

export interface ViewCandidate {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  stage: string
  source: string | null
  matchScore: number | null
  knockedOut: boolean
  knockoutReasons: string[]
  inTalentPool: boolean
  headline: string | null
  location: string | null
  skills: string[]
  answers: { question: string; answer: string }[]
  createdAt: string
  updatedAt: string
  cvUrl: string | null
  cv: { name: string; mime: string } | null
  notes: string | null
  tracker: Record<TrackerKey, string | null>
  screening: Record<string, string>
  interviews: { id: string; type: string; scheduledAt: string; result: string | null }[]
}

interface JobInfo {
  id: string
  title: string
  status: string
  meta: string
  screeningColumns: string[]
  hasJd: boolean
}

const STAGES = [
  { key: 'APPLIED', label: 'Applied' },
  { key: 'SCREENING', label: 'Screening' },
  { key: 'INTERVIEW', label: 'Interview' },
  { key: 'OFFER', label: 'Offer' },
  { key: 'HIRED', label: 'Hired' },
] as const
const NEXT: Record<string, string> = { APPLIED: 'SCREENING', SCREENING: 'INTERVIEW', INTERVIEW: 'OFFER', OFFER: 'HIRED' }
const LABEL: Record<string, string> = { APPLIED: 'Applied', SCREENING: 'Screening', INTERVIEW: 'Interview', OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Disqualified' }
const SOURCE: Record<string, string> = {
  CV_UPLOAD: 'CV uploaded by HR', SHEET_IMPORT: 'Imported from a screening sheet', BULK_UPLOAD: 'Bulk upload',
  REFERRAL: 'Referral', LINKEDIN: 'LinkedIn', PORTAL: 'Job portal', CAREERS_PAGE: 'Careers page', WALK_IN: 'Walk-in', OTHER: 'Other',
}

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'less than a minute ago'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi',
})

export function CandidatesView({ job, candidates, initialStage, initialCandidateId, isHR }: {
  job: JobInfo
  candidates: ViewCandidate[]
  initialStage: string | null
  initialCandidateId: string | null
  isHR: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const firstStage = STAGES.find((s) => s.key === initialStage)?.key
    ?? STAGES.find((s) => candidates.some((c) => c.stage === s.key && !c.knockedOut))?.key
    ?? 'APPLIED'
  const [stage, setStage] = useState<string>(firstStage)
  const [list, setList] = useState<'qualified' | 'disqualified'>('qualified')
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(initialCandidateId)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [columnsDialog, setColumnsDialog] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [panel, setPanel] = useState<'open' | 'background' | 'closed'>('closed')
  const fileInput = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const refresh = useCallback(() => router.refresh(), [router])
  const uploads = useCvUploads(job.id, refresh)
  const addFiles = useRef(uploads.add)
  useEffect(() => { addFiles.current = uploads.add })

  // Counts per stage are of qualified people; disqualified are counted apart.
  const qualified = candidates.filter((c) => c.stage !== 'REJECTED' && !c.knockedOut)
  const disqualified = candidates.filter((c) => c.stage === 'REJECTED' || c.knockedOut)
  const countAt = (key: string) => qualified.filter((c) => c.stage === key).length

  const pool = list === 'qualified' ? qualified.filter((c) => c.stage === stage) : disqualified
  const needle = q.trim().toLowerCase()
  const shown = needle
    ? pool.filter((c) => [c.fullName, c.headline, c.email, c.location, ...c.skills].filter(Boolean).join(' ').toLowerCase().includes(needle))
    : pool

  const selected = candidates.find((c) => c.id === selectedId) ?? shown[0] ?? null

  function go(nextStage: string, nextList: 'qualified' | 'disqualified' = 'qualified') {
    setStage(nextStage)
    setList(nextList)
    setPicked([])
    setSelectedId(null)
    router.replace(`${pathname}?stage=${nextStage}`, { scroll: false })
  }

  function select(id: string) {
    setSelectedId(id)
    router.replace(`${pathname}?stage=${stage}&c=${id}`, { scroll: false })
  }

  async function moveTo(ids: string[], to: string) {
    if (!ids.length) return
    setBusy(true)
    const failed: string[] = []
    for (const id of ids) {
      const res = await fetch(`/api/recruiting/candidates/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: to }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        failed.push(`${candidates.find((c) => c.id === id)?.fullName ?? id}: ${d.error ?? res.statusText}`)
      }
    }
    setBusy(false)
    setPicked([])
    setMenuOpen(false)
    const moved = ids.length - failed.length
    if (moved) toastSuccess(to === 'REJECTED' ? `${moved} disqualified` : `${moved} moved to ${LABEL[to]}`)
    if (failed.length) toastError('Some did not move', failed.join(' · '))
    router.refresh()
  }

  function startUpload(files: FileList | File[] | null) {
    if (!files || !('length' in files) || files.length === 0) return
    const problem = uploads.add(Array.from(files))
    if (problem) toastError('Some files were not uploaded', problem)
    setPanel('open')
  }

  // Drop CVs anywhere on the page.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDragging(true) }
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault() }
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false) }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      if (e.dataTransfer?.files?.length) {
        const problem = addFiles.current(Array.from(e.dataTransfer.files))
        if (problem) toastError('Some files were not uploaded', problem)
        setPanel('open')
      }
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  const uploaded = uploads.items.filter((i) => i.status.state === 'created' || i.status.state === 'updated').length
  const withEmail = uploads.items.filter((i) => i.status.state === 'created').length
  const failed = uploads.items.filter((i) => i.status.state === 'error').length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link href="/dashboard/recruiting?tab=requisitions" className="text-xs text-slate-500 hover:text-slate-900">← Job Requisitions</Link>
          <h1 className="text-2xl font-semibold text-slate-900 mt-1">{job.title}</h1>
          <p className="text-sm text-slate-500">{[job.meta, LABEL[job.status] ? null : job.status.toLowerCase()].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Button onClick={() => setMenuOpen((v) => !v)}>
              <Users className="w-4 h-4 mr-1.5" /> Add candidates <ChevronDown className="w-3.5 h-3.5 ml-1" />
            </Button>
            {menuOpen && (
              <div className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                <button type="button" onClick={() => { setMenuOpen(false); fileInput.current?.click() }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-900"><Upload className="w-4 h-4" /> Upload resumes</span>
                  <span className="block text-xs text-slate-500 ml-6">PDF, Word or images — read into every column</span>
                </button>
                <button type="button" onClick={() => { setMenuOpen(false); setColumnsDialog(true) }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-900"><FileText className="w-4 h-4" /> Upload resumes with new columns</span>
                  <span className="block text-xs text-slate-500 ml-6">Columns suggested from the job description first</span>
                </button>
                <button type="button" onClick={() => { setMenuOpen(false); setImportOpen(true) }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-900"><FileSpreadsheet className="w-4 h-4" /> Import screened sheet</span>
                  <span className="block text-xs text-slate-500 ml-6">Excel, CSV or PDF of candidates already screened</span>
                </button>
              </div>
            )}
            <input ref={fileInput} type="file" multiple hidden accept={CV_ACCEPT}
              onChange={(e) => { startUpload(e.target.files); e.target.value = '' }} />
          </div>
          <Link href={`/dashboard/recruiting?tab=workspace&req=${job.id}`}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50">
            <Sheet className="w-4 h-4" /> Open as sheet
          </Link>
          <Link href={`/dashboard/recruiting/jobs/${job.id}`}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50">
            <Pencil className="w-4 h-4" /> Edit job
          </Link>
        </div>
      </div>

      {/* Stages */}
      <nav className="grid grid-cols-5 rounded-xl border border-slate-200 bg-white overflow-hidden" aria-label="Stages">
        {STAGES.map((s) => {
          const on = list === 'qualified' && stage === s.key
          const n = countAt(s.key)
          return (
            <button key={s.key} type="button" onClick={() => go(s.key)} aria-current={on ? 'page' : undefined}
              className={`py-3 text-center border-r last:border-r-0 border-slate-100 ${on ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
              <span className={`block text-lg tabular-nums ${n ? 'font-semibold text-slate-900' : 'text-slate-300'}`}>{n || '–'}</span>
              <span className="block text-xs text-slate-600">{s.label}</span>
            </button>
          )
        })}
      </nav>

      {candidates.length === 0 ? (
        <EmptyState onUpload={() => fileInput.current?.click()} onImport={() => setImportOpen(true)} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] items-start">
          {/* The list */}
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden lg:sticky lg:top-4">
            <div className="grid grid-cols-2 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide">
              {(['qualified', 'disqualified'] as const).map((l) => (
                <button key={l} type="button" onClick={() => { setList(l); setPicked([]); setSelectedId(null) }}
                  className={`py-2.5 ${list === l ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-400 hover:text-slate-700'}`}>
                  {l === 'qualified' ? `Qualified ${countAt(stage)}` : `Disqualified ${disqualified.length}`}
                </button>
              ))}
            </div>
            <div className="p-3 space-y-2 border-b border-slate-100">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, role, skill or city"
                aria-label="Filter candidates"
                className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10" />
              <div className="flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={shown.length > 0 && shown.every((c) => picked.includes(c.id))}
                    onChange={(e) => setPicked(e.target.checked ? shown.map((c) => c.id) : [])} />
                  Select all
                </label>
                {picked.length > 0 && (
                  <span className="flex items-center gap-1">
                    {list === 'qualified' && NEXT[stage] && (
                      <button type="button" disabled={busy} onClick={() => moveTo(picked, NEXT[stage])}
                        className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">
                        Move {picked.length} to {LABEL[NEXT[stage]]}
                      </button>
                    )}
                    {list === 'qualified' && (
                      <button type="button" disabled={busy} onClick={() => confirm(`Disqualify ${picked.length}?`) && moveTo(picked, 'REJECTED')}
                        className="text-xs px-2 py-1 rounded border border-slate-300 text-red-700 hover:bg-red-50">
                        Disqualify
                      </button>
                    )}
                  </span>
                )}
              </div>
            </div>
            <ul className="max-h-[calc(100vh-20rem)] overflow-y-auto divide-y divide-slate-50">
              {shown.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-slate-400">
                  {q ? 'Nobody matches this filter.' : list === 'qualified' ? `Nobody at ${LABEL[stage]}.` : 'Nobody disqualified.'}
                </li>
              )}
              {shown.map((c) => {
                const on = selected?.id === c.id
                return (
                  <li key={c.id} className={`flex items-center gap-2 px-3 py-2.5 ${on ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                    <input type="checkbox" checked={picked.includes(c.id)} aria-label={`Select ${c.fullName}`}
                      onChange={() => setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))} />
                    <button type="button" onClick={() => select(c.id)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
                      <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center shrink-0">
                        {getInitials(c.fullName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900 truncate">{c.fullName}</span>
                        <span className="block text-xs text-slate-500 truncate">
                          {list === 'disqualified' ? (c.knockedOut ? 'Knocked out' : 'Disqualified') + ' · ' : ''}
                          {c.headline ?? ago(c.createdAt)}
                        </span>
                      </span>
                      {c.matchScore != null && (
                        <span className="text-xs tabular-nums text-slate-600 shrink-0">{Math.round(c.matchScore)}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          {/* The person */}
          {selected ? (
            <Profile
              key={selected.id}
              c={selected}
              job={job}
              busy={busy}
              onMove={(to) => moveTo([selected.id], to)}
            />
          ) : (
            <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              Pick someone on the left.
            </section>
          )}
        </div>
      )}

      {/* Drag and drop overlay */}
      {dragging && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-8 pointer-events-none">
          <div className="w-full h-full rounded-2xl border-2 border-dashed border-white/70 flex flex-col items-center justify-center text-white text-center">
            <Upload className="w-12 h-12" />
            <p className="text-2xl font-semibold mt-3">Drag &amp; drop to upload resumes</p>
            <p className="text-sm text-white/80 mt-1">Drop one or more PDF, Word (.docx) or image files and they will show up as candidates in {job.title}.</p>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploads.items.length > 0 && panel === 'open' && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-around gap-2 px-5 py-4 border-b border-slate-100 text-sm">
              <span><strong className="text-lg tabular-nums">{uploaded}</strong> Uploaded {uploads.busy ? '' : '✓'}</span>
              <span><strong className="text-lg tabular-nums">{withEmail}</strong> New candidates</span>
              <span><strong className="text-lg tabular-nums">{failed}</strong> Could not be read</span>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto divide-y divide-slate-50">
              {uploads.items.map(({ file, status }, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  {status.state === 'waiting' || status.state === 'reading'
                    ? <Loader2 className={`w-4 h-4 ${status.state === 'reading' ? 'animate-spin text-slate-600' : 'text-slate-300'}`} />
                    : status.state === 'error' ? <X className="w-4 h-4 text-red-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-slate-800">
                      {status.state === 'reading' ? 'Parsing resume ' : ''}{file.name}
                    </span>
                    <span className="block text-xs text-slate-500 truncate">
                      {status.state === 'waiting' && 'Waiting'}
                      {status.state === 'created' && `${status.name} added to Applied${status.score != null ? ` · fit ${status.score}/100` : ''}${status.knockedOut ? ' · did not meet a hard requirement (Disqualified)' : ''}`}
                      {status.state === 'updated' && `${status.name} was already here · ${status.filled} blank detail${status.filled === 1 ? '' : 's'} filled`}
                      {status.state === 'error' && <span className="text-red-700">{status.error}</span>}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100">
              <p className="text-xs text-slate-500">Forgot one? Drop more files on the page, or <button type="button" className="underline" onClick={() => fileInput.current?.click()}>choose</button> them.</p>
              {uploads.busy
                ? <Button variant="outline" onClick={() => setPanel('background')}>Continue in background</Button>
                : <Button onClick={() => { setPanel('closed'); uploads.clear() }}>Done</Button>}
            </div>
          </div>
        </div>
      )}
      {uploads.items.length > 0 && panel === 'background' && (
        <button type="button" onClick={() => setPanel('open')}
          className="fixed bottom-4 right-4 z-40 rounded-full bg-slate-900 text-white text-sm px-4 py-2 shadow-lg inline-flex items-center gap-2">
          {uploads.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {uploads.busy ? `Reading resumes · ${uploads.done} of ${uploads.items.length}` : `${uploaded} resumes read — show`}
        </button>
      )}

      {importOpen && <ImportSheetDialog requisitionId={job.id} canEditColumns={isHR} onClose={() => setImportOpen(false)} />}
      {columnsDialog && (
        <UploadCvsDialog requisitionId={job.id} screeningColumns={job.screeningColumns} canEditColumns={isHR}
          onClose={() => setColumnsDialog(false)} />
      )}
    </div>
  )
}

function EmptyState({ onUpload, onImport }: { onUpload: () => void; onImport: () => void }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
      <Users className="w-10 h-10 mx-auto text-slate-300" />
      <p className="text-lg font-semibold text-slate-900 mt-3">No candidates yet</p>
      <p className="text-sm text-slate-500">You can always choose one of the following options — or drop CVs anywhere on this page.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 max-w-3xl mx-auto text-left">
        <div className="rounded-xl border border-slate-200 p-5">
          <p className="font-semibold text-slate-900 flex items-center gap-2"><Upload className="w-4 h-4" /> Upload candidate resumes</p>
          <p className="text-sm text-slate-500 mt-1">Received CVs by email or WhatsApp? Upload them — each is read into the candidate&apos;s details and scored against the job.</p>
          <Button className="mt-4" onClick={onUpload}>Upload resumes</Button>
        </div>
        <div className="rounded-xl border border-slate-200 p-5">
          <p className="font-semibold text-slate-900 flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Import a screened sheet</p>
          <p className="text-sm text-slate-500 mt-1">Already screening in Excel? Import the sheet and its columns come with it.</p>
          <Button variant="outline" className="mt-4" onClick={onImport}>Import sheet</Button>
        </div>
      </div>
    </section>
  )
}

function Profile({ c, job, busy, onMove }: { c: ViewCandidate; job: JobInfo; busy: boolean; onMove: (to: string) => void }) {
  const router = useRouter()
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const next = c.stage !== 'REJECTED' && !c.knockedOut ? NEXT[c.stage] : undefined

  async function saveEmail() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toastError('That is not an email address'); return }
    setSavingEmail(true)
    const res = await fetch(`/api/recruiting/candidates/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { email: email.trim() } }),
    })
    setSavingEmail(false)
    if (!res.ok) { toastError('Could not save the email'); return }
    toastSuccess('Email saved')
    router.refresh()
  }

  const facts: [string, string | null][] = [
    ['Email', c.email], ['Phone', c.phone], ['Location', c.location],
    ['Experience', c.tracker.experienceSummary], ['Current role', c.tracker.currentRole],
    ['Current company', c.tracker.currentCompany], ['Past companies', c.tracker.pastCompanies],
    ['Education', c.tracker.education],
  ]
  const salary = TRACKER_COLUMNS.filter((col) => col.group === 'Salary & joining' || col.group === 'Interview')
    .map((col) => [col.label, c.tracker[col.key]] as [string, string | null])
    .filter(([, v]) => v)

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
        <div className="flex items-center gap-4 min-w-0">
          <span className="w-16 h-16 rounded-full bg-slate-100 text-slate-600 text-xl font-semibold flex items-center justify-center shrink-0">
            {getInitials(c.fullName)}
          </span>
          <div className="min-w-0">
            <p className="text-xl font-semibold text-slate-900">{c.fullName}</p>
            {c.headline && <p className="text-sm text-slate-600">{c.headline}</p>}
            <p className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
              <span>{LABEL[c.stage] ?? c.stage}{c.knockedOut ? ' · knocked out' : ''}</span>
              {c.matchScore != null && <span>Fit score {Math.round(c.matchScore)}/100</span>}
              {c.tracker.verdict && <span>Verdict: {c.tracker.verdict.toLowerCase()}</span>}
              {c.inTalentPool && <span>In the talent pool</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setScheduleOpen(true)}>
            <CalendarClock className="w-4 h-4 mr-1.5" /> Schedule interview
          </Button>
          {c.stage !== 'REJECTED' && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => confirm(`Disqualify ${c.fullName}?`) && onMove('REJECTED')}
              className="text-red-700 hover:bg-red-50">
              <UserX className="w-4 h-4 mr-1.5" /> Disqualify
            </Button>
          )}
          <div className="relative inline-flex">
            {next ? (
              <Button size="sm" disabled={busy} onClick={() => onMove(next)} className="rounded-r-none">
                <ArrowRight className="w-4 h-4 mr-1.5" /> Move to {LABEL[next]}
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled className="rounded-r-none">{c.stage === 'HIRED' ? 'Hired' : 'Move to…'}</Button>
            )}
            <Button size="sm" variant={next ? 'default' : 'outline'} disabled={busy} className="rounded-l-none border-l border-white/30 px-2"
              aria-label="Move to another stage" onClick={() => setMoveOpen((v) => !v)}>
              <ChevronDown className="w-4 h-4" />
            </Button>
            {moveOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                {STAGES.filter((s) => s.key !== c.stage).map((s) => (
                  <button key={s.key} type="button" onClick={() => { setMoveOpen(false); onMove(s.key) }}
                    className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">
                    Move to {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {!c.email && (
        <div className="flex flex-wrap items-center gap-2 px-6 py-3 bg-amber-50 border-b border-amber-100 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-medium">There is no email for this candidate.</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com"
            aria-label="Email address" className="h-8 w-56 rounded-md border border-amber-200 bg-white px-2 text-sm" />
          <Button size="sm" variant="outline" disabled={savingEmail || !email.trim()} onClick={saveEmail}>Add email address</Button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] p-6">
        <div className="space-y-6 min-w-0">
          {(c.tracker.evaluation || c.knockoutReasons.length > 0) && (
            <Block title="Evaluation">
              {c.tracker.evaluation && <p className="text-sm text-slate-700 whitespace-pre-line">{c.tracker.evaluation}</p>}
              {c.knockoutReasons.length > 0 && (
                <ul className="mt-2 text-sm text-amber-800 list-disc pl-5">
                  {c.knockoutReasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </Block>
          )}

          <Block title="Candidate profile">
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[140px_minmax(0,1fr)] text-sm">
              {facts.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-slate-900 whitespace-pre-line break-words">{v || <span className="text-slate-300">—</span>}</dd>
                </div>
              ))}
            </dl>
            {c.skills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.skills.map((s) => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{s}</span>)}
              </div>
            )}
          </Block>

          {job.screeningColumns.length > 0 && (
            <Block title="Screening for this role">
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[180px_minmax(0,1fr)] text-sm">
                {job.screeningColumns.map((col) => (
                  <div key={col} className="contents">
                    <dt className="text-slate-500">{col}</dt>
                    <dd className="text-slate-900 whitespace-pre-line">{c.screening[col] || <span className="text-slate-300">—</span>}</dd>
                  </div>
                ))}
              </dl>
            </Block>
          )}

          {salary.length > 0 && (
            <Block title="Salary, joining and interviews">
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[180px_minmax(0,1fr)] text-sm">
                {salary.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="text-slate-900 whitespace-pre-line">{v}</dd>
                  </div>
                ))}
              </dl>
            </Block>
          )}

          {c.answers.length > 0 && (
            <Block title="Application answers">
              <dl className="space-y-2 text-sm">
                {c.answers.map((a, i) => (
                  <div key={i}><dt className="text-slate-500">{a.question}</dt><dd className="text-slate-900">{a.answer}</dd></div>
                ))}
              </dl>
            </Block>
          )}

          <Block title="Timeline">
            <ol className="space-y-2 text-sm">
              <li className="flex gap-2"><Upload className="w-4 h-4 text-slate-400 mt-0.5" />
                <span>{SOURCE[c.source ?? ''] ?? 'Added'} · <span className="text-slate-500">{fmt(c.createdAt)}</span></span></li>
              {c.interviews.map((i) => (
                <li key={i.id} className="flex gap-2"><CalendarClock className="w-4 h-4 text-slate-400 mt-0.5" />
                  <span>{i.type.charAt(0) + i.type.slice(1).toLowerCase()} interview · <span className="text-slate-500">{fmt(i.scheduledAt)}</span>{i.result ? ` · ${i.result.toLowerCase()}` : ''}</span></li>
              ))}
              <li className="flex gap-2"><ArrowRight className="w-4 h-4 text-slate-400 mt-0.5" />
                <span>Now at {LABEL[c.stage] ?? c.stage} · <span className="text-slate-500">last change {ago(c.updatedAt)}</span></span></li>
            </ol>
          </Block>
        </div>

        <div className="min-w-0">
          <Block title="Resume">
            {c.cv ? (
              <>
                <a href={c.cvUrl ?? '#'} target="_blank" rel="noreferrer" className="text-sm text-slate-700 underline underline-offset-2">
                  Open {c.cv.name}
                </a>
                {c.cv.mime === 'application/pdf' && c.cvUrl && (
                  <iframe title={`CV of ${c.fullName}`} src={`${c.cvUrl}#toolbar=0&view=FitH`}
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50" style={{ height: '75vh' }} />
                )}
                {c.cv.mime.startsWith('image/') && c.cvUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.cvUrl} alt={`CV of ${c.fullName}`} className="mt-3 w-full rounded-lg border border-slate-200" />
                )}
              </>
            ) : c.cvUrl ? (
              <a href={c.cvUrl} target="_blank" rel="noreferrer" className="text-sm text-slate-700 underline underline-offset-2">Open the CV</a>
            ) : (
              <p className="text-sm text-slate-400">No CV on file.</p>
            )}
          </Block>
        </div>
      </div>

      <ScheduleInterviewDialog candidateId={c.id} candidateName={c.fullName} roleTitle={job.title}
        requisitionId={job.id} open={scheduleOpen} onOpenChange={setScheduleOpen} />
    </section>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{title}</p>
      {children}
    </div>
  )
}
