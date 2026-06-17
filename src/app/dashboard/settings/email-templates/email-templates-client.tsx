'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mail, Save, Send } from 'lucide-react'

interface Template {
  id?: string
  key: string
  category?: string | null
  name?: string | null
  triggerEvent?: string | null
  condition?: string | null
  manualReview?: boolean
  active?: boolean
  subject: string
  body: string
  description: string | null
  variables: string | null
  updatedAt?: string
}

interface Placeholder { key: string; subject: string; description: string; variables: string }

export function EmailTemplatesClient({ templates, placeholders }: { templates: Template[]; placeholders: Placeholder[] }) {
  const router = useRouter()
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
  const [testingKey, setTestingKey] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const current = drafts[selected]

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const t of merged) if (t.category) set.add(t.category)
    return ['ALL', ...Array.from(set).sort()]
  }, [merged])

  const visible = useMemo(() => {
    return merged.filter((t) => {
      if (categoryFilter !== 'ALL' && (t.category ?? '') !== categoryFilter) return false
      const q = filter.toLowerCase().trim()
      if (!q) return true
      return [t.key, t.name, t.triggerEvent, t.subject].filter(Boolean).some((s) => String(s).toLowerCase().includes(q))
    })
  }, [merged, filter, categoryFilter])

  async function save() {
    if (!current) return
    setErr(''); setMsg('')
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
    setMsg('Saved')
    router.refresh()
  }

  async function toggleActive() {
    if (!current) return
    const next = !current.active
    setDrafts({ ...drafts, [current.key]: { ...current, active: next } })
    await fetch('/api/admin/email-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...current, active: next }),
    })
    router.refresh()
  }

  async function sendTest() {
    if (!current) return
    setErr(''); setMsg('')
    setTestingKey(current.key)
    const r = await fetch('/api/admin/email-templates/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: current.key }),
    })
    setTestingKey(null)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setErr(d.error || 'Test send failed')
      return
    }
    setMsg('Test email queued — check email queue.')
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
            <p className="text-white/85 text-sm mt-1">67-template HR library — edit, toggle active, send test. Used by the event-driven trigger engine.</p>
          </div>
        </div>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search by id, name, subject, trigger…" className="max-w-sm" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-sm rounded-md border border-slate-300 px-2 py-1.5"
          >
            {categories.map((c) => <option key={c} value={c}>{c === 'ALL' ? 'All categories' : c}</option>)}
          </select>
          <span className="text-xs text-slate-500 ml-auto">{visible.length} of {merged.length}</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <Card className="p-2 max-h-[700px] overflow-y-auto">
          <ul className="space-y-0.5">
            {visible.map((t) => {
              const isUnsaved = !t.id
              const isActive = t.active !== false
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    onClick={() => setSelected(t.key)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${selected === t.key ? 'bg-slate-50 text-slate-900 font-semibold' : 'hover:bg-slate-50 text-slate-700'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px]">{t.key}</span>
                      <span className="flex items-center gap-1">
                        {!isActive && <span className="text-[9px] uppercase font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Off</span>}
                        {t.manualReview && <span className="text-[9px] uppercase font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">Draft-only</span>}
                        {isUnsaved && <span className="text-[9px] uppercase font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">New</span>}
                      </span>
                    </div>
                    {t.name && <p className="text-[12px] text-slate-700 mt-0.5 truncate">{t.name}</p>}
                    {t.triggerEvent && <p className="text-[10px] font-mono text-slate-500 mt-0.5 truncate">{t.triggerEvent}</p>}
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>

        {current ? (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{current.category ?? 'Template'}</p>
                <p className="font-mono text-sm text-slate-900">{current.key}{current.name ? ` — ${current.name}` : ''}</p>
                {current.triggerEvent && (
                  <p className="text-[11px] font-mono text-slate-500 mt-1">trigger: {current.triggerEvent}{current.condition ? ` · if ${current.condition}` : ''}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={toggleActive} size="sm" variant="outline">
                  {current.active === false ? 'Activate' : 'Deactivate'}
                </Button>
                <Button onClick={sendTest} size="sm" variant="outline" disabled={testingKey === current.key}>
                  <Send className="w-4 h-4 mr-1.5" /> {testingKey === current.key ? 'Sending…' : 'Send test'}
                </Button>
                <Button onClick={save} disabled={savingKey === current.key} size="sm">
                  <Save className="w-4 h-4 mr-1.5" /> {savingKey === current.key ? 'Saving…' : 'Save'}
                </Button>
              </div>
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
                  rows={18}
                  value={current.body}
                  onChange={(e) => setDrafts({ ...drafts, [current.key]: { ...current, body: e.target.value } })}
                  placeholder="Plain text or HTML. Use [Square Brackets] for library vars or {{name}} placeholders."
                />
              </div>
              {err && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{err}</p>}
              {msg && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{msg}</p>}
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
