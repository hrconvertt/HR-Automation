'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  ArrowLeft, BookOpen, ListChecks, Plus, Trash2, Loader2, Save, Pencil,
  CheckCircle2, XCircle, GraduationCap,
} from 'lucide-react'
import { PROGRAM_TYPE_LABELS, type Lesson, type QuizQuestion } from '@/lib/learning'

interface Program {
  id: string; title: string; type: string; description: string | null
  provider: string | null; duration: number | null; passingScore: number
  lessons: Lesson[]; quiz: QuizQuestion[]
}
interface MyRecord { status: string; score: number | null }

const inputCls = 'w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400'

export function ProgramDetailClient({ isHR, program, myRecord }: {
  isHR: boolean; program: Program; myRecord: MyRecord | null
}) {
  const [building, setBuilding] = useState(false)
  const typeLabel = PROGRAM_TYPE_LABELS[program.type as keyof typeof PROGRAM_TYPE_LABELS] ?? program.type

  return (
    <div className="space-y-5">
      <Link href="/dashboard/learning" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> All programs
      </Link>

      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="rounded-xl bg-white/15 p-3 backdrop-blur"><GraduationCap className="w-6 h-6" /></div>
            <div className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-white/15 rounded px-1.5 py-0.5">{typeLabel}</span>
              <h1 className="text-2xl font-bold tracking-tight mt-1">{program.title}</h1>
              {program.description && <p className="text-white/85 text-sm mt-1">{program.description}</p>}
              <p className="text-white/60 text-xs mt-2">
                {program.lessons.length} lesson{program.lessons.length === 1 ? '' : 's'} · {program.quiz.length} quiz question{program.quiz.length === 1 ? '' : 's'} · pass mark {program.passingScore}%
              </p>
            </div>
          </div>
          {isHR && (
            <Button variant="secondary" size="sm" className="flex-shrink-0 gap-1.5" onClick={() => setBuilding((b) => !b)}>
              <Pencil className="w-3.5 h-3.5" /> {building ? 'Preview' : 'Build content'}
            </Button>
          )}
        </div>
      </div>

      {building
        ? <BuildMode program={program} onDone={() => setBuilding(false)} />
        : <ViewMode program={program} myRecord={myRecord} isHR={isHR} onBuild={() => setBuilding(true)} />}
    </div>
  )
}

