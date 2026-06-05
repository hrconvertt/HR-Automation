'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { MessageSquare, Star, CheckCircle2, XCircle, Clock } from 'lucide-react'

interface Props {
  interviewId: string
  candidateName: string
  round: number
  type: string
  initialFeedback: string | null
  initialRating: number | null
  initialResult: string | null
}

/**
 * Submit feedback for one interview. On PASS, the API auto-drafts the
 * next-step email and advances the candidate's pipeline stage.
 */
export function InterviewFeedbackButton({
  interviewId, candidateName, round, type, initialFeedback, initialRating, initialResult,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(initialFeedback ?? '')
  const [rating, setRating] = useState<number>(initialRating ?? 0)
  const [result, setResult] = useState<string | null>(initialResult)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function submit() {
    setError(''); setSuccess(''); setSaving(true)
    const res = await fetch(`/api/recruiting/interviews/${interviewId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback, rating: rating || null, result }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Save failed'); return }
    if (data.inviteDrafted) {
      setSuccess('Saved. Onsite-interview invite drafted in Email Queue.')
    } else {
      setSuccess('Feedback saved.')
    }
    setTimeout(() => { setOpen(false); setSuccess(''); router.refresh() }, 1200)
  }

  const buttonTone =
    initialResult === 'PASS' ? 'text-emerald-700 border-emerald-200 bg-emerald-50' :
    initialResult === 'FAIL' ? 'text-rose-700 border-rose-200 bg-rose-50' :
    initialResult === 'HOLD' ? 'text-amber-700 border-amber-200 bg-amber-50' :
    'text-blue-700 border-blue-200 bg-blue-50'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border ${buttonTone} hover:opacity-80`}
      >
        <MessageSquare className="w-3 h-3" />
        {initialResult ? initialResult : 'Submit feedback'}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              Interview Feedback
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600 flex items-center justify-between">
              <span>
                <span className="font-medium text-slate-900">{candidateName}</span>
                <span className="text-slate-400 mx-1.5">·</span>
                {type} · Round {round}
              </span>
            </div>

            {/* Rating */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setRating(v)}
                    className={`p-1.5 rounded ${rating >= v ? 'text-amber-500' : 'text-slate-300'} hover:text-amber-400`}
                  >
                    <Star className={`w-5 h-5 ${rating >= v ? 'fill-amber-400' : ''}`} />
                  </button>
                ))}
                {rating > 0 && (
                  <span className="text-xs text-slate-500 self-center ml-2 tabular-nums">{rating}/5</span>
                )}
              </div>
            </div>

            {/* Feedback */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Notes</label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="What went well? What were the concerns? Be specific — future you will thank you."
              />
            </div>

            {/* Result */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Result</label>
              <div className="flex gap-2 flex-wrap">
                <ResultPill icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Pass" value="PASS" tone="emerald" active={result === 'PASS'} onClick={() => setResult('PASS')} />
                <ResultPill icon={<XCircle className="w-3.5 h-3.5" />} label="Fail" value="FAIL" tone="rose"    active={result === 'FAIL'} onClick={() => setResult('FAIL')} />
                <ResultPill icon={<Clock className="w-3.5 h-3.5" />} label="Hold" value="HOLD" tone="amber"   active={result === 'HOLD'} onClick={() => setResult('HOLD')} />
              </div>
              {result === 'PASS' && type !== 'ONSITE' && (
                <p className="text-[11px] text-blue-700 mt-2 bg-blue-50 border border-blue-100 rounded px-2.5 py-1.5">
                  ✨ On save, the system will draft an onsite-interview invite for {candidateName} in the Email Queue. You'll review before sending.
                </p>
              )}
              {result === 'PASS' && type === 'ONSITE' && (
                <p className="text-[11px] text-emerald-700 mt-2 bg-emerald-50 border border-emerald-100 rounded px-2.5 py-1.5">
                  ✨ On save, {candidateName} will move to the <strong>OFFER</strong> stage in the pipeline.
                </p>
              )}
              {result === 'FAIL' && (
                <p className="text-[11px] text-rose-700 mt-2 bg-rose-50 border border-rose-100 rounded px-2.5 py-1.5">
                  Candidate will move to <strong>REJECTED</strong>. You can manually un-reject later if needed.
                </p>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
            )}
            {success && (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">{success}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !result}>
              {saving ? 'Saving…' : 'Save feedback'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ResultPill({ icon, label, tone, active, onClick }: {
  icon: React.ReactNode; label: string; value: string; tone: 'emerald' | 'rose' | 'amber'; active: boolean; onClick: () => void
}) {
  const ACTIVE: Record<string, string> = {
    emerald: 'bg-emerald-600 text-white border-emerald-600',
    rose:    'bg-rose-600 text-white border-rose-600',
    amber:   'bg-amber-500 text-white border-amber-500',
  }
  const IDLE: Record<string, string> = {
    emerald: 'text-emerald-700 border-emerald-200 hover:bg-emerald-50',
    rose:    'text-rose-700 border-rose-200 hover:bg-rose-50',
    amber:   'text-amber-700 border-amber-200 hover:bg-amber-50',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border ${active ? ACTIVE[tone] : IDLE[tone]}`}
    >
      {icon} {label}
    </button>
  )
}
