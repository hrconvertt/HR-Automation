'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { FileText, Sparkles, Lock, Unlock } from 'lucide-react'
import { renderMarkdown } from '@/lib/markdown'
import { JdSharePanel } from './jd-share-panel'

interface Props {
  requisitionId: string
  title: string
  jdStatus: string | null
}

/**
 * Click-to-review JD button on each Job Requisition row.
 *
 *   No JD yet           → "Generate JD" (calls PATCH /jd to draft)
 *   DRAFT_JD            → "Review JD" (edit + Approve & Publish)
 *   POSTED              → "View JD" (read-only; Reopen to edit)
 */
export function JdReviewButton({ requisitionId, title, jdStatus }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')

  const isPosted = jdStatus === 'POSTED'
  const isDraft  = jdStatus === 'DRAFT_JD'
  const noJd     = !jdStatus

  const label = isPosted ? 'View JD' : isDraft ? 'Review JD' : 'Generate JD'
  const Icon  = isPosted ? Lock : isDraft ? FileText : Sparkles

  async function load() {
    setError(''); setLoading(true)
    const res = await fetch(`/api/recruiting/requisitions/${requisitionId}/jd`)
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'Failed to load'); return }
    setContent(data.requisition?.jdContent ?? '')
  }

  async function openDialog() {
    setOpen(true)
    if (noJd) {
      // First time — auto-generate before showing
      await regenerate()
    } else {
      await load()
    }
  }

  async function regenerate() {
    setError(''); setSaving(true)
    const res = await fetch(`/api/recruiting/requisitions/${requisitionId}/jd`, { method: 'PATCH' })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Failed to regenerate')
      return
    }
    await load()
  }

  async function save() {
    setError(''); setSaving(true)
    const res = await fetch(`/api/recruiting/requisitions/${requisitionId}/jd`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Save failed')
      return
    }
    router.refresh()
  }

  async function approveAndPublish() {
    setError(''); setSaving(true)
    // Save edits first, then publish
    const putRes = await fetch(`/api/recruiting/requisitions/${requisitionId}/jd`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!putRes.ok) {
      const d = await putRes.json().catch(() => ({}))
      setSaving(false); setError(d.error || 'Save failed before publish')
      return
    }
    const pubRes = await fetch(`/api/recruiting/requisitions/${requisitionId}/jd`, { method: 'POST' })
    setSaving(false)
    if (!pubRes.ok) {
      const d = await pubRes.json().catch(() => ({}))
      setError(d.error || 'Publish failed')
      return
    }
    setOpen(false)
    router.refresh()
  }

  async function reopen() {
    if (!confirm('Re-open this JD for editing? Candidates will not see it until you publish again.')) return
    setSaving(true)
    const res = await fetch(`/api/recruiting/requisitions/${requisitionId}/jd`, { method: 'DELETE' })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Failed to reopen')
      return
    }
    await load()
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border ${
          isPosted ? 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100' :
          isDraft  ? 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100' :
                     'text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100'
        }`}
        title={label}
      >
        <Icon className="w-3 h-3" />
        {label}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Job Description — {title}
              {isPosted && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                  <Lock className="w-2.5 h-2.5" /> Posted
                </span>
              )}
              {isDraft && (
                <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                  Draft
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>
          ) : (
            <div className="space-y-3">
              {!isPosted && (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-1 bg-slate-100 rounded-md p-0.5">
                    <button
                      type="button"
                      onClick={() => setTab('edit')}
                      className={`px-3 py-1 text-xs font-medium rounded ${tab === 'edit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                    >Edit</button>
                    <button
                      type="button"
                      onClick={() => setTab('preview')}
                      className={`px-3 py-1 text-xs font-medium rounded ${tab === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                    >Preview</button>
                  </div>
                  <button
                    type="button"
                    onClick={regenerate}
                    disabled={saving}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <Sparkles className="w-3 h-3" /> Regenerate
                  </button>
                </div>
              )}

              {tab === 'edit' && !isPosted ? (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={20}
                  className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="JD content (markdown)…"
                />
              ) : (
                <div
                  className="prose prose-sm prose-slate max-w-none rounded-md border border-slate-200 bg-slate-50/40 p-5"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                />
              )}

              {isPosted && (
                <JdSharePanel requisitionId={requisitionId} title={title} />
              )}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {isPosted ? (
              <>
                <Button variant="outline" onClick={reopen} disabled={saving}>
                  <Unlock className="w-3.5 h-3.5 mr-1.5" /> Re-open for edits
                </Button>
                <Button onClick={() => setOpen(false)}>Close</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                <Button variant="outline" onClick={save} disabled={saving}>Save Draft</Button>
                <Button onClick={approveAndPublish} disabled={saving || !content.trim()}>
                  {saving ? 'Saving…' : 'Approve & Publish'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
