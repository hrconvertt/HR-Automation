/**
 * Taking a journey — Workday's layout.
 *
 * Left, the step you are on: its picture, title, due date and length, what
 * it says, the thing to open, and Complete Step. Right, the journey: a
 * progress line to the pin with how many required steps remain, then each
 * module with its steps, done ones ticked, optional ones folded away under
 * "Show optional steps". A module of only recommended steps opens as a page
 * of step cards, the way Workday shows "First Week".
 *
 * Used live (by the person) and as the studio's preview, where nothing is
 * recorded.
 */
import Link from 'next/link'
import { renderMarkdown } from '@/lib/markdown'
import { stepTypeOf } from '@/lib/experience'
import type { ProgressModule, ProgressStep } from '@/lib/experience-server'
import { StepArt } from './step-art'
import { CompleteStepButton, ViewPing } from './step-controls'

const DAY = 86_400_000

export function dueBadge(due: Date | null, now: Date): { text: string; tone: string } | null {
  if (!due) return null
  const days = Math.ceil((due.getTime() - now.getTime()) / DAY)
  if (days < 0) return { text: `OVERDUE ${Math.abs(days)} ${Math.abs(days) === 1 ? 'DAY' : 'DAYS'}`, tone: 'bg-red-50 text-red-800' }
  if (days === 0) return { text: 'DUE TODAY', tone: 'bg-amber-100 text-amber-900' }
  if (days <= 14) return { text: `DUE IN ${days} ${days === 1 ? 'DAY' : 'DAYS'}`, tone: 'bg-amber-100 text-amber-900' }
  return { text: `DUE ${due.toLocaleDateString('en-GB')}`, tone: 'bg-slate-100 text-slate-700' }
}

export type PlayerView =
  | { kind: 'step'; step: ProgressStep }
  | { kind: 'module'; module: ProgressModule }
  | { kind: 'done' }

