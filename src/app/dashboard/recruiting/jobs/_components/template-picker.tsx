'use client'

/**
 * "Relevant job templates" — Workable's picker. On the left, Convertt's own
 * past job posts and, below them, job titles from the library that match
 * what is being written; picking a library title has a template written for
 * it on the spot. On the right, tick the lines worth keeping, and Add
 * selection appends them to the boxes.
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toastSuccess } from '@/components/ui/toaster'
import { SECTION_LABELS, splitJdIntoSections, type JdSections, type SectionKey } from '@/lib/job-post'
import { relatedTitles } from '@/lib/job-title-library'
import type { JobTemplate } from './types'

const ORDER: SectionKey[] = ['summary', 'responsibilities', 'requirements', 'niceToHave', 'benefits']

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: JobTemplate[]
  jobTitle: string
  onImport: (picked: JdSections) => void
}

type Choice = { kind: 'past'; id: string } | { kind: 'library'; title: string }
type Written = JdSections | { error: string }

function linesOf(parts: JdSections, k: SectionKey): string[] {
  return k === 'summary' ? parts.summary.split('\n').filter(Boolean) : parts[k]
}

export function TemplatePicker({ open, onOpenChange, templates, jobTitle, onImport }: Props) {
  const [q, setQ] = useState('')
  const [chosen, setChosen] = useState<Choice | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [written, setWritten] = useState<Record<string, Written>>({})
  const inflight = useRef(new Set<string>())

  const needle = q.trim().toLowerCase()
  const past = templates.filter((t) => !needle || t.title.toLowerCase().includes(needle))
  const own = new Set(templates.map((t) => t.title.toLowerCase()))
  const library = relatedTitles(needle || jobTitle, 20).filter((t) => !own.has(t.toLowerCase()))

  const title = jobTitle.trim().toLowerCase()
  const closest = title
    ? templates.find((t) => t.title.toLowerCase() === title)
      ?? templates.find((t) => t.title.toLowerCase().includes(title) || title.includes(t.title.toLowerCase()))
    : undefined
  const current: Choice | null = chosen
    ?? (closest ? { kind: 'past', id: closest.id } : library[0] ? { kind: 'library', title: library[0] } : past[0] ? { kind: 'past', id: past[0].id } : null)

  const currentTitle = current?.kind === 'past' ? templates.find((t) => t.id === current.id)?.title : current?.title
  const libraryResult = current?.kind === 'library' ? written[current.title] : undefined
  const parts: JdSections | null = !current
    ? null
    : current.kind === 'past'
      ? splitJdIntoSections(templates.find((t) => t.id === current.id)?.jdContent ?? '')
      : libraryResult && !('error' in libraryResult) ? libraryResult : null

  // Write the library template the first time it is shown.
  const libraryTitle = open && current?.kind === 'library' ? current.title : null
  useEffect(() => {
    if (!libraryTitle || written[libraryTitle] || inflight.current.has(libraryTitle)) return
    inflight.current.add(libraryTitle)
    fetch('/api/recruiting/job-templates/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: libraryTitle }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        setWritten((w) => ({ ...w, [libraryTitle]: r.ok ? d.template as JdSections : { error: d.error ?? 'Could not write this template.' } }))
      })
      .catch(() => setWritten((w) => ({ ...w, [libraryTitle]: { error: 'Could not write this template.' } })))
      .finally(() => inflight.current.delete(libraryTitle))
  }, [libraryTitle, written])

  function choose(c: Choice) {
    setChosen(c)
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
      const chosenLines = linesOf(parts, k).filter((_, i) => picked.has(`${k}:${i}`))
      if (k === 'summary') out.summary = chosenLines.join('\n')
      else out[k] = chosenLines
    }
    onImport(out)
    setPicked(new Set())
    onOpenChange(false)
    toastSuccess('The sections selected have been added.')
  }

  const isOn = (c: Choice) => current?.kind === c.kind && (c.kind === 'past' ? current.kind === 'past' && current.id === c.id : current.kind === 'library' && current.title === c.title)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Relevant job templates{currentTitle ? `: ${currentTitle}` : ''}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)] max-h-[65vh]">
          <div className="flex flex-col min-h-0 border-slate-100 md:border-r md:pr-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={jobTitle || 'Search job titles'}
              aria-label="Search job templates"
              className="h-9 rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
            <div className="mt-2 overflow-y-auto space-y-3" role="radiogroup" aria-label="Job templates">
              {past.length > 0 && (
                <div>
                  <p className="px-2 text-[10px] uppercase tracking-wider font-semibold text-slate-400">Convertt&apos;s past job posts</p>
                  {past.map((t) => (
                    <label key={t.id} className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 cursor-pointer">
                      <input type="radio" name="template" checked={isOn({ kind: 'past', id: t.id })} onChange={() => choose({ kind: 'past', id: t.id })} className="mt-1" />
                      <span className="min-w-0">
                        <span className="block text-slate-800">{t.title}</span>
                        {t.department && <span className="block text-[11px] text-slate-400">{t.department}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {library.length > 0 && (
                <div>
                  <p className="px-2 text-[10px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Job templates
                  </p>
                  {library.map((t) => (
                    <label key={t} className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 cursor-pointer">
                      <input type="radio" name="template" checked={isOn({ kind: 'library', title: t })} onChange={() => choose({ kind: 'library', title: t })} className="mt-1" />
                      <span className="text-slate-800">{t}</span>
                    </label>
                  ))}
                </div>
              )}
              {past.length === 0 && library.length === 0 && (
                <p className="px-2 py-3 text-xs text-slate-400">Type a job title to see templates for it.</p>
              )}
            </div>
          </div>

          <div className="overflow-y-auto pr-1 space-y-5">
            {current?.kind === 'library' && !libraryResult && (
              <p className="text-sm text-slate-500 flex items-center gap-2 py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Writing a template for {current.title}…
              </p>
            )}
            {libraryResult && 'error' in libraryResult && <p className="text-sm text-red-700">{libraryResult.error}</p>}
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

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
          <span className="text-xs text-slate-500">{picked.size} selected</span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={add} disabled={picked.size === 0}>Add selection</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
