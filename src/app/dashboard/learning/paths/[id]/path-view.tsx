'use client'

/**
 * One learning path — shaped after Workday's path page.
 *
 * A header card with the privacy chip, the name, how many items, and the
 * owner's actions (Edit details, Change privacy settings, Share path); the
 * courses in order beneath it; and beside them Play, which opens whichever
 * course is next — the first one you have not finished.
 *
 * Reordering is by the arrows either side of the grip. Dragging reads better
 * but needs a drag library or a lot of pointer code for a list that is rarely
 * more than a handful long; the arrows are exact and work on a phone.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Lock, Globe, Pencil, Share2, Trash2, Eye, Play, ArrowUp, ArrowDown,
  GripVertical, Loader2, Compass, Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toastSuccess, toastError } from '@/components/ui/toaster'
import { CourseCover } from '../../_components/course-cover'
import {
  PROGRAM_TYPE_LABELS, RECORD_STATUS_LABELS, RECORD_STATUS_TONE,
  type ProgramType, type RecordStatus,
} from '@/lib/learning'
import {
  PATH_VISIBILITY, VISIBILITY_LABEL, VISIBILITY_HINT, type PathVisibility,
} from '@/lib/learning-path-types'

export interface PathItem {
  programId: string
  title: string
  type: string
  duration: number | null
  lessonCount: number
  status: string | null
}

export interface PathDetail {
  id: string
  title: string
  description: string | null
  visibility: string
  owner: string
  items: PathItem[]
}

const inputCls =
  'w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400'
const JSON_HEADERS = { 'Content-Type': 'application/json' }
const typeLabel = (t: string) => PROGRAM_TYPE_LABELS[t as ProgramType] ?? t
const asVisibility = (v: string): PathVisibility => (v === 'EVERYONE' ? 'EVERYONE' : 'PRIVATE')

function lengthLabel(h: number | null): string {
  if (h == null || h <= 0) return 'Self-paced'
  if (h < 1) return `${Math.round(h * 60)} minutes`
  const r = Math.round(h * 10) / 10
  return `${r} hour${r === 1 ? '' : 's'}`
}

export function PathView({ path, isOwner }: { path: PathDetail; isOwner: boolean }) {
  const router = useRouter()
  const [items, setItems] = useState(path.items)
  const [title, setTitle] = useState(path.title)
  const [description, setDescription] = useState(path.description)
  const [visibility, setVisibility] = useState<PathVisibility>(asVisibility(path.visibility))
  const [editing, setEditing] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [draft, setDraft] = useState({ title: path.title, description: path.description ?? '' })
  const [draftVis, setDraftVis] = useState<PathVisibility>(asVisibility(path.visibility))
  const [busy, setBusy] = useState(false)

  const done = items.filter((i) => i.status === 'COMPLETED').length
  const next = items.find((i) => i.status !== 'COMPLETED') ?? items[0] ?? null

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/learning/paths/${path.id}`, {
      method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      toastError('Not saved', d.error ?? null)
      return null
    }
    return d.path as { title: string; description: string | null; visibility: string }
  }

  async function saveDetails() {
    setBusy(true)
    const p = await patch({ title: draft.title, description: draft.description })
    setBusy(false)
    if (!p) return
    setTitle(p.title)
    setDescription(p.description)
    setEditing(false)
    toastSuccess('Path updated', p.title)
    router.refresh()
  }

  async function savePrivacy() {
    setBusy(true)
    const p = await patch({ visibility: draftVis })
    setBusy(false)
    if (!p) return
    setVisibility(asVisibility(p.visibility))
    setPrivacyOpen(false)
    toastSuccess('Privacy updated', VISIBILITY_LABEL[asVisibility(p.visibility)])
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/dashboard/learning/paths/${path.id}`)
      toastSuccess(
        'Link copied',
        visibility === 'PRIVATE'
          ? 'It is set to Only me, so nobody else can open it yet — change the privacy to share it.'
          : 'Anyone at Convertt with the link can open this path.',
      )
    } catch {
      toastError('Could not copy the link', 'Your browser blocked the clipboard.')
    }
  }

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const before = items
    const reordered = [...items]
    ;[reordered[i], reordered[j]] = [reordered[j], reordered[i]]
    setItems(reordered)
    const res = await fetch(`/api/learning/paths/${path.id}/items`, {
      method: 'PATCH', headers: JSON_HEADERS,
      body: JSON.stringify({ order: reordered.map((x) => x.programId) }),
    })
    if (!res.ok) {
      setItems(before)
      const d = await res.json().catch(() => ({}))
      toastError('Order not saved', d.error ?? null)
    }
  }

  async function remove(item: PathItem) {
    if (!confirm(`Take "${item.title}" out of this path?`)) return
    const res = await fetch(`/api/learning/paths/${path.id}/items`, {
      method: 'DELETE', headers: JSON_HEADERS, body: JSON.stringify({ programId: item.programId }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      toastError('Not removed', d.error ?? null)
      return
    }
    setItems((prev) => prev.filter((x) => x.programId !== item.programId))
    toastSuccess('Taken out of the path', item.title)
  }

  async function deletePath() {
    if (!confirm(`Delete the path "${title}"? The courses stay in the catalogue — only this list goes.`)) return
    const res = await fetch(`/api/learning/paths/${path.id}`, { method: 'DELETE' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      toastError('Not deleted', d.error ?? null)
      return
    }
    toastSuccess('Path deleted', title)
    router.push('/dashboard/learning?tab=paths')
  }

  return (
    <div className="space-y-5 min-w-0">
      <Link href="/dashboard/learning?tab=paths" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> My Learning Paths
      </Link>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="space-y-4 min-w-0">
          {/* The path itself. */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded bg-slate-100 text-slate-700">
              {visibility === 'EVERYONE' ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              {VISIBILITY_LABEL[visibility]}
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-3">{title}</h1>
            {description && <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{description}</p>}
            <p className="text-xs text-slate-500 mt-2">
              {items.length} item{items.length === 1 ? '' : 's'}
              {items.length ? ` · ${done} completed` : ''}
              {!isOwner ? ` · made by ${path.owner}` : ''}
            </p>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-5 pt-4 border-t border-slate-100 text-sm">
              {isOwner && (
                <>
                  <button
                    type="button"
                    onClick={() => { setDraft({ title, description: description ?? '' }); setEditing(true) }}
                    className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:underline"
                  >
                    Edit details <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDraftVis(visibility); setPrivacyOpen(true) }}
                    className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:underline"
                  >
                    Change privacy settings <Lock className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <button type="button" onClick={share} className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:underline">
                Share path <Share2 className="w-3.5 h-3.5" />
              </button>
              {isOwner && (
                <button type="button" onClick={deletePath} className="ml-auto inline-flex items-center gap-1.5 text-slate-500 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" /> Delete path
                </button>
              )}
            </div>
          </div>

          {/* The courses, in order. */}
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="text-sm text-slate-600">No courses in this path yet.</p>
              <p className="text-xs text-slate-400 mt-1">
                In Discover, open the ⋮ menu on a course and choose <span className="font-medium">Add to Learning Path</span>.
              </p>
            </div>
          ) : (
            <ol className="space-y-3">
              {items.map((it, i) => {
                const href = `/dashboard/learning/programs/${it.programId}`
                return (
                  <li key={it.programId} className="flex rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                    {isOwner && (
                      <div className="flex flex-col items-center justify-center gap-0.5 px-1.5 bg-slate-50 border-r border-slate-100">
                        <button type="button" aria-label={`Move ${it.title} up`} disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30">
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <GripVertical className="w-4 h-4 text-slate-300" aria-hidden="true" />
                        <button type="button" aria-label={`Move ${it.title} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)} className="p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30">
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    <Link href={href} tabIndex={-1} className="hidden sm:block w-56 flex-shrink-0">
                      <CourseCover id={`${path.id}-${it.programId}`} title={it.title} type={it.type} className="h-full min-h-[128px]" />
                    </Link>
                    <div className="flex-1 min-w-0 p-4 flex flex-col">
                      <p className="text-[11px] text-slate-400">{i + 1} of {items.length}</p>
                      <Link href={href} className="font-semibold text-slate-900 leading-snug hover:underline">{it.title}</Link>
                      <p className="text-xs text-slate-500 mt-1">
                        {typeLabel(it.type)} · {it.lessonCount ? `${it.lessonCount} lesson${it.lessonCount === 1 ? '' : 's'}` : lengthLabel(it.duration)}
                      </p>
                      {it.status && (
                        <span className={`self-start mt-2 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${RECORD_STATUS_TONE[it.status as RecordStatus] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                          {RECORD_STATUS_LABELS[it.status as RecordStatus] ?? it.status}
                        </span>
                      )}
                      <div className="mt-auto pt-3 flex items-center justify-between">
                        <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
                          View course <Eye className="w-4 h-4" />
                        </Link>
                        {isOwner && (
                          <button type="button" aria-label={`Take ${it.title} out of this path`} onClick={() => remove(it)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-slate-50">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        {/* Play, and the way to add more. */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          {next && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <CourseCover id={`${path.id}-play-${next.programId}`} title={next.title} type={next.type} className="h-40 rounded-xl" />
              <p className="text-xs text-slate-500 mt-3">
                {done === items.length ? 'All done — go again from' : done ? 'Up next' : 'Start with'}
              </p>
              <p className="text-sm font-semibold text-slate-900 line-clamp-2">{next.title}</p>
              <Link
                href={`/dashboard/learning/programs/${next.programId}`}
                className="mt-3 flex items-center justify-center gap-2 w-full rounded-full bg-blue-600 text-white text-sm font-semibold py-2.5 hover:bg-blue-700"
              >
                <Play className="w-4 h-4 fill-current" /> Play
              </Link>
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
            <p className="text-sm font-medium text-slate-800">Want to add more content?</p>
            <Link href="/dashboard/learning?tab=discover" className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
              <Compass className="w-4 h-4" /> Go to Discover
            </Link>
          </div>
        </aside>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit details</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Name</span>
              <input className={`${inputCls} mt-1`} value={draft.title} maxLength={120}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Description <span className="font-normal text-slate-400">(optional)</span></span>
              <textarea className={`${inputCls} mt-1 min-h-[90px]`} value={draft.description} maxLength={1000}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
            <Button onClick={saveDetails} disabled={busy || !draft.title.trim()} className="gap-1.5">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Change privacy settings</DialogTitle></DialogHeader>
          <div className="grid gap-2" role="radiogroup" aria-label="Who can see this path">
            {PATH_VISIBILITY.map((v) => (
              <label
                key={v}
                className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 cursor-pointer ${
                  draftVis === v ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input type="radio" name="path-visibility" checked={draftVis === v} onChange={() => setDraftVis(v)} className="sr-only" />
                {v === 'EVERYONE' ? <Globe className="w-4 h-4 text-slate-500" /> : <Lock className="w-4 h-4 text-slate-500" />}
                <span className="flex-1">
                  <span className="block text-sm font-medium text-slate-900">{VISIBILITY_LABEL[v]}</span>
                  <span className="block text-xs text-slate-500">{VISIBILITY_HINT[v]}</span>
                </span>
                {draftVis === v && <Check className="w-4 h-4 text-slate-900" />}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrivacyOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={savePrivacy} disabled={busy || draftVis === visibility} className="gap-1.5">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