export function JourneyPlayer({ title, tone, modules, view, remaining, pct, hrefFor, moduleHref, assignmentId, programHref, now }: {
  title: string
  tone: string
  modules: ProgressModule[]
  view: PlayerView
  remaining: number
  pct: number
  hrefFor: (stepId: string) => string
  moduleHref: (moduleId: string) => string
  /** Null in the studio preview — nothing is recorded. */
  assignmentId: string | null
  programHref: (programId: string) => string
  now: Date
}) {
  const allSteps = modules.flatMap((m) => m.steps)

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px] items-start">
      {/* ── The step, or the module overview ───────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {view.kind === 'done' && (
          <div className="p-8 text-center">
            <StepArt type="TASK" tone={tone} />
            <h2 className="text-2xl font-bold text-slate-900 mt-6">You finished {title}</h2>
            <p className="text-sm text-slate-600 mt-2">Every required step is done. The recommended ones stay here whenever you want them.</p>
          </div>
        )}

        {view.kind === 'module' && (
          <div>
            <StepArt type={view.module.steps[0]?.type ?? 'TEXT'} tone={tone} />
            <div className="p-6 lg:p-8">
              <h2 className="text-3xl font-bold text-slate-900">{view.module.title}</h2>
              <p className="text-sm text-slate-500 mt-1">
                {view.module.steps.length} {view.module.steps.every((s) => !s.required) ? 'recommended' : ''} {view.module.steps.length === 1 ? 'step' : 'steps'}
                {view.module.minutes ? ` · ${view.module.minutes} minutes to complete` : ''}
              </p>
              {view.module.description && <p className="text-base text-slate-700 mt-4 leading-relaxed">{view.module.description}</p>}
              <h3 className="text-base font-semibold text-slate-900 mt-6 mb-3">
                {view.module.steps.every((s) => !s.required) ? 'Recommended steps' : 'Steps'}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {view.module.steps.map((s) => (
                  <Link key={s.id} href={hrefFor(s.id)} className="group border border-slate-200 rounded-xl overflow-hidden hover:shadow-md bg-white">
                    <div className="h-24"><StepArt type={s.type} tone={tone} /></div>
                    <div className="p-3">
                      <p className="text-sm font-semibold text-slate-900 group-hover:underline">{s.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {stepTypeOf(s.type).label}{s.completedAt ? ' · Done ✓' : ''}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {view.kind === 'step' && (() => {
          const s = view.step
          const due = s.completedAt ? null : dueBadge(s.due, now)
          const idx = allSteps.findIndex((x) => x.id === s.id)
          const nextStep = allSteps.slice(idx + 1).find((x) => !x.completedAt) ?? null
          const verb = stepTypeOf(s.type).verb
          const target = s.type === 'LEARNING' && s.programId ? programHref(s.programId) : s.url
          const external = !!target && /^https?:\/\//i.test(target)
          return (
            <div>
              {assignmentId && <ViewPing assignmentId={assignmentId} stepId={s.id} />}
              <StepArt type={s.type} tone={tone} />
              <div className="p-6 lg:p-8">
                <h2 className="text-3xl font-bold text-slate-900 leading-tight">{s.title}</h2>
                <div className="flex items-center gap-3 flex-wrap mt-3 text-sm text-slate-600">
                  {due && <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${due.tone}`}>{due.text}</span>}
                  <span>
                    {s.required ? 'Required' : 'Recommended'} {stepTypeOf(s.type).label.toLowerCase()}
                    {s.minutes ? ` – ${s.minutes} minutes` : ''}
                  </span>
                </div>
                {s.body && (
                  <div className="prose prose-slate max-w-none mt-5 prose-p:leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(s.body) }} />
                )}
                <div className="flex items-center justify-between gap-4 flex-wrap mt-8 pt-5 border-t border-slate-100">
                  {verb && target ? (
                    <a href={target} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}
                      className="text-base font-semibold text-blue-700 underline underline-offset-4">
                      {verb} ›
                    </a>
                  ) : <span />}
                  {assignmentId ? (
                    <CompleteStepButton assignmentId={assignmentId} stepId={s.id} done={!!s.completedAt}
                      nextHref={nextStep ? hrefFor(nextStep.id) : null} />
                  ) : (
                    <span className="text-sm text-slate-400">Preview — Complete step appears for the person taking it</span>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </section>

      {/* ── The journey down the right ──────────────────────────────────── */}
      <aside className="space-y-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
          <div className="relative mt-4 mb-2 h-6" role="img" aria-label={`${pct}% of required steps complete`}>
            <div className="absolute top-1/2 -translate-y-1/2 left-0 right-4 h-1 rounded bg-slate-200" />
            <div className="absolute top-1/2 -translate-y-1/2 left-0 h-1 rounded bg-blue-600" style={{ width: `calc((100% - 1rem) * ${pct / 100})` }} />
            <span className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow"
              style={{ left: `calc((100% - 1rem) * ${pct / 100} - 6px)` }} />
            <svg className="absolute right-0 top-0 w-5 h-6 text-slate-900" viewBox="0 0 20 24" fill="currentColor" aria-hidden="true">
              <path d="M10 0C4.5 0 0 4.3 0 9.6 0 16.8 10 24 10 24s10-7.2 10-14.4C20 4.3 15.5 0 10 0zm0 13a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" />
            </svg>
          </div>
          <p className="text-sm text-slate-600">
            {remaining === 0 ? 'All required steps done' : `${remaining} required ${remaining === 1 ? 'step' : 'steps'} remaining`}
          </p>
        </div>

        {modules.map((m) => {
          const req = m.steps.filter((s) => s.required)
          const opt = m.steps.filter((s) => !s.required)
          const moduleDone = req.length > 0 && req.every((s) => s.completedAt)
          const onlyOptional = req.length === 0
          const activeModule = view.kind === 'module' && view.module.id === m.id
          const containsCurrent = view.kind === 'step' && m.steps.some((s) => s.id === view.step.id)
          const pendingReq = req.filter((s) => !s.completedAt).length
          return (
            <div key={m.id} className={`bg-white border rounded-2xl shadow-sm overflow-hidden ${activeModule ? 'border-blue-600' : 'border-slate-200'}`}>
              <Link href={moduleHref(m.id)} className={`flex items-start justify-between gap-3 px-5 py-4 ${activeModule ? 'border-l-4 border-blue-600' : ''}`}>
                <span>
                  <span className="block text-lg font-semibold text-slate-900">{m.title}</span>
                  <span className="block text-sm text-slate-500">
                    {moduleDone ? 'Completed' : onlyOptional ? 'Recommended module' : m.minutes ? `${m.minutes} minutes to complete` : `${req.length} required ${req.length === 1 ? 'step' : 'steps'}`}
                  </span>
                </span>
                {moduleDone ? (
                  <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm" aria-label="Completed">✓</span>
                ) : pendingReq > 0 && !containsCurrent ? (
                  <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center" aria-label={`${pendingReq} to do`}>{pendingReq}</span>
                ) : null}
              </Link>

              {(containsCurrent || (!moduleDone && !onlyOptional)) && req.length > 0 && (
                <ul className="border-t border-slate-100">
                  {req.map((s) => <StepRow key={s.id} step={s} href={hrefFor(s.id)} tone="" active={view.kind === 'step' && view.step.id === s.id} now={now} />)}
                </ul>
              )}
              {opt.length > 0 && !onlyOptional && (
                <details className="border-t border-slate-100 group" open={view.kind === 'step' && opt.some((s) => s.id === view.step.id)}>
                  <summary className="px-5 py-2.5 text-sm font-medium text-blue-700 underline underline-offset-2 cursor-pointer list-none">
                    <span className="group-open:hidden">Show optional steps ({opt.length})</span>
                    <span className="hidden group-open:inline">Hide optional steps</span>
                  </summary>
                  <ul>
                    {opt.map((s) => <StepRow key={s.id} step={s} href={hrefFor(s.id)} tone="" active={view.kind === 'step' && view.step.id === s.id} now={now} />)}
                  </ul>
                </details>
              )}
            </div>
          )
        })}
      </aside>
    </div>
  )
}

function StepRow({ step, href, active, now }: { step: ProgressStep; href: string; tone: string; active: boolean; now: Date }) {
  const due = step.completedAt ? null : dueBadge(step.due, now)
  return (
    <li>
      <Link href={href} className={`flex items-center gap-3 px-5 py-3 hover:bg-slate-50 ${active ? 'border-l-4 border-blue-600 bg-blue-50/40' : 'border-l-4 border-transparent'}`}>
        <span className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${step.completedAt ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {step.completedAt ? '✓' : stepTypeOf(step.type).label.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className={`block text-sm font-semibold truncate ${step.completedAt ? 'text-slate-500' : 'text-slate-900'}`}>{step.title}</span>
          {due ? (
            <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 ${due.tone}`}>{due.text}</span>
          ) : (
            <span className="block text-xs text-slate-500">{step.completedAt ? 'Done' : step.required ? 'Required' : 'Optional'}</span>
          )}
        </span>
      </Link>
    </li>
  )
}
