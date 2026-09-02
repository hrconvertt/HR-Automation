'use client'

import { useEffect, useState } from 'react'
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

  // The status has to live here, not in the prop. The prop comes from the
  // server render of the row behind the dialog, and re-opening a JD used to
  // change only the database: the dialog kept rendering the posted view, share
  // panel and all, so the button looked dead even though it had worked.
  const [status, setStatus] = useState<string | null>(jdStatus)
  useEffect(() => { setStatus(jdStatus) }, [jdStatus])

  const isPosted = status === 'POSTED'
  const isDraft  = status === 'DRAFT_JD'
  const noJd     = !status

  const label = isPosted ? 'View JD' : isDraft ? 'Review JD' : 'Generate JD'
  const Icon  = isPosted ? Lock : isDraft ? FileText : Sparkles

  async function load() {
    setError(''); setLoading(true)
    const res = await fetch(`/api/recruiting/requisitions/${requisitionId}/jd`)
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'Failed to load'); return }
    setContent(data.requisition?.jdContent ?? '')
    // Whatever the server says the status is, that is the status. This also
    // flips "Generate JD" to "Review JD" the first time one is generated.
    setStatus(data.requisition?.jdStatus ?? null)
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
    setError(''); setSaving(true)
    const res = await fetch(`/api/recruiting/requisitions/${requisitionId}/jd`, { method: 'DELETE' })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Failed to reopen')
      return
    }
    // Straight into the editor, which is the whole point of the button.
    setStatus('DRAFT_JD')
    setTab('edit')
    await load()
    router.refresh()   // the row behind the dialog now says Review JD
  }

  return (
    <>
      {/* One width, whatever the state. The label used to carry it — "Generate
          JD" / "Review JD" / "View JD" — which made thirteen rows of ragged
          buttons. The dot carries it now and the row stays a grid. */}
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center justify-center gap-1.5 w-[74px] text-[11px] font-medium px-2 py-1 rounded-md border text-slate-700 border-slate-100 bg-slate-50 hover:bg-slate-100"
        title={label}
      >
        <span
          aria-hidden
          className={`w-1.5 h-1.5 rounded-full ${
            isPosted ? 'bg-emerald-500' : isDraft ? 'bg-amber-500' : 'bg-slate-300'
          }`}
        />
        <Icon className="w-3 h-3" />
        JD
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-700" />
              Job Description — {title}
              {isPosted && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-100">
                  <Lock className="w-2.5 h-2.5" /> Posted
                </span>
              )}
              {isDraft && (
                <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-100">
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
                    className="inline-flex items-center gap-1 text-xs text-slate-700 hover:text-slate-700"
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
                  className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-100"
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
                <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {/* The JD has to leave the system as a file — it gets emailed to
                candidates and filed alongside the other JDs. Print → Save as
                PDF from the printable page, so the sent file and the stored
                text are the same thing. */}
            <a
              href={`/jd/${requisitionId}/print`}
              target="_blank"
              rel="noreferrer"
              className="mr-auto inline-flex items-center gap-1.5 rounded-md border border-slate-300 text-slate-700 text-sm px-3 py-2 hover:bg-slate-50"
              title="Open a printable copy to save as PDF"
            >
              Save as PDF
            </a>
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
