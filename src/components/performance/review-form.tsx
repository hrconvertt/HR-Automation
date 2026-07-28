'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Save, Send, CheckCircle2, Clock, Sparkles } from 'lucide-react'

interface ReviewGoal {
  id: string
  goalId: string
  description: string
  kpi: string | null
  target: string | null
  weight: number
  status: string
  selfComment: string | null
  managerComment: string | null
  achievement: number | null
}

interface Review {
  id: string
  status: string
  selfRating: number | null
  managerRating: number | null
  teamworkScore: number | null
  ownershipScore: number | null
  communicationScore: number | null
  reliabilityScore: number | null
  initiativeScore: number | null
  adaptabilityScore: number | null
  behavioralAvg: number | null
  individualScore: number | null
  teamScore: number | null
  overallRating: number | null
  finalCategory: string | null
  achievements: string | null
  learnings: string | null
  teamContribution: string | null
  managerFeedback: string | null
  // Time & Work auto-metrics (null on legacy reviews / failed compute)
  cycleStartDate?: string | null
  cycleEndDate?: string | null
  daysWorked?: number | null
  daysAbsent?: number | null
  daysOnLeave?: number | null
  lateArrivalCount?: number | null
  avgHoursPerDay?: number | null
  goalsOnTime?: number | null
  goalsLate?: number | null
  timeScore?: number | null
  goals?: ReviewGoal[]
}

interface Props {
  review: Review
  permissions: {
    isOwn: boolean
    isMyTeamMember: boolean
    isHR: boolean
    isExec?: boolean
  }
  // Blended suggestion: 60% work + 20% time + 20% behavioral (HR-only)
  suggestedOverall?: number | null
}

const RATING_OPTIONS = [
  { value: 1, label: '1 — Below Expectations' },
  { value: 2, label: '2 — Needs Improvement' },
  { value: 3, label: '3 — Meets Expectations' },
  { value: 4, label: '4 — Exceeds Expectations' },
  { value: 5, label: '5 — Outstanding' },
]

const CATEGORY_OPTIONS = [
  { value: 'EXCEEDS',        label: 'Exceeds Expectations', variant: 'success' as const },
  { value: 'MEETS',          label: 'Meets Expectations',   variant: 'default' as const },
  { value: 'BELOW',          label: 'Below Expectations',   variant: 'warning' as const },
  { value: 'UNSATISFACTORY', label: 'Unsatisfactory',       variant: 'destructive' as const },
]

