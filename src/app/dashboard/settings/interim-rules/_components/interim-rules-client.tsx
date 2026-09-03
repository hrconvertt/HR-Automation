'use client'

/**
 * The interim rules, with the switch where there is one.
 *
 * Each card states four things in the same order every time: what happens now,
 * why, what replaces it, and where it lives. The last one is for whoever
 * eventually removes it — a rule you cannot find is a rule you cannot retire.
 *
 * Rules that cannot be switched say so rather than showing a control that
 * would do nothing.
 */
import { useState } from 'react'
import { INTERIM_RULES, type InterimRule } from '@/lib/interim-rules'

export function InterimRulesClient({
  initialFlags, canEdit,
}: {
  initialFlags: Record<string, boolean>
  canEdit: boolean
}) {
  const [flags, setFlags] = useState(initialFlags)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function toggle(rule: InterimRule) {
    if (!rule.configKey || !canEdit) return
    const next = !(flags[rule.configKey] ?? true)
    setBusy(rule.configKey); setMsg('')
    try {
      const res = await fetch('/api/interim-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: rule.configKey, enabled: next }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(d.error ?? 'Could not save.'); return }
      setFlags(d.flags)
      setMsg(next ? `“${rule.title}” is on again.` : `“${rule.title}” is off.`)
    } finally { setBusy(null) }
  }

  const switchable = INTERIM_RULES.filter((r) => r.configKey)
  const on = switchable.filter((r) => flags[r.configKey as string] ?? true).length

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
        <p className="text-sm text-slate-700">
          Of 44 accounts, <strong className="text-slate-900">37 have never logged in</strong>,
          and the seven that have were last seen in mid-June. Everything below exists because
          of that. None of it is the design — each one has a direction to be reversed in, and
          the ones with a switch can be reversed here.
        </p>
        <p className="text-[11px] text-slate-500 mt-2">
          {on} of {switchable.length} switchable rules are on · {INTERIM_RULES.length - switchable.length} more
          are practices or missing credentials and have nothing to toggle
        </p>
      </div>

      {msg && (
        <div className="bg-slate-900 text-white rounded-xl px-4 py-2.5 text-sm">{msg}</div>
      )}

      {INTERIM_RULES.map((rule, i) => {
        const enabled = rule.configKey ? flags[rule.configKey] ?? true : null
        return (
          <div key={rule.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-900">
                  <span className="text-slate-400 tabular-nums mr-2">{i + 1}</span>
                  {rule.title}
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{rule.where}</p>
              </div>
              <div className="flex-shrink-0">
                {rule.configKey ? (
                  <button
                    type="button"
                    disabled={!canEdit || busy === rule.configKey}
                    onClick={() => toggle(rule)}
                    className={`text-[13px] px-3 py-1.5 rounded-lg border whitespace-nowrap disabled:opacity-40 ${
                      enabled
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-300'
                    }`}
                  >
                    {busy === rule.configKey ? '…' : enabled ? 'On — click to disable' : 'Off — click to enable'}
                  </button>
                ) : (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border bg-slate-50 text-slate-500 border-slate-200 whitespace-nowrap">
                    {rule.status === 'CREDENTIAL' ? 'Missing credential' : 'No switch'}
                  </span>
                )}
              </div>
            </div>

            <dl className="px-4 py-3 space-y-2.5 text-[13px]">
              <Line term="Now" value={rule.now} />
              <Line term="Because" value={rule.because} />
              <Line term="Then" value={rule.then} strong />
              {rule.whenOff && enabled === false && (
                <Line term="Currently" value={rule.whenOff} />
              )}
              {rule.whenOff && enabled && (
                <Line term="If switched off" value={rule.whenOff} muted />
              )}
            </dl>
          </div>
        )
      })}
    </div>
  )
}

function Line({ term, value, strong, muted }: {
  term: string; value: string; strong?: boolean; muted?: boolean
}) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3">
      <dt className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold pt-0.5">
        {term}
      </dt>
      <dd className={
        strong ? 'text-slate-900 font-medium'
          : muted ? 'text-slate-400'
            : 'text-slate-600'
      }>
        {value}
      </dd>
    </div>
  )
}
