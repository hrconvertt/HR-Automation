'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle2, AlertCircle } from 'lucide-react'

interface Props {
  requisitionId: string
  jobTitle: string
}

/**
 * Inline application form on the public /careers/[id] page.
 * Submits to POST /api/careers/[id]/apply which creates a Candidate
 * in APPLIED stage. Idempotent on (email × requisition).
 */
export function ApplyForm({ requisitionId, jobTitle }: Props) {
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '',
    currentCompany: '', currentRole: '',
    experience: '' as string, cvUrl: '', notes: '',
    // ─── Knockout filter inputs ───
    yearsExperience: '' as string,
    educationLevel: '' as string,
    workAuthorization: '' as string,
    location: '',
    openToRemote: false,
    skills: '',
    languages: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.fullName.trim()) { setError('Please enter your full name'); return }
    if (!form.email.trim())    { setError('A valid email is required'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/careers/${requisitionId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          experience: form.experience ? Number(form.experience) : null,
          yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : null,
          skills: form.skills ? form.skills.split(',').map((s) => s.trim()).filter(Boolean) : null,
          languages: form.languages ? form.languages.split(',').map((s) => s.trim()).filter(Boolean) : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      setSubmitting(false)
      if (!res.ok) { setError(data.error || `Something went wrong (HTTP ${res.status})`); return }
      setSuccess(data.message || 'Thanks for applying.')
    } catch (e) {
      setSubmitting(false)
      setError(e instanceof Error ? e.message : 'Network error')
    }
  }

  if (success) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-900">Application received</p>
            <p className="text-sm text-emerald-800 mt-1">{success}</p>
            <p className="text-xs text-emerald-700 mt-3">
              Role: <span className="font-medium">{jobTitle}</span>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
          <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Ahmed Khan" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ahmed@example.com" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+92 300 1234567" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Years of Experience</label>
          <Input type="number" min={0} step={0.5} value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} placeholder="2.5" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Current Company</label>
          <Input value={form.currentCompany} onChange={(e) => setForm({ ...form, currentCompany: e.target.value })} placeholder="—" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Current Role</label>
          <Input value={form.currentRole} onChange={(e) => setForm({ ...form, currentRole: e.target.value })} placeholder="—" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          CV / Portfolio Link <span className="text-slate-400 font-normal">(LinkedIn, Drive, Behance, GitHub…)</span>
        </label>
        <Input type="url" value={form.cvUrl} onChange={(e) => setForm({ ...form, cvUrl: e.target.value })} placeholder="https://…" />
      </div>

      {/* ─── Knockout filter inputs ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Years of Experience</label>
          <Input
            type="number"
            min={0}
            step={1}
            value={form.yearsExperience}
            onChange={(e) => setForm({ ...form, yearsExperience: e.target.value })}
            placeholder="3"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Education</label>
          <select
            value={form.educationLevel}
            onChange={(e) => setForm({ ...form, educationLevel: e.target.value })}
            className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="">Select…</option>
            <option value="HIGH_SCHOOL">High School</option>
            <option value="DIPLOMA">Diploma</option>
            <option value="BACHELORS">Bachelor&apos;s</option>
            <option value="MASTERS">Master&apos;s</option>
            <option value="PHD">PhD</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Work Authorization</label>
          <select
            value={form.workAuthorization}
            onChange={(e) => setForm({ ...form, workAuthorization: e.target.value })}
            className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="">Select…</option>
            <option value="PK">Pakistan</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Location (City)</label>
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="Lahore"
          />
        </div>
        <div className="flex items-end pb-1">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.openToRemote}
              onChange={(e) => setForm({ ...form, openToRemote: e.target.checked })}
              className="rounded border-slate-300"
            />
            Open to remote work
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Key Skills <span className="text-slate-400 font-normal">(comma-separated)</span>
        </label>
        <Input
          value={form.skills}
          onChange={(e) => setForm({ ...form, skills: e.target.value })}
          placeholder="Shopify Liquid, React, Figma"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Languages <span className="text-slate-400 font-normal">(comma-separated)</span>
        </label>
        <Input
          value={form.languages}
          onChange={(e) => setForm({ ...form, languages: e.target.value })}
          placeholder="English, Urdu"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Why this role? <span className="text-slate-400 font-normal">(3 lines — quality matters)</span>
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={3}
          maxLength={1000}
          className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          placeholder="Tell us why you'd be a strong fit. We read every line — generic copy-paste won't make it past the first filter."
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-[11px] text-slate-500">
          We use your email only to communicate about this application.
        </p>
        <Button type="submit" disabled={submitting} className="min-w-[140px]">
          {submitting ? 'Submitting…' : 'Submit application'}
        </Button>
      </div>
    </form>
  )
}