export function ReviewForm({ review, permissions, suggestedOverall }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // Goal state — kept separately as it's array-shaped
  const [goalsForm, setGoalsForm] = useState<ReviewGoal[]>(review.goals ?? [])

  function updateGoal(id: string, field: keyof ReviewGoal, value: string | number | null) {
    setGoalsForm((prev) => prev.map((g) => g.id === id ? { ...g, [field]: value } : g))
  }

  // Form state
  const [form, setForm] = useState({
    selfRating: review.selfRating?.toString() ?? '',
    achievements: review.achievements ?? '',
    learnings: review.learnings ?? '',
    teamContribution: review.teamContribution ?? '',

    managerRating: review.managerRating?.toString() ?? '',
    teamworkScore: review.teamworkScore?.toString() ?? '',
    ownershipScore: review.ownershipScore?.toString() ?? '',
    communicationScore: review.communicationScore?.toString() ?? '',
    reliabilityScore: review.reliabilityScore?.toString() ?? '',
    initiativeScore: review.initiativeScore?.toString() ?? '',
    adaptabilityScore: review.adaptabilityScore?.toString() ?? '',
    teamScore: review.teamScore?.toString() ?? '',
    managerFeedback: review.managerFeedback ?? '',

    overallRating: review.overallRating?.toString() ?? '',
    finalCategory: review.finalCategory ?? '',
  })

  // Stage flags
  const isPending          = review.status === 'PENDING'
  const isSelfSubmitted    = review.status === 'SELF_SUBMITTED'
  const isManagerReviewed  = review.status === 'MANAGER_REVIEWED'
  const isFinalized        = review.status === 'HR_FINALIZED'

  // ─── confidentiality model ─────────────────────────────────
  // Self section: visible to the employee always (their own input);
  //               visible to others only after they submit it
  // Manager section: visible to the manager (their input) + HR always;
  //                  visible to the EMPLOYEE *only after* HR_FINALIZED (confidential)
  // HR section: visible to HR always; others only after HR_FINALIZED

  const canSeeSelf =
    permissions.isOwn ||
    ((permissions.isMyTeamMember || permissions.isHR || !!permissions.isExec) && !isPending)

  const canSeeManager =
    permissions.isMyTeamMember || permissions.isHR ||
    ((permissions.isOwn || !!permissions.isExec) && isFinalized)

  const canSeeHR =
    permissions.isHR ||
    ((permissions.isOwn || permissions.isMyTeamMember || !!permissions.isExec) && isFinalized)

  // Edit / submit flags — only when in the right stage AND not previewing/exec
  const showSelfForm    = permissions.isOwn && (isPending || isSelfSubmitted)
  const canSubmitSelf   = permissions.isOwn && isPending
  const showManagerForm = (permissions.isMyTeamMember || permissions.isHR) && (isSelfSubmitted || isManagerReviewed) && !isFinalized
  const canSubmitMgr    = (permissions.isMyTeamMember || permissions.isHR) && isSelfSubmitted
  const showHRForm      = permissions.isHR && (isManagerReviewed || isSelfSubmitted) && !isFinalized

  // ─── Stage-aware guidance banner ─────────────────────────────────────────
  function getStageBanner() {
    if (permissions.isOwn) {
      if (isPending)         return { tone: 'amber',  text: '👋 Your self-appraisal is due. Complete the form below and submit when ready.' }
      if (isSelfSubmitted)   return { tone: 'blue',   text: '✓ Submitted — your manager will review next.' }
      if (isManagerReviewed) return { tone: 'blue',   text: '⏳ Manager has completed the review. Awaiting HR finalization — we’ll notify you when your results are ready.' }
      if (isFinalized)       return { tone: 'green',  text: '🎉 Released — your final rating and feedback are below.' }
    }
    if (permissions.isMyTeamMember && !permissions.isHR) {
      if (isPending)         return { tone: 'amber',  text: '⏳ Waiting for your direct report to submit their self-appraisal.' }
      if (isSelfSubmitted)   return { tone: 'amber',  text: '👋 Your turn — please complete the manager evaluation below.' }
      if (isManagerReviewed) return { tone: 'blue',   text: '✓ Submitted to HR for finalization.' }
      if (isFinalized)       return { tone: 'green',  text: '✓ Review finalized.' }
    }
    if (permissions.isHR) {
      if (isPending)         return { tone: 'amber',  text: '⏳ Waiting on the employee to submit their self-appraisal.' }
      if (isSelfSubmitted)   return { tone: 'amber',  text: '⏳ Waiting on manager review.' }
      if (isManagerReviewed) return { tone: 'amber',  text: '👋 Ready for finalization. Set the overall rating and category below.' }
      if (isFinalized)       return { tone: 'green',  text: '✓ Review complete and released to the employee.' }
    }
    return null
  }
  const banner = getStageBanner()

  async function submit(action: 'SAVE_DRAFT' | 'SUBMIT_SELF' | 'SUBMIT_MANAGER' | 'FINALIZE') {
    setSaving(true)
    setMessage('')

    const body: Record<string, unknown> = { action }
    if (action === 'SAVE_DRAFT' || action === 'SUBMIT_SELF') {
      body.selfRating = form.selfRating ? Number(form.selfRating) : null
      body.achievements = form.achievements
      body.learnings = form.learnings
      body.teamContribution = form.teamContribution
      // Employee's goal self-ratings
      body.goals = goalsForm.map((g) => ({
        id: g.id,
        achievement: g.achievement,
        selfComment: g.selfComment,
      }))
    }
    if (action === 'SAVE_DRAFT' || action === 'SUBMIT_MANAGER') {
      if (form.managerRating)      body.managerRating      = Number(form.managerRating)
      if (form.teamworkScore)      body.teamworkScore      = Number(form.teamworkScore)
      if (form.ownershipScore)     body.ownershipScore     = Number(form.ownershipScore)
      if (form.communicationScore) body.communicationScore = Number(form.communicationScore)
      if (form.reliabilityScore)   body.reliabilityScore   = Number(form.reliabilityScore)
      if (form.initiativeScore)    body.initiativeScore    = Number(form.initiativeScore)
      if (form.adaptabilityScore)  body.adaptabilityScore  = Number(form.adaptabilityScore)
      if (form.teamScore)          body.teamScore          = Number(form.teamScore)
      body.managerFeedback = form.managerFeedback
      // Manager's goal assessments — overrides employee's self-rating if provided
      body.goals = goalsForm.map((g) => ({
        id: g.id,
        managerAchievement: g.achievement,   // manager can edit the achievement %
        managerComment: g.managerComment,
      }))
      // individualScore now auto-computed from goals server-side, no manual input
    }
    if (action === 'FINALIZE') {
      if (form.overallRating)  body.overallRating = Number(form.overallRating)
      if (form.finalCategory)  body.finalCategory = form.finalCategory
      body.managerFeedback = form.managerFeedback
    }

    const res = await fetch(`/api/performance/reviews/${review.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setMessage('❌ ' + (data.error || 'Failed to save'))
      return
    }
    setMessage('✓ Saved')
    setTimeout(() => router.refresh(), 600)
  }

  const bannerStyles: Record<string, string> = {
    amber: 'bg-slate-50 border-slate-100 text-slate-900',
    blue:  'bg-slate-50 border-slate-100 text-slate-900',
    green: 'bg-slate-50 border-slate-100 text-slate-900',
  }

  return (
    <div className="space-y-5">
      {/* ─── Stage-aware next-step banner ─── */}
      {banner && (
        <div className={`rounded-xl border p-4 text-sm ${bannerStyles[banner.tone]}`}>
          {banner.text}
        </div>
      )}

      {/* ─── SELF-APPRAISAL SECTION ─── */}
      {canSeeSelf && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="w-6 h-6 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              Self-Appraisal
              {review.selfRating != null && <Badge variant="default">{review.selfRating}/5</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {showSelfForm ? (
              <>
                {/* Goals — employee rates each linked goal */}
                {goalsForm.length > 0 && (
                  <div className="bg-slate-50/40 border border-slate-100 rounded-lg p-3 space-y-3">
                    <p className="text-sm font-semibold text-slate-900">📌 Your goals this cycle ({goalsForm.length})</p>
                    {goalsForm.map((g) => (
                      <GoalEditor
                        key={g.id}
                        goal={g}
                        mode="self"
                        onChange={(field, value) => updateGoal(g.id, field, value)}
                      />
                    ))}
                    <p className="text-xs text-slate-700">
                      Tip — give each goal an honest <strong>achievement %</strong>. Your manager will review.
                    </p>
                  </div>
                )}

                <FormSelect
                  label="My Overall Rating"
                  value={form.selfRating}
                  onChange={(v) => setForm({ ...form, selfRating: v })}
                  options={RATING_OPTIONS}
                />
                <FormTextarea
                  label="Key Achievements"
                  value={form.achievements}
                  onChange={(v) => setForm({ ...form, achievements: v })}
                  placeholder="What did you accomplish this period?"
                />
                <FormTextarea
                  label="Learnings & Growth"
                  value={form.learnings}
                  onChange={(v) => setForm({ ...form, learnings: v })}
                  placeholder="What did you learn? Areas of improvement?"
                />
                <FormTextarea
                  label="Team Contribution"
                  value={form.teamContribution}
                  onChange={(v) => setForm({ ...form, teamContribution: v })}
                  placeholder="How did you contribute to your team?"
                />
                <div className="flex items-center gap-2 pt-2">
                  <Button variant="outline" onClick={() => submit('SAVE_DRAFT')} disabled={saving}>
                    <Save className="w-4 h-4" /> Save Draft
                  </Button>
                  {canSubmitSelf && (
                    <Button onClick={() => submit('SUBMIT_SELF')} disabled={saving}>
                      <Send className="w-4 h-4" /> Submit to Manager
                    </Button>
                  )}
                  {message && <span className="text-sm text-slate-700 font-medium ml-2">{message}</span>}
                </div>
              </>
            ) : (
              <ReadOnlyView
                rows={[
                  ['Rating', review.selfRating != null ? `${review.selfRating}/5` : '—'],
                  ['Achievements', review.achievements],
                  ['Learnings', review.learnings],
                  ['Team Contribution', review.teamContribution],
                ]}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── TIME & WORK SECTION ─── Auto-computed from attendance + goals. */}
      {/* Visibility mirrors the manager section: manager + HR always; employee/exec after HR_FINALIZED. */}
      {(permissions.isMyTeamMember || permissions.isHR ||
        ((permissions.isOwn || !!permissions.isExec) && isFinalized)) && (
        <TimeWorkCard review={review} />
      )}

      {/* ─── MANAGER REVIEW SECTION ─── Confidential to employee until HR_FINALIZED */}
      {canSeeManager && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="w-6 h-6 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              Manager Review
              {review.managerRating != null && <Badge variant="default">{review.managerRating}/5</Badge>}
              {review.behavioralAvg != null && <Badge variant="secondary">Behavioral: {review.behavioralAvg}/5</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {showManagerForm ? (
              <>
                {/* Goals — manager reviews employee's self-rated achievements */}
                {goalsForm.length > 0 && (
                  <div className="bg-slate-50/40 border border-slate-100 rounded-lg p-3 space-y-3">
                    <p className="text-sm font-semibold text-slate-900">📌 Review each goal</p>
                    {goalsForm.map((g) => (
                      <GoalEditor
                        key={g.id}
                        goal={g}
                        mode="manager"
                        onChange={(field, value) => updateGoal(g.id, field, value)}
                      />
                    ))}
                    <p className="text-xs text-slate-700">
                      The <strong>Individual Score</strong> below auto-calculates from the weighted average of achievement % across goals.
                    </p>
                  </div>
                )}

                <FormSelect
                  label="Overall Manager Rating"
                  value={form.managerRating}
                  onChange={(v) => setForm({ ...form, managerRating: v })}
                  options={RATING_OPTIONS}
                />

                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Behavioral Competencies (1–5)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormSelect label="Teamwork"      value={form.teamworkScore}      onChange={(v) => setForm({ ...form, teamworkScore: v })}      options={RATING_OPTIONS} compact />
                    <FormSelect label="Ownership"     value={form.ownershipScore}     onChange={(v) => setForm({ ...form, ownershipScore: v })}     options={RATING_OPTIONS} compact />
                    <FormSelect label="Communication" value={form.communicationScore} onChange={(v) => setForm({ ...form, communicationScore: v })} options={RATING_OPTIONS} compact />
                    <FormSelect label="Reliability"   value={form.reliabilityScore}   onChange={(v) => setForm({ ...form, reliabilityScore: v })}   options={RATING_OPTIONS} compact />
                    <FormSelect label="Initiative"    value={form.initiativeScore}    onChange={(v) => setForm({ ...form, initiativeScore: v })}    options={RATING_OPTIONS} compact />
                    <FormSelect label="Adaptability"  value={form.adaptabilityScore}  onChange={(v) => setForm({ ...form, adaptabilityScore: v })}  options={RATING_OPTIONS} compact />
                  </div>
                </div>

                <div>
                  <FormSelect label="Team Goals Score" value={form.teamScore} onChange={(v) => setForm({ ...form, teamScore: v })} options={RATING_OPTIONS} compact />
                  {review.individualScore != null && (
                    <p className="text-xs text-gray-600 mt-2">
                      📊 Individual Score auto-computed: <strong>{review.individualScore}/5</strong> (from goal achievements)
                    </p>
                  )}
                </div>

                <FormTextarea
                  label="Manager Feedback"
                  value={form.managerFeedback}
                  onChange={(v) => setForm({ ...form, managerFeedback: v })}
                  placeholder="Strengths, areas for improvement, recommendations…"
                />

                <div className="flex items-center gap-2 pt-2">
                  <Button variant="outline" onClick={() => submit('SAVE_DRAFT')} disabled={saving}>
                    <Save className="w-4 h-4" /> Save Draft
                  </Button>
                  {canSubmitMgr && (
                    <Button onClick={() => submit('SUBMIT_MANAGER')} disabled={saving}>
                      <Send className="w-4 h-4" /> Submit to HR
                    </Button>
                  )}
                  {message && <span className="text-sm text-slate-700 font-medium ml-2">{message}</span>}
                </div>
              </>
            ) : (
              <ReadOnlyView
                rows={[
                  ['Manager Rating', review.managerRating != null ? `${review.managerRating}/5` : '—'],
                  ['Teamwork', review.teamworkScore != null ? `${review.teamworkScore}/5` : '—'],
                  ['Ownership', review.ownershipScore != null ? `${review.ownershipScore}/5` : '—'],
                  ['Communication', review.communicationScore != null ? `${review.communicationScore}/5` : '—'],
                  ['Reliability', review.reliabilityScore != null ? `${review.reliabilityScore}/5` : '—'],
                  ['Initiative', review.initiativeScore != null ? `${review.initiativeScore}/5` : '—'],
                  ['Adaptability', review.adaptabilityScore != null ? `${review.adaptabilityScore}/5` : '—'],
                  ['Behavioral Avg', review.behavioralAvg != null ? `${review.behavioralAvg}/5` : '—'],
                  ['Individual Score', review.individualScore != null ? `${review.individualScore}/5` : '—'],
                  ['Team Score', review.teamScore != null ? `${review.teamScore}/5` : '—'],
                  ['Feedback', review.managerFeedback],
                ]}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── HR FINALIZATION SECTION ─── Confidential until HR_FINALIZED for everyone except HR */}
      {canSeeHR && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="w-6 h-6 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              HR Finalization
              {review.overallRating != null && <Badge variant="success">Overall: {review.overallRating}/5</Badge>}
              {review.finalCategory && (
                <Badge variant={CATEGORY_OPTIONS.find(o => o.value === review.finalCategory)?.variant ?? 'secondary'}>
                  {CATEGORY_OPTIONS.find(o => o.value === review.finalCategory)?.label ?? review.finalCategory}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {showHRForm ? (
              <>
                {suggestedOverall != null && (
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 flex items-start gap-3">
                    <Sparkles className="w-4 h-4 text-slate-700 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900">
                        Suggested Overall (based on 60% work + 20% time + 20% behavioral):{' '}
                        <strong>{suggestedOverall.toFixed(1)}/5</strong>
                      </p>
                      <p className="text-xs text-slate-700 mt-0.5">
                        HR can override — this is a starting point computed from the data above.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setForm({ ...form, overallRating: String(Math.round(suggestedOverall)) })}
                    >
                      Use Suggestion
                    </Button>
                  </div>
                )}
                <FormSelect
                  label="Overall Rating"
                  value={form.overallRating}
                  onChange={(v) => setForm({ ...form, overallRating: v })}
                  options={RATING_OPTIONS}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Final Category</label>
                  <Select value={form.finalCategory} onValueChange={(v) => setForm({ ...form, finalCategory: v })}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button onClick={() => submit('FINALIZE')} disabled={saving}>
                    <CheckCircle2 className="w-4 h-4" /> Finalize Review
                  </Button>
                  {message && <span className="text-sm text-slate-700 font-medium ml-2">{message}</span>}
                </div>
              </>
            ) : (
              <ReadOnlyView
                rows={[
                  ['Overall Rating', review.overallRating != null ? `${review.overallRating}/5` : '—'],
                  ['Final Category', review.finalCategory ?? '—'],
                ]}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Small helpers ───────────────────────────────────────────────────────────

function FormSelect({
  label, value, onChange, options, compact,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: number; label: string }[]
  compact?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={compact ? 'h-9' : ''}><SelectValue placeholder="Select" /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function FormTextarea({
  label, value, onChange, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-slate-700"
      />
    </div>
  )
}

function GoalEditor({
  goal, mode, onChange,
}: {
  goal: ReviewGoal
  mode: 'self' | 'manager' | 'view'
  onChange: (field: keyof ReviewGoal, value: string | number | null) => void
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{goal.description}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {goal.kpi && <>KPI: {goal.kpi} · </>}
            {goal.target && <>Target: {goal.target} · </>}
            Weight: <strong>{goal.weight}%</strong>
          </p>
        </div>
      </div>

      {/* Achievement % */}
      <div className="flex items-center gap-3 pt-1">
        <label className="text-xs text-gray-700 flex-shrink-0">Achievement</label>
        {mode === 'view' ? (
          <span className="text-sm font-semibold text-gray-900">{goal.achievement ?? 0}%</span>
        ) : (
          <>
            <input
              type="range"
              min={0} max={100} step={5}
              value={goal.achievement ?? 0}
              onChange={(e) => onChange('achievement', Number(e.target.value))}
              className="flex-1 accent-slate-700"
            />
            <span className="text-sm font-semibold text-gray-900 w-12 text-right">{goal.achievement ?? 0}%</span>
          </>
        )}
      </div>

      {/* Self comment (employee mode) */}
      {mode === 'self' && (
        <div>
          <label className="text-xs text-gray-600">Your comment</label>
          <textarea
            rows={2}
            value={goal.selfComment ?? ''}
            onChange={(e) => onChange('selfComment', e.target.value)}
            placeholder="How did this goal go? Evidence, blockers, learnings…"
            className="w-full text-sm border border-gray-200 rounded p-2 focus:outline-none focus:ring-2 focus:ring-slate-100"
          />
        </div>
      )}

      {/* Manager comment (manager mode) — and shows employee's self-comment for context */}
      {mode === 'manager' && (
        <>
          {goal.selfComment && (
            <div className="bg-slate-50 border border-slate-100 rounded p-2 text-xs">
              <span className="font-semibold text-slate-700">Employee said:</span>{' '}
              <span className="text-slate-900">{goal.selfComment}</span>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-600">Your assessment</label>
            <textarea
              rows={2}
              value={goal.managerComment ?? ''}
              onChange={(e) => onChange('managerComment', e.target.value)}
              placeholder="Feedback on this goal…"
              className="w-full text-sm border border-gray-200 rounded p-2 focus:outline-none focus:ring-2 focus:ring-slate-100"
            />
          </div>
        </>
      )}

      {/* View mode shows both comments */}
      {mode === 'view' && (
        <>
          {goal.selfComment && (
            <div className="text-xs">
              <span className="font-semibold text-gray-500">Employee:</span>{' '}
              <span className="text-gray-800">{goal.selfComment}</span>
            </div>
          )}
          {goal.managerComment && (
            <div className="text-xs">
              <span className="font-semibold text-slate-700">Manager:</span>{' '}
              <span className="text-gray-800">{goal.managerComment}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Time & Work auto-metrics card ─────────────────────────────────────────
// Pulls work + time numbers computed server-side from Attendance + Goals.
// Shows a skeleton if all metrics are null (legacy review with no window).
function TimeWorkCard({ review }: { review: Review }) {
  const noMetrics =
    review.daysWorked == null &&
    review.daysAbsent == null &&
    review.lateArrivalCount == null &&
    review.timeScore == null

  // Goal achievement % — average across linked goals
  const goalAchPct =
    review.goals && review.goals.length > 0
      ? Math.round(
          review.goals.reduce((sum, g) => sum + (g.achievement ?? 0), 0) /
            review.goals.length,
        )
      : null

  const ts = review.timeScore
  const scoreColor: 'secondary' | 'success' | 'default' | 'warning' =
    ts == null
      ? 'secondary'
      : ts >= 4
        ? 'success'
        : ts >= 3
          ? 'default'
          : 'warning'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="w-4 h-4 text-slate-700" />
          Time &amp; Work
          {ts != null && (
            <Badge variant={scoreColor}>Score: {ts.toFixed(1)}/5</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {noMetrics ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
            Computing… (metrics unavailable for this review cycle)
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Work delivered */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Work delivered
                </p>
                <div className="space-y-2">
                  <StatTile
                    label="Goals Achieved (weighted)"
                    value={
                      review.individualScore != null
                        ? `${review.individualScore.toFixed(1)} / 5`
                        : '—'
                    }
                  />
                  <StatTile
                    label="Goals On-Time"
                    value={
                      review.goalsOnTime != null && review.goalsLate != null
                        ? `${review.goalsOnTime} of ${review.goalsOnTime + review.goalsLate}`
                        : '—'
                    }
                  />
                  <StatTile
                    label="Goal Achievement %"
                    value={goalAchPct != null ? `${goalAchPct}%` : '—'}
                  />
                </div>
              </div>

              {/* Time investment */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Time investment
                </p>
                <div className="space-y-2">
                  <StatTile label="Days Worked" value={review.daysWorked ?? '—'} />
                  <StatTile
                    label="Absent"
                    value={review.daysAbsent ?? '—'}
                    tone={
                      review.daysAbsent != null && review.daysAbsent > 5
                        ? 'red'
                        : undefined
                    }
                  />
                  <StatTile label="On Leave" value={review.daysOnLeave ?? '—'} />
                  <StatTile
                    label="Late Arrivals"
                    value={review.lateArrivalCount ?? '—'}
                    tone={
                      review.lateArrivalCount != null && review.lateArrivalCount > 3
                        ? 'amber'
                        : undefined
                    }
                  />
                  <StatTile
                    label="Avg Hours/Day"
                    value={
                      review.avgHoursPerDay != null
                        ? review.avgHoursPerDay.toFixed(1)
                        : '—'
                    }
                  />
                </div>
              </div>
            </div>

            {/* Big score footer */}
            {ts != null && (
              <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Time &amp; Work Score</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Attendance · Punctuality · On-time delivery
                  </p>
                </div>
                <div
                  className={`px-4 py-2 rounded-lg text-lg font-bold ${
                    ts >= 4
                      ? 'bg-slate-50 text-slate-700 border border-slate-100'
                      : ts >= 3
                        ? 'bg-gray-50 text-gray-800 border border-gray-200'
                        : 'bg-slate-50 text-slate-900 border border-slate-100'
                  }`}
                >
                  {ts.toFixed(1)} / 5
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: 'red' | 'amber'
}) {
  const valueColor =
    tone === 'red'
      ? 'text-slate-700'
      : tone === 'amber'
        ? 'text-slate-700'
        : 'text-gray-900'
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-semibold ${valueColor}`}>{value}</span>
    </div>
  )
}

function ReadOnlyView({ rows }: { rows: [string, string | number | null | undefined][] }) {
  return (
    <dl className="space-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-3">
          <dt className="text-gray-500 w-44 flex-shrink-0">{label}</dt>
          <dd className="text-gray-900 flex-1 whitespace-pre-wrap">{value || <span className="text-gray-400">—</span>}</dd>
        </div>
      ))}
    </dl>
  )
}
