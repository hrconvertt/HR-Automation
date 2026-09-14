'use client'

/**
 * Answering the survey. The six built-in questions on the agreement scale,
 * any custom questions on 0–10, the recommend question, and a comment — all
 * anonymous, and nothing shown to anyone until enough people have answered.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { PULSE_SCALE } from '@/lib/pulse'
import { ENGAGEMENT_QUESTION, driverLabel, MIN_RESPONSES } from '@/lib/voice'

export interface AnswerQuestion { key: string; driverKey: string; text: string; scale: number }

export function VoiceAnswer({ round, questions }: {
  round: { id: string; title: string; closesAt: string }
  questions: AnswerQuestion[]
}) {
  const router = useRouter()
  const [scores, setScores] = useState<Record<string, number>>({})
  const [enps, setEnps] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const answered = questions.filter((q) => scores[q.key] !== undefined).length
  const complete = answered === questions.length && enps !== null

  async function submit() {
    setBusy(true)
    try {
      const res = await fetch('/api/pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId: round.id, scores, enps, comment }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toastError('Could not submit your answers', (d as { error?: string }).error); return }
      toastSuccess('Thank you — your answers are in')
      router.refresh()
    } finally { setBusy(false) }
  }

  const choice = (on: boolean) =>
    `text-[13px] rounded-lg border ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'}`

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-blue-50/60">
        <h2 className="text-base font-semibold text-slate-900">{round.title} — your answers</h2>
        <p className="text-xs text-slate-600 mt-1">
          Anonymous. Nobody sees your answers individually, and no score or comment appears at all until at least {MIN_RESPONSES} people have answered.
          Open until {new Date(round.closesAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.
        </p>
      </div>
      <ol className="divide-y divide-slate-100">
        <li className="px-5 py-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Engagement</p>
          <p className="text-sm text-slate-900 mt-0.5">{ENGAGEMENT_QUESTION}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {Array.from({ length: 11 }, (_, i) => i).map((n) => (
              <button key={n} type="button" onClick={() => setEnps(n)} className={`${choice(enps === n)} w-10 h-10 font-semibold`}>{n}</button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">0 = not at all likely · 10 = extremely likely</p>
        </li>
        {questions.map((q) => (
          <li key={q.key} className="px-5 py-4">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">{driverLabel(q.driverKey)}</p>
            <p className="text-sm text-slate-900 mt-0.5">{q.text}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {q.scale === 10
                ? Array.from({ length: 11 }, (_, i) => i).map((n) => (
                    <button key={n} type="button" onClick={() => setScores((p) => ({ ...p, [q.key]: n }))} className={`${choice(scores[q.key] === n)} w-10 h-10 font-semibold`}>{n}</button>
                  ))
                : PULSE_SCALE.map((s) => (
                    <button key={s.value} type="button" onClick={() => setScores((p) => ({ ...p, [q.key]: s.value }))} className={`${choice(scores[q.key] === s.value)} px-3 py-1.5`}>{s.label}</button>
                  ))}
            </div>
          </li>
        ))}
        <li className="px-5 py-4">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-1">Anything else? (optional)</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2" placeholder="Read with everyone else's, never attributed to you." />
          </label>
        </li>
      </ol>
      <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-3 flex-wrap">
        <button type="button" onClick={submit} disabled={busy || !complete}
          className="text-sm font-semibold px-5 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40">
          {busy ? 'Submitting…' : 'Submit answers'}
        </button>
        <span className="text-[13px] text-slate-500">{answered + (enps !== null ? 1 : 0)} of {questions.length + 1} answered</span>
      </div>
    </section>
  )
}
