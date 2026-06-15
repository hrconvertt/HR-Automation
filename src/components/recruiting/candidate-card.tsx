'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getInitials } from '@/lib/utils'
import { ChevronDown, Star, CalendarClock } from 'lucide-react'
import { CreateOfferDialog } from './create-offer-dialog'
import { ScheduleInterviewDialog } from './schedule-interview-dialog'

const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700', 'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700',
  'bg-indigo-100 text-indigo-700', 'bg-teal-100 text-teal-700',
]
function avatarTone(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

const STAGES = [
  { key: 'APPLIED',   label: 'Applied' },
  { key: 'SCREENING', label: 'Screening' },
  { key: 'INTERVIEW', label: 'Interview' },
  { key: 'OFFER',     label: 'Offer' },
  { key: 'HIRED',     label: 'Hired' },
  { key: 'REJECTED',  label: 'Rejected' },
]

interface Props {
  candidate: {
    id: string
    fullName: string
    stage: string
    matchScore: number | null
    scoreReason: string | null
    inTalentPool?: boolean
    requisition: { title: string } | null
  }
  canMove: boolean
}

function scoreBucket(score: number | null): { label: string; tone: string } {
  if (score == null) return { label: '—',           tone: 'bg-slate-100 text-slate-500 border-slate-200' }
  if (score >= 80)   return { label: 'Strong',      tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (score >= 60)   return { label: 'Worth a call',tone: 'bg-blue-50 text-blue-700 border-blue-200' }
  if (score >= 40)   return { label: 'Maybe',       tone: 'bg-amber-50 text-amber-700 border-amber-200' }
  return              { label: 'Low fit',           tone: 'bg-rose-50 text-rose-700 border-rose-200' }
}

export function CandidateCard({ candidate, canMove }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  // When HR picks "Move to Offer", we don't just flip the stage — we open
  // the Create Offer dialog so they capture salary, joining date, etc.
  // The dialog handles the move + JobOffer creation + email draft.
  const [offerOpen, setOfferOpen] = useState(false)
  const [interviewOpen, setInterviewOpen] = useState(false)

  async function move(stage: string) {
    if (stage === candidate.stage) { setOpen(false); return }
    setOpen(false)
    if (stage === 'OFFER') { setOfferOpen(true); return }
    setSaving(true)
    const res = await fetch(`/api/recruiting/candidates/${candidate.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Failed to move candidate')
      return
    }
    router.refresh()
  }

  async function togglePool() {
    setOpen(false); setSaving(true)
    const res = await fetch(`/api/recruiting/talent-pool/${candidate.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inPool: !candidate.inTalentPool, reason: 'Manually added by HR for future roles' }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Failed to update pool status')
      return
    }
    router.refresh()
  }

  const bucket = scoreBucket(candidate.matchScore)
  return (
    <div className={`bg-white border border-slate-200 rounded-lg p-2.5 hover:border-blue-300 hover:shadow-sm transition-all relative ${saving ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${avatarTone(candidate.fullName)}`}>
          {getInitials(candidate.fullName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-slate-900 truncate">{candidate.fullName}</p>
            {candidate.inTalentPool && (
              <Star className="w-2.5 h-2.5 text-purple-500 fill-purple-500 flex-shrink-0" />
            )}
          </div>
          <p className="text-[10px] text-slate-500 truncate">{candidate.requisition?.title ?? 'No role'}</p>
        </div>
        {canMove && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-slate-400 hover:text-slate-700 p-0.5 flex-shrink-0"
            title="Move to stage"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Score chip — tooltip shows the reason */}
      {candidate.matchScore != null && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span
            className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${bucket.tone}`}
            title={candidate.scoreReason ?? undefined}
          >
            {bucket.label}
          </span>
          <span className="text-[10px] font-bold text-slate-700 tabular-nums">{candidate.matchScore}</span>
        </div>
      )}
      {open && canMove && (
        <div className="absolute right-2 top-9 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-44">
          {STAGES.filter((s) => s.key !== candidate.stage).map((s) => (
            <button key={s.key} onClick={() => move(s.key)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50">
              Move to <span className="font-medium">{s.label}</span>
            </button>
          ))}
          <div className="border-t border-slate-100 my-1" />
          <button onClick={togglePool}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-1.5 text-purple-700">
            <Star className="w-3 h-3" />
            {candidate.inTalentPool ? 'Remove from pool' : 'Add to talent pool'}
          </button>
        </div>
      )}

      {/* Schedule Interview — visible once the candidate has cleared APPLIED.
          Hidden for HIRED/REJECTED (terminal) and for non-actors. */}
      {canMove && !['HIRED', 'REJECTED'].includes(candidate.stage) && (
        <button
          type="button"
          onClick={() => setInterviewOpen(true)}
          className="mt-2 w-full text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded px-2 py-1 flex items-center justify-center gap-1"
          title="Schedule an interview for this candidate"
        >
          <CalendarClock className="w-3 h-3" />
          Schedule Interview
        </button>
      )}

      {/* Move-to-OFFER opens this dialog instead of a silent stage flip. */}
      <CreateOfferDialog
        candidateId={candidate.id}
        candidateName={candidate.fullName}
        roleTitle={candidate.requisition?.title ?? 'the role'}
        open={offerOpen}
        onOpenChange={setOfferOpen}
      />

      <ScheduleInterviewDialog
        candidateId={candidate.id}
        candidateName={candidate.fullName}
        roleTitle={candidate.requisition?.title ?? 'the role'}
        open={interviewOpen}
        onOpenChange={setInterviewOpen}
      />
    </div>
  )
}