/* ─── Learner view: read lessons, then take the quiz ─────────────────────── */
function ViewMode({ program, myRecord, isHR, onBuild }: {
  program: Program; myRecord: MyRecord | null; isHR: boolean; onBuild: () => void
}) {
  const router = useRouter()
  const [answers, setAnswers] = useState<number[]>(() => program.quiz.map(() => -1))
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ pct: number; correct: number; total: number; passed: boolean } | null>(null)
  const [err, setErr] = useState('')

  const empty = program.lessons.length === 0 && program.quiz.length === 0

  async function submit() {
    if (answers.some((a) => a < 0)) { setErr('Answer every question before submitting.'); return }
    setErr(''); setSubmitting(true)
    try {
      const res = await fetch(`/api/learning/programs/${program.id}/attempt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? 'Could not submit.'); return }
      setResult({ pct: data.pct, correct: data.correct, total: data.total, passed: data.passed })
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  if (empty) {
    return (
      <Card className="rounded-2xl border-slate-200 p-8 text-center">
        <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500">This program has no content yet.</p>
        {isHR && <Button size="sm" className="mt-3 gap-1.5" onClick={onBuild}><Pencil className="w-3.5 h-3.5" /> Build content</Button>}
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {/* Prior completion */}
      {myRecord && (myRecord.status === 'COMPLETED' || myRecord.status === 'FAILED') && !result && (
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${myRecord.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          {myRecord.status === 'COMPLETED'
            ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            : <XCircle className="w-5 h-5 text-amber-600" />}
          <p className="text-sm text-slate-700">
            You {myRecord.status === 'COMPLETED' ? 'completed' : 'attempted'} this program{myRecord.score != null ? ` — score ${myRecord.score}%` : ''}. You can retake the quiz below.
          </p>
        </div>
      )}

      {/* Lessons */}
      {program.lessons.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-slate-500" /> Lessons</h2>
          {program.lessons.map((l, i) => (
            <Card key={i} className="rounded-2xl border-slate-200 p-5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Lesson {i + 1}</p>
              <h3 className="text-base font-semibold text-slate-900 mt-0.5">{l.title}</h3>
              <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap leading-relaxed">{l.body}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Quiz */}
      {program.quiz.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><ListChecks className="w-4 h-4 text-slate-500" /> Quiz</h2>

          {result ? (
            <Card className={`rounded-2xl border p-6 text-center ${result.passed ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
              {result.passed
                ? <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                : <XCircle className="w-10 h-10 text-rose-500 mx-auto" />}
              <p className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">{result.pct}%</p>
              <p className="text-sm text-slate-600">{result.correct} of {result.total} correct · pass mark {program.passingScore}%</p>
              <p className={`text-sm font-semibold mt-1 ${result.passed ? 'text-emerald-700' : 'text-rose-600'}`}>
                {result.passed ? 'Passed — marked complete' : 'Not passed — you can try again'}
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => { setResult(null); setAnswers(program.quiz.map(() => -1)) }}>
                Retake quiz
              </Button>
            </Card>
          ) : (
            <>
              {program.quiz.map((q, qi) => (
                <Card key={qi} className="rounded-2xl border-slate-200 p-5">
                  <p className="text-sm font-medium text-slate-900">{qi + 1}. {q.question}</p>
                  <div className="space-y-2 mt-3">
                    {q.options.map((opt, oi) => (
                      <label key={oi} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer text-sm ${answers[qi] === oi ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <input
                          type="radio"
                          name={`q-${qi}`}
                          checked={answers[qi] === oi}
                          onChange={() => setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)))}
                          className="accent-slate-900"
                        />
                        <span className="text-slate-700">{opt}</span>
                      </label>
                    ))}
                  </div>
                </Card>
              ))}
              {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</p>}
              <Button onClick={submit} disabled={submitting} className="gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
                Submit quiz
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── HR build mode: author lessons + quiz ───────────────────────────────── */
function BuildMode({ program, onDone }: { program: Program; onDone: () => void }) {
  const router = useRouter()
  const [lessons, setLessons] = useState<Lesson[]>(program.lessons)
  const [quiz, setQuiz] = useState<QuizQuestion[]>(program.quiz)
  const [passingScore, setPassingScore] = useState(program.passingScore)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setErr(''); setSaving(true)
    try {
      const res = await fetch(`/api/learning/programs/${program.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessons, quiz, passingScore }),
      })
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'Could not save.'); return }
      router.refresh()
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Lessons */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-slate-500" /> Lessons (teaching)</h2>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLessons((l) => [...l, { title: '', body: '' }])}>
            <Plus className="w-3.5 h-3.5" /> Add lesson
          </Button>
        </div>
        {lessons.length === 0 && <p className="text-sm text-slate-400">No lessons yet. Add the teaching material learners read first.</p>}
        {lessons.map((l, i) => (
          <Card key={i} className="rounded-2xl border-slate-200 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400">Lesson {i + 1}</span>
              <button className="ml-auto text-slate-400 hover:text-red-600" onClick={() => setLessons((prev) => prev.filter((_, x) => x !== i))}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <input className={inputCls} placeholder="Lesson title"
              value={l.title} onChange={(e) => setLessons((prev) => prev.map((x, xi) => (xi === i ? { ...x, title: e.target.value } : x)))} />
            <textarea className={`${inputCls} min-h-[120px]`} placeholder="Teaching content — explain the topic here."
              value={l.body} onChange={(e) => setLessons((prev) => prev.map((x, xi) => (xi === i ? { ...x, body: e.target.value } : x)))} />
          </Card>
        ))}
      </div>

      {/* Quiz */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><ListChecks className="w-4 h-4 text-slate-500" /> Quiz (MCQs)</h2>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setQuiz((q) => [...q, { question: '', options: ['', '', '', ''], correct: 0 }])}>
            <Plus className="w-3.5 h-3.5" /> Add question
          </Button>
        </div>
        {quiz.length === 0 && <p className="text-sm text-slate-400">No questions yet. Add MCQs learners answer after the lessons.</p>}
        {quiz.map((q, qi) => (
          <Card key={qi} className="rounded-2xl border-slate-200 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400">Question {qi + 1}</span>
              <button className="ml-auto text-slate-400 hover:text-red-600" onClick={() => setQuiz((prev) => prev.filter((_, x) => x !== qi))}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <input className={inputCls} placeholder="Question"
              value={q.question} onChange={(e) => setQuiz((prev) => prev.map((x, xi) => (xi === qi ? { ...x, question: e.target.value } : x)))} />
            <p className="text-[11px] text-slate-400">Tick the correct answer.</p>
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input type="radio" name={`correct-${qi}`} checked={q.correct === oi}
                  onChange={() => setQuiz((prev) => prev.map((x, xi) => (xi === qi ? { ...x, correct: oi } : x)))}
                  className="accent-emerald-600" />
                <input className={inputCls} placeholder={`Option ${oi + 1}`}
                  value={opt}
                  onChange={(e) => setQuiz((prev) => prev.map((x, xi) => (xi === qi
                    ? { ...x, options: x.options.map((o, ox) => (ox === oi ? e.target.value : o)) } : x)))} />
              </div>
            ))}
          </Card>
        ))}
      </div>

      {/* Pass mark + save */}
      <Card className="rounded-2xl border-slate-200 p-4 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Pass mark (%)</label>
          <input type="number" min={0} max={100} className={`${inputCls} w-28`}
            value={passingScore} onChange={(e) => setPassingScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
        </div>
        <div className="flex items-center gap-2">
          {err && <span className="text-xs text-red-600">{err}</span>}
          <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save content
          </Button>
        </div>
      </Card>
    </div>
  )
}
