'use client'

/**
 * One report's check-ins: the scheduled ones with their topics, and a record
 * of the ones that happened. Every action is a labelled button.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import type { CheckInRow } from '@/lib/queries/team-insights'
import { inputCls, readError } from './format'

export function CheckInList({ employeeId, checkIns, canManage }: {
  employeeId: string
  checkIns: CheckInRow[]
  canManage: boolean
}) {
  const scheduled = checkIns
    .filter((c) => c.status === 'SCHEDULED')
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
  const past = checkIns.filter((c) => c.status !== 'SCHEDULED')

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-semibold text-slate-900 mb-2">Scheduled · {scheduled.length}</h3>
        {scheduled.length === 0 ? (
          <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl px-4 py-6 text-center">
            Nothing scheduled.
          </p>
        ) : (
          <div className="space-y-3">
            {scheduled.map((c) => (
              <ScheduledCard key={c.id} checkIn={c} employeeId={employeeId} canManage={canManage} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-900 mb-2">Held and cancelled · {past.length}</h3>
        {past.length === 0 ? (
          <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl px-4 py-6 text-center">
            No check-ins on record yet.
          </p>
        ) : (
          <ul className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {past.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <p className="text-sm font-medium text-slate-900">
                  {c.scheduledLabel}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {c.status === 'DONE' ? 'Held' : 'Cancelled'}
                  </span>
                </p>
                {c.topics.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {c.topics.map((t) => (
                      <li key={t.id} className="text-xs text-slate-600">
                        {t.done ? '✓' : '·'} {t.title}
                      </li>
                    ))}
                  </ul>
                )}
                {c.notes && <p className="text-xs text-slate-700 mt-1.5 whitespace-pre-wrap">{c.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ScheduledCard({ checkIn, employeeId, canManage }: {
  checkIn: CheckInRow; employeeId: string; canManage: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [topic, setTopic] = useState('')
  const [notes, setNotes] = useState(checkIn.notes ?? '')
  const [moveTo, setMoveTo] = useState(checkIn.scheduledFor.slice(0, 10))
  const [moving, setMoving] = useState(false)

  async function call(url: string, init: RequestInit, ok: string, fail: string) {
    setBusy(true)
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      if (!res.ok) { toastError(fail, await readError(res)); return false }
      toastSuccess(ok)
      router.refresh()
      return true
    } finally { setBusy(false) }
  }

  const patch = (body: object, ok: string) =>
    call(`/api/talent/check-ins/${checkIn.id}`, { method: 'PATCH', body: JSON.stringify(body) }, ok, 'Could not update the check-in')

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold text-slate-900">
          {checkIn.scheduledLabel}
          {checkIn.overdue && (
            <span className="ml-2 text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              Date has passed
            </span>
          )}
        </p>
        {canManage && (
          <div className="flex items-center gap-2 flex-wrap">
            {moving ? (
              <>
                <input type="date" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1 text-xs" />
                <button type="button" disabled={busy}
                  onClick={async () => { if (await patch({ scheduledFor: moveTo }, 'Check-in moved')) setMoving(false) }}
                  className="text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-900 text-white disabled:opacity-40">
                  Save new date
                </button>
                <button type="button" onClick={() => setMoving(false)}
                  className="text-xs px-2.5 py-1 rounded-lg border border-slate-300">Keep date</button>
              </>
            ) : (
              <button type="button" onClick={() => setMoving(true)}
                className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-50">
                Move date
              </button>
            )}
            <button type="button" disabled={busy}
              onClick={() => patch({ status: 'CANCELLED' }, 'Check-in cancelled')}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40">
              Cancel check-in
            </button>
          </div>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">Topics</p>
          {checkIn.topics.length === 0 ? (
            <p className="text-xs text-slate-400">No topics yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {checkIn.topics.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-800 min-w-0">
                    <input
                      type="checkbox"
                      className="accent-slate-900"
                      checked={t.done}
                      disabled={!canManage || busy}
                      onChange={(e) => call('/api/talent/topics', {
                        method: 'PATCH', body: JSON.stringify({ topicId: t.id, done: e.target.checked }),
                      }, e.target.checked ? 'Topic ticked off' : 'Topic reopened', 'Could not update the topic')}
                    />
                    <span className={`truncate ${t.done ? 'line-through text-slate-400' : ''}`}>{t.title}</span>
                  </label>
                  {canManage && (
                    <button type="button" disabled={busy}
                      onClick={() => call(`/api/talent/topics?topicId=${t.id}`, { method: 'DELETE' },
                        'Topic removed', 'Could not remove the topic')}
                      className="text-xs text-slate-500 hover:text-slate-900 underline flex-shrink-0">
                      Remove topic
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManage && (
            <div className="flex gap-2 mt-2">
              <input className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)}
                placeholder="Add something to discuss" />
              <button type="button" disabled={busy || !topic.trim()}
                onClick={async () => {
                  if (await call('/api/talent/topics', {
                    method: 'POST',
                    body: JSON.stringify({ employeeId, checkInId: checkIn.id, title: topic }),
                  }, 'Topic added', 'Could not add the topic')) setTopic('')
                }}
                className="text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 whitespace-nowrap disabled:opacity-40">
                Add topic
              </button>
            </div>
          )}
        </div>

        {canManage && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
              Notes from the conversation
            </p>
            <textarea className={`${inputCls} min-h-[70px]`} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="What was agreed, what happens next" />
            <div className="flex gap-2 mt-2">
              <button type="button" disabled={busy}
                onClick={() => patch({ status: 'DONE', notes }, 'Check-in recorded as held')}
                className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-40">
                Record as held
              </button>
              <button type="button" disabled={busy}
                onClick={() => patch({ notes }, 'Notes saved')}
                className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40">
                Save notes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
