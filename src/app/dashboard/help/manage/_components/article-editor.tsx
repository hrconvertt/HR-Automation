'use client'

/** Write or edit a Help Center article, with a preview of how it will read. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { renderMarkdown } from '@/lib/markdown'
import { ARTICLE_CATEGORIES, ARTICLE_AUDIENCE_ROLES } from '@/lib/help-center'

const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white'
const ROLE_LABEL: Record<string, string> = { EMPLOYEE: 'Employees', MANAGER: 'Managers', EXECUTIVE: 'Executives', HR_ADMIN: 'HR' }

export interface ArticleDraft {
  id?: string
  title: string
  category: string
  summary: string
  body: string
  tags: string[]
  audienceRoles: string[]
  status: string
}

export function ArticleEditor({ initial }: { initial?: ArticleDraft }) {
  const router = useRouter()
  const [a, setA] = useState<ArticleDraft>(initial ?? {
    title: '', category: 'HUMAN_RESOURCES', summary: '', body: '', tags: [], audienceRoles: [], status: 'DRAFT',
  })
  const [tagText, setTagText] = useState((initial?.tags ?? []).join(', '))
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)

  async function save(status: string) {
    setBusy(true)
    try {
      const payload = { ...a, status, tags: tagText.split(',').map((t) => t.trim()).filter(Boolean) }
      const res = await fetch(a.id ? `/api/help/articles/${a.id}` : '/api/help/articles', {
        method: a.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toastError('Could not save the article', (d as { error?: string }).error); return }
      const id = a.id ?? (d as { article: { id: string } }).article.id
      toastSuccess(status === 'PUBLISHED' ? 'Article published' : 'Draft saved')
      router.push(status === 'PUBLISHED' ? `/dashboard/help/articles/${id}` : '/dashboard/help/manage')
      router.refresh()
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!a.id || !confirm('Delete this article? This cannot be undone.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/help/articles/${a.id}`, { method: 'DELETE' })
      if (!res.ok) { toastError('Could not delete it'); return }
      toastSuccess('Article deleted')
      router.push('/dashboard/help/manage')
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
        <label className="block">
          <span className="block text-sm font-medium text-slate-800 mb-1">Title</span>
          <input className={input} value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} placeholder="e.g. How to apply for sick leave" />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-800 mb-1">Category</span>
          <select className={input} value={a.category} onChange={(e) => setA({ ...a, category: e.target.value })}>
            {ARTICLE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="block text-sm font-medium text-slate-800 mb-1">Summary <span className="text-slate-400 font-normal">(the two lines shown in Find Answers)</span></span>
        <input className={input} value={a.summary} maxLength={300} onChange={(e) => setA({ ...a, summary: e.target.value })} />
      </label>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-slate-800">Body <span className="text-slate-400 font-normal">(markdown: ## heading, **bold**, - list)</span></span>
          <button type="button" onClick={() => setPreview(!preview)} className="text-xs px-3 py-1 rounded-lg border border-slate-300">
            {preview ? 'Back to writing' : 'Preview'}
          </button>
        </div>
        {preview ? (
          <div className="border border-slate-200 rounded-lg p-4 min-h-[260px] prose prose-slate max-w-none"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(a.body || '_Nothing written yet._') }} />
        ) : (
          <textarea className={`${input} min-h-[260px] font-mono text-[13px]`} value={a.body} onChange={(e) => setA({ ...a, body: e.target.value })} />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="block text-sm font-medium text-slate-800 mb-1">Tags <span className="text-slate-400 font-normal">(comma-separated, used for search and related articles)</span></span>
          <input className={input} value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="leave, sick, medical certificate" />
        </label>
        <fieldset>
          <legend className="block text-sm font-medium text-slate-800 mb-1">Who can read it</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {ARTICLE_AUDIENCE_ROLES.map((r) => (
              <label key={r} className="flex items-center gap-1.5">
                <input type="checkbox" className="accent-slate-900" checked={a.audienceRoles.includes(r)}
                  onChange={(e) => setA({ ...a, audienceRoles: e.target.checked ? [...a.audienceRoles, r] : a.audienceRoles.filter((x) => x !== r) })} />
                {ROLE_LABEL[r]}
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1">Leave all unticked for everyone.</p>
        </fieldset>
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
        <button type="button" disabled={busy || !a.title.trim() || !a.body.trim()} onClick={() => save('PUBLISHED')}
          className="text-sm font-semibold px-5 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40">
          {a.status === 'PUBLISHED' ? 'Save and keep published' : 'Publish article'}
        </button>
        <button type="button" disabled={busy || !a.title.trim() || !a.body.trim()} onClick={() => save('DRAFT')}
          className="text-sm px-5 py-2 rounded-lg border border-slate-300 disabled:opacity-40">
          {a.status === 'PUBLISHED' ? 'Unpublish (save as draft)' : 'Save draft'}
        </button>
        {a.id && (
          <button type="button" disabled={busy} onClick={remove} className="text-sm px-5 py-2 rounded-lg border border-slate-300 ml-auto disabled:opacity-40">
            Delete article
          </button>
        )}
      </div>
    </div>
  )
}
