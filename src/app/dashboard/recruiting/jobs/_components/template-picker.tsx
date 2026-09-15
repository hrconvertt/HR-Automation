'use client'

/**
 * "Relevant job templates" — Workable's picker, filled with Convertt's own
 * past job descriptions. Pick a job on the left, tick the lines worth keeping
 * on the right, and Add selection appends them to the boxes.
 */

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SECTION_LABELS, splitJdIntoSections, type JdSections, type SectionKey } from '@/lib/job-post'
import type { JobTemplate } from './types'

const ORDER: SectionKey[] = ['summary', 'responsibilities', 'requirements', 'niceToHave', 'benefits']

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: JobTemplate[]
  jobTitle: string
  onImport: (picked: JdSections) => void
}

function linesOf(parts: JdSections, k: SectionKey): string[] {
  return k === 'summary' ? parts.summary.split('\n').filter(Boolean) : parts[k]
}

export function TemplatePicker({ open, onOpenChange, templates, jobTitle, onImport }: Props) {
  const [q, setQ] = useState('')
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const needle = q.trim().toLowerCase()
  const list = templates.filter((t) => !needle || t.title.toLowerCase().includes(needle))
  const title = jobTitle.trim().toLowerCase()
  const closest = title
    ? templates.find((t) => t.title.toLowerCase() === title)
      ?? templates.find((t) => t.title.toLowerCase().includes(title) || title.includes(t.title.toLowerCase()))
    : undefined
  const current = templates.find((t) => t.id === chosenId) ?? closest ?? list[0] ?? null
  const parts = useMemo(() => (current ? splitJdIntoSections(current.jdContent) : null), [current])

  function choose(id: string) {
    setChosenId(id)
    setPicked(new Set())
  }

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAll(k: SectionKey, lines: string[]) {
    setPicked((prev) => {
      const next = new Set(prev)
      lines.forEach((_, i) => next.add(`${k}:${i}`))
      return next
    })
  }

  function add() {
    if (!parts) return
    const out: JdSections = { summary: '', responsibilities: [], requirements: [], niceToHave: [], benefits: [] }
    for (const k of ORDER) {
      const chosen = linesOf(parts, k).filter((_, i) => picked.has(`${k}:${i}`))
      if (k === 'summary') out.summary = chosen.join('\n')
      else out[k] = chosen
    }
    onImport(out)
    setPicked(new Set())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Past job posts{current ? `: ${current.title}` : ''}</DialogTitle>
        </DialogHeader>

        {templates.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No past job descriptions yet. Once jobs have been written here, their sections can be imported.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)] max-h-[65vh]">
            <div className="flex flex-col min-h-0 border-slate-100 md:border-r md:pr-4">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search past jobs"
                aria-label="Search past jobs"
                className="h-9 rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
              <div className="mt-2 overflow-y-auto space-y-0.5" role="radiogroup" aria-label="Past jobs">
                {list.map((t) => (
                  <label key={t.id} className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 cursor-pointer">
                    <input type="radio" name="template" checked={current?.id === t.id} onChange={() => choose(t.id)} className="mt-1" />
                    <span className="min-w-0">
                      <span className="block text-slate-800">{t.title}</span>
                      {t.department && <span className="block text-[11px] text-slate-400">{t.department}</span>}
                    </span>
                  </label>
                ))}
                {list.length === 0 && <p className="px-2 py-3 text-xs text-slate-400">No past job matches.</p>}
              </div>
            </div>

            <div className="overflow-y-auto pr-1 space-y-5">
              {parts && ORDER.map((k) => {
                const lines = linesOf(parts, k)
                if (lines.length === 0) return null
                return (
                  <div key={k}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{SECTION_LABELS[k]}</p>
                      <button type="button" onClick={() => selectAll(k, lines)}
                        className="text-xs text-slate-500 hover:text-slate-900 underline underline-offset-2">
                        Select all {SECTION_LABELS[k].toLowerCase()}
                      </button>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {lines.map((line, i) => (
                        <label key={`${k}:${i}`} className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                          <input type="checkbox" checked={picked.has(`${k}:${i}`)} onChange={() => toggle(`${k}:${i}`)} className="mt-1" />
                          <span>{line}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
              {parts && ORDER.every((k) => linesOf(parts, k).length === 0) && (
                <p className="text-sm text-slate-500">This job description has no sections that can be imported.</p>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
          <span className="text-xs text-slate-500">{picked.size} selected</span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={add} disabled={picked.size === 0}>Add selection</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
