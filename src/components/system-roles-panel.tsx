'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck, Save, CheckCircle2, Pencil, X } from 'lucide-react'

const ROLE_META: Record<string, { label: string; description: string; color: string }> = {
  HR_ADMIN:  { label: 'HR',              description: 'Full org access, hire/fire, payroll, settings',          color: 'bg-slate-50 text-slate-700 border-slate-100' },
  MANAGER:   { label: 'Manager',         description: 'Approve leaves, review team performance',                 color: 'bg-slate-50 text-slate-700 border-slate-100' },
  LEAD:      { label: 'Lead',            description: 'Informal team lead: read team data, approve team leaves', color: 'bg-slate-50 text-slate-700 border-slate-100' },
  EMPLOYEE:  { label: 'Employee',        description: 'Self-service (own pay, leave, attendance)',               color: 'bg-slate-50 text-slate-700 border-slate-100' },
  EXECUTIVE: { label: 'CEO / Executive', description: 'Strategic KPIs, read-only across org',                    color: 'bg-slate-50 text-slate-700 border-slate-100' },
  FINANCE:   { label: 'Finance',         description: 'Payroll disbursement + finance views',                    color: 'bg-slate-50 text-slate-700 border-slate-100' },
}

const ROLE_ORDER = ['HR_ADMIN', 'MANAGER', 'LEAD', 'EMPLOYEE', 'EXECUTIVE', 'FINANCE']

interface Props {
  employeeId: string
  employeeName: string
}

/**
 * System Roles panel.
 *
 *   Default state → compact summary (current roles as chips + "Edit" button).
 *   Edit state    → checkboxes, primary selector, Save + Cancel.
 *   On save       → flash success, collapse back to read-only.
 *
 * Avoids the "permanently open" look the panel had before.
 */
export function SystemRolesPanel({ employeeId, employeeName }: Props) {
  const router = useRouter()
  const [savedRoles, setSavedRoles] = useState<string[]>([])
  const [savedPrimary, setSavedPrimary] = useState<string>('EMPLOYEE')
  // Working copy used during edit
  const [draftRoles, setDraftRoles] = useState<string[]>([])
  const [draftPrimary, setDraftPrimary] = useState<string>('EMPLOYEE')

  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/employees/${employeeId}/roles`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return }
        const roles: string[] = d.roles ?? []
        const primary: string = d.primaryRole ?? 'EMPLOYEE'
        setSavedRoles(roles); setSavedPrimary(primary)
        setDraftRoles(roles); setDraftPrimary(primary)
      })
      .catch(() => setError('Failed to load roles'))
      .finally(() => setLoading(false))
  }, [employeeId])
  useEffect(() => { load() }, [load])

  function toggle(role: string) {
    setDraftRoles((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role])
  }

  async function save() {
    setError('')
    if (draftRoles.length === 0) { setError('At least one role required'); return }
    if (!draftRoles.includes(draftPrimary)) { setError('Primary role must be one of the assigned roles'); return }
    setSaving(true)
    const res = await fetch(`/api/employees/${employeeId}/roles`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles: draftRoles, primaryRole: draftPrimary }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Save failed'); return }
    setSavedRoles(draftRoles); setSavedPrimary(draftPrimary)
    setEditing(false)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2200)
    router.refresh()
  }

  function cancel() {
    setDraftRoles(savedRoles); setDraftPrimary(savedPrimary)
    setEditing(false); setError('')
  }

  // ─── Read-only summary ────────────────────────────────────────────────
  if (!editing) {
    return (
      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-5 h-5 text-slate-700" />
              System Roles
              <Badge variant="secondary" className="text-[10px]">HR only</Badge>
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Controls what {employeeName} can do in the system.
            </p>
          </div>
          {justSaved ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-100 rounded-full px-2.5 py-1 flex-shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={loading} className="flex-shrink-0">
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : savedRoles.length === 0 ? (
            <p className="text-sm text-slate-400">No roles assigned.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ROLE_ORDER.filter((r) => savedRoles.includes(r)).map((role) => {
                const meta = ROLE_META[role]
                const isPrimary = role === savedPrimary
                return (
                  <span
                    key={role}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${meta.color}`}
                  >
                    {meta.label}
                    {isPrimary && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold opacity-70">· primary</span>
                    )}
                  </span>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // ─── Edit state ───────────────────────────────────────────────────────
  return (
    <Card className="border-slate-100 ring-1 ring-slate-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="w-5 h-5 text-slate-700" />
          System Roles
          <Badge variant="secondary" className="text-[10px]">Editing</Badge>
        </CardTitle>
        <p className="text-xs text-slate-500 mt-1">
          A user can hold multiple roles. The primary role drives their default landing view.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {ROLE_ORDER.map((role) => {
            const meta = ROLE_META[role]
            const checked = draftRoles.includes(role)
            const isPrimary = draftPrimary === role
            return (
              <label
                key={role}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  checked ? meta.color : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(role)}
                  className="mt-0.5 accent-slate-700"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{meta.label}</p>
                    {isPrimary && checked && (
                      <Badge variant="default" className="text-[10px]">Primary (default view)</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">{meta.description}</p>
                  {checked && !isPrimary && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setDraftPrimary(role) }}
                      className="text-[11px] text-slate-700 hover:underline mt-1"
                    >
                      Make this the primary view
                    </button>
                  )}
                </div>
              </label>
            )
          })}

          <div className="flex items-center gap-2 pt-3 border-t border-slate-100 mt-3">
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : <><Save className="w-4 h-4 mr-1.5" /> Save</>}
            </Button>
            <Button variant="outline" onClick={cancel} disabled={saving}>
              <X className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
          </div>
          {error && (
            <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2 mt-2">{error}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
