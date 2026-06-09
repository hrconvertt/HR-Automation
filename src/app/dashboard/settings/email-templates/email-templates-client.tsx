'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mail, Save } from 'lucide-react'

interface Template {
  id?: string
  key: string
  subject: string
  body: string
  description: string | null
  variables: string | null
  updatedAt?: string
}

interface Placeholder { key: string; subject: string; description: string; variables: string }

export function EmailTemplatesClient({ templates, placeholders }: { templates: Template[]; placeholders: Placeholder[] }) {
  const router = useRouter()
  // Merge placeholders + saved templates by key
  const merged: Template[] = [
    ...templates,
    ...placeholders.map((p) => ({ key: p.key, subject: p.subject, body: '', description: p.description, variables: p.variables })),
  ]
  const [selected, setSelected] = useState<string>(merged[0]?.key ?? '')
  const [drafts, setDrafts] = useState<Record<string, Template>>(() => {
    const m: Record<string, Template> = {}
    for (const t of merged) m[t.key] = { ...t }
    return m
  })
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const current = drafts[selected]

  async function save() {
    if (!current) return
    setErr('')
    setSavingKey(current.key)
    const r = await fetch('/api/admin/email-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current),
    })
    setSavingKey(null)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setErr(d.error || 'Save failed')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 p-6 text-white shadow-md">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Email Templates</h1>
            <p className="text-white/85 text-sm mt-1">Editable subject + body templates with {'{{var}}'} substitution. Used by the email queue.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        <Card className="p-3">
          <ul className="space-y-1">
            {merged.map((t) => {
              const isUnsaved = !t.id
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    onClick={() => setSelected(t.key)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${selected === t.key ? 'bg-blue-50 text-blue-900 font-semibold' : 'hover:bg-slate-50 text-slate-700'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px]">{t.key}</span>
                      {isUnsaved && <span className="text-[9px] uppercase font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">New</span>}
                    </div>
                    {t.description && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{t.description}</p>}
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>

        {current ? (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Template Key</p>
                <p className="font-mono text-sm text-slate-900">{current.key}</p>
              </div>
              <Button onClick={save} disabled={savingKey === current.key} size="sm">
                <Save className="w-4 h-4 mr-1.5" /> {savingKey === current.key ? 'Saving…' : 'Save'}
              </Button>
            </div>
            {current.description && <p className="text-xs text-slate-600 mb-3">{current.description}</p>}
            {current.variables && (
              <p className="text-[11px] text-slate-500 mb-3">
                Variables: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">{current.variables}</code>
              </p>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Subject</label>
                <Input
                  value={current.subject}
                  onChange={(e) => setDrafts({ ...drafts, [current.key]: { ...current, subject: e.target.value } })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Body</label>
                <textarea
                  className="w-full rounded-md border border-slate-300 p-3 text-sm font-mono"
                  rows={16}
                  value={current.body}
                  onChange={(e) => setDrafts({ ...drafts, [current.key]: { ...current, body: e.target.value } })}
                  placeholder="Plain text or HTML. Use {{name}} placeholders."
                />
              </div>
              {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</p>}
              {current.updatedAt && (
                <p className="text-[11px] text-slate-400">Last saved: {new Date(current.updatedAt).toLocaleString('en-GB')}</p>
              )}
            </div>
          </Card>
        ) : (
          <Card className="p-5"><p className="text-sm text-slate-500">Select a template.</p></Card>
        )}
      </div>
    </div>
  )
}
