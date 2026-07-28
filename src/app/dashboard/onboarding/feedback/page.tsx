'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/ui/back-button'

export default function OnboardingFeedbackPage() {
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [managerRating, setManagerRating] = useState(4)
  const [clarityRating, setClarityRating] = useState(4)
  const [recommendScore, setRecommendScore] = useState(8)
  const [missingItems, setMissingItems] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch('/api/onboarding/feedback').then((r) => r.json()).then((d) => {
      if (d.feedback?.submittedAt) {
        setSubmittedAt(d.feedback.submittedAt)
        setManagerRating(d.feedback.managerRating ?? 4)
        setClarityRating(d.feedback.clarityRating ?? 4)
        setRecommendScore(d.feedback.recommendScore ?? 8)
        setMissingItems(d.feedback.missingItems ?? '')
      }
    }).catch(() => {})
  }, [])

  async function submit() {
    setBusy(true)
    const res = await fetch('/api/onboarding/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerRating, clarityRating, recommendScore, missingItems }),
    })
    setBusy(false)
    if (res.ok) setDone(true)
  }

  if (done || submittedAt) {
    return (
      <div className="space-y-4">
        <BackButton fallback="/dashboard" />
        <Card>
          <CardHeader><CardTitle>Thank you</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700">
              Your feedback was submitted{submittedAt ? ` on ${new Date(submittedAt).toLocaleDateString('en-GB')}` : ''}. HR will review it.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <BackButton fallback="/dashboard" />
      <Card>
        <CardHeader><CardTitle>Day-30 Onboarding Feedback</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-slate-600">5-minute survey — your responses help us improve onboarding for future hires.</p>

          <label className="block">
            <span className="font-medium text-slate-700">Manager support: {managerRating}/5</span>
            <input type="range" min={1} max={5} value={managerRating} onChange={(e) => setManagerRating(Number(e.target.value))} className="w-full" />
          </label>

          <label className="block">
            <span className="font-medium text-slate-700">Clarity of role and expectations: {clarityRating}/5</span>
            <input type="range" min={1} max={5} value={clarityRating} onChange={(e) => setClarityRating(Number(e.target.value))} className="w-full" />
          </label>

          <label className="block">
            <span className="font-medium text-slate-700">Anything missing from your onboarding?</span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
              rows={3}
              value={missingItems}
              onChange={(e) => setMissingItems(e.target.value)}
              placeholder="Tools you needed, intros that didn't happen, info you wish you had…"
            />
          </label>

          <label className="block">
            <span className="font-medium text-slate-700">Would you recommend Convertt as a workplace? {recommendScore}/10</span>
            <input type="range" min={0} max={10} value={recommendScore} onChange={(e) => setRecommendScore(Number(e.target.value))} className="w-full" />
          </label>

          <Button onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit Feedback'}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
