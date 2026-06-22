'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface UserRow {
  id: string
  email: string
  fullName: string
  designation: string | null
  department: string | null
  primaryRole: string
  roles: string[]
  isActive: boolean
  clerkLinked: boolean
  mfaEnabled: boolean | null
  lastLogin: string | null
}

interface Department { id: string; name: string; code: string }
interface Manager { id: string; fullName: string; designation: string }

interface SignupAttemptRow {
  id: string
  email: string
  clerkUserId: string | null
  firstName: string | null
  lastName: string | null
  attemptedAt: string
  status: string
  reviewedAt: string | null
  reviewedById: string | null
  reviewerName: string | null
  reviewNotes: string | null
  resultingUserId: string | null
  resultingEmployee: { id: string; fullName: string } | null
}

const ROLE_OPTIONS = ['EMPLOYEE', 'MANAGER', 'LEAD', 'HR_ADMIN', 'EXECUTIVE', 'FINANCE']
const EMPLOYEE_TYPES = ['PERMANENT', 'PROBATION', 'INTERNSHIP', 'TRAINING']

type Tab = 'users' | 'signup-attempts'

export default function UserManagementClient({
  departments,
  managers,
}: {
  departments: Department[]
  managers: Manager[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab: Tab = searchParams.get('tab') === 'signup-attempts' ? 'signup-attempts' : 'users'
  const [tab, setTab] = useState<Tab>(initialTab)

  const [rows, setRows] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const [pendingCount, setPendingCount] = useState(0)

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/users')
      const data = await res.json()
      setRows(data.rows ?? [])
    } finally {
      setLoading(false)
    }
  }

  async function refreshPendingCount() {
    try {
      const res = await fetch('/api/settings/signup-attempts?status=PENDING')
      const data = await res.json()
      setPendingCount(data.pendingCount ?? 0)
    } catch {
      // non-fatal
    }
  }

  useEffect(() => { refresh(); refreshPendingCount() }, [])

  async function actOn(userId: string, action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch(`/api/settings/users/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(`Action failed: ${data.error ?? res.statusText}`)
    } else {
      refresh()
    }
    setOpenMenu(null)
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage Clerk-backed accounts, roles, MFA and password resets.
          </p>
        </div>
        {tab === 'users' && (
          <button
            onClick={() => setInviteOpen(true)}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800"
          >
            + Invite Employee
          </button>
        )}
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6 flex gap-6">
        <TabBtn active={tab === 'users'} onClick={() => setTab('users')}>
          Users
        </TabBtn>
        <TabBtn
          active={tab === 'signup-attempts'}
          onClick={() => setTab('signup-attempts')}
        >
          Sign-up Attempts
          {pendingCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center text-xs font-bold bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
              {pendingCount}
            </span>
          )}
        </TabBtn>
      </div>

      {tab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 font-semibold text-slate-700">Name</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-700">Email</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-700">Role</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-700">MFA</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-700">Status</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-700 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No users yet.</td></tr>
              )}
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-900">{u.fullName}</td>
                  <td className="px-4 py-2 text-slate-700">{u.email}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <span key={r} className="px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded">
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {u.mfaEnabled === null ? (
                      <span className="text-slate-400">—</span>
                    ) : u.mfaEnabled ? (
                      <span className="text-emerald-600">✓</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={
                      'px-2 py-0.5 text-xs rounded ' +
                      (u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')
                    }>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2 relative">
                    <button
                      onClick={() => setOpenMenu(openMenu === u.id ? null : u.id)}
                      className="px-2 py-1 hover:bg-slate-100 rounded text-slate-500"
                    >
                      ⋮
                    </button>
                    {openMenu === u.id && (
                      <div className="absolute right-2 top-full mt-1 bg-white border border-slate-200 shadow-lg rounded-lg z-10 w-56 py-1 text-sm">
                        <button
                          onClick={() => {
                            const newRole = prompt(
                              `Primary role for ${u.fullName}?\nOptions: ${ROLE_OPTIONS.join(', ')}`,
                              u.primaryRole,
                            )
                            if (newRole && ROLE_OPTIONS.includes(newRole)) {
                              actOn(u.id, 'change-role', { primaryRole: newRole, additionalRoles: u.roles.filter(r => r !== newRole) })
                            }
                          }}
                          className="block w-full text-left px-4 py-2 hover:bg-slate-50"
                        >
                          Change role
                        </button>
                        <button
                          onClick={() => {
                            const newEmail = prompt(
                              `Change sign-in email for ${u.fullName}?\nCurrent: ${u.email}\n\nThe employee will need to sign in with this new email next time.`,
                              u.email,
                            )
                            if (newEmail && newEmail.trim() !== u.email) {
                              actOn(u.id, 'change-email', { email: newEmail.trim() })
                            }
                          }}
                          className="block w-full text-left px-4 py-2 hover:bg-slate-50"
                        >
                          Edit email
                        </button>
                        <button
                          onClick={() => confirm(`Send password reset to ${u.email}?`) && actOn(u.id, 'reset-password')}
                          className="block w-full text-left px-4 py-2 hover:bg-slate-50"
                          disabled={!u.clerkLinked}
                        >
                          Reset password
                        </button>
                        <button
                          onClick={() => confirm(`Reset MFA for ${u.fullName}?`) && actOn(u.id, 'reset-mfa')}
                          className="block w-full text-left px-4 py-2 hover:bg-slate-50"
                          disabled={!u.clerkLinked}
                        >
                          Reset MFA
                        </button>
                        <button
                          onClick={() => confirm(`Lock ${u.fullName}? (revokes all sessions)`) && actOn(u.id, 'lock')}
                          className="block w-full text-left px-4 py-2 hover:bg-slate-50"
                          disabled={!u.clerkLinked}
                        >
                          Lock account
                        </button>
                        {u.isActive ? (
                          <button
                            onClick={() => confirm(`Deactivate ${u.fullName}?`) && actOn(u.id, 'deactivate')}
                            className="block w-full text-left px-4 py-2 hover:bg-slate-50 text-red-600"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => actOn(u.id, 'reactivate')}
                            className="block w-full text-left px-4 py-2 hover:bg-slate-50 text-emerald-700"
                          >
                            Reactivate
                          </button>
                        )}
                        <a
                          href="https://dashboard.clerk.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block px-4 py-2 hover:bg-slate-50 text-slate-500"
                        >
                          View Clerk audit log ↗
                        </a>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'signup-attempts' && (
        <SignupAttemptsPanel
          departments={departments}
          managers={managers}
          onCountChange={setPendingCount}
        />
      )}

      {inviteOpen && (
        <InviteDialog
          departments={departments}
          managers={managers}
          onClose={() => setInviteOpen(false)}
          onSuccess={(empId) => {
            setInviteOpen(false)
            refresh()
            router.push(`/dashboard/employees/${empId}`)
          }}
        />
      )}
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={
        'pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors ' +
        (active
          ? 'border-slate-900 text-slate-900'
          : 'border-transparent text-slate-500 hover:text-slate-700')
      }
    >
      {children}
    </button>
  )
}

// ─── Sign-up Attempts ───────────────────────────────────────────────────────
function SignupAttemptsPanel({
  departments,
  managers,
  onCountChange,
}: {
  departments: Department[]
  managers: Manager[]
  onCountChange: (n: number) => void
}) {
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'DISMISSED' | 'ALL'>('PENDING')
  const [rows, setRows] = useState<SignupAttemptRow[]>([])
  const [loading, setLoading] = useState(true)
  const [approveFor, setApproveFor] = useState<SignupAttemptRow | null>(null)
  const [dismissFor, setDismissFor] = useState<SignupAttemptRow | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/settings/signup-attempts?status=${status}`)
      const data = await res.json()
      setRows(data.rows ?? [])
      onCountChange(data.pendingCount ?? 0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [status])

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['PENDING', 'APPROVED', 'DISMISSED', 'ALL'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={
              'px-3 py-1 rounded-full text-xs font-semibold border ' +
              (status === s
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50')
            }
          >
            {s === 'PENDING' ? 'Pending' : s === 'APPROVED' ? 'Approved' : s === 'DISMISSED' ? 'Dismissed' : 'All'}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-slate-700">Email</th>
              <th className="text-left px-4 py-2 font-semibold text-slate-700">Name</th>
              <th className="text-left px-4 py-2 font-semibold text-slate-700">Attempted</th>
              <th className="text-left px-4 py-2 font-semibold text-slate-700">Status</th>
              <th className="text-left px-4 py-2 font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No sign-up attempts.</td></tr>
            )}
            {rows.map((r) => {
              const fullName = [r.firstName, r.lastName].filter(Boolean).join(' ') || '—'
              return (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 align-top">
                  <td className="px-4 py-2 font-medium text-slate-900">{r.email}</td>
                  <td className="px-4 py-2 text-slate-700">{fullName}</td>
                  <td className="px-4 py-2 text-slate-500 text-xs">
                    {new Date(r.attemptedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={r.status} />
                    {r.status === 'APPROVED' && r.resultingEmployee && (
                      <div className="mt-1">
                        <a
                          href={`/dashboard/employees/${r.resultingEmployee.id}`}
                          className="text-xs text-slate-600 hover:text-slate-900 underline"
                        >
                          → {r.resultingEmployee.fullName}
                        </a>
                      </div>
                    )}
                    {(r.status === 'APPROVED' || r.status === 'DISMISSED') && r.reviewedAt && (
                      <div className="text-xs text-slate-400 mt-1">
                        {new Date(r.reviewedAt).toLocaleDateString()}
                        {r.reviewerName ? ` by ${r.reviewerName}` : ''}
                      </div>
                    )}
                    {r.reviewNotes && (
                      <div className="text-xs text-slate-500 italic mt-1">
                        {r.reviewNotes}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {r.status === 'PENDING' ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setApproveFor(r)}
                          className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 font-semibold"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setDismissFor(r)}
                          className="px-3 py-1 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 font-semibold"
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {approveFor && (
        <ApproveAttemptDialog
          attempt={approveFor}
          departments={departments}
          managers={managers}
          onClose={() => setApproveFor(null)}
          onSuccess={() => {
            setApproveFor(null)
            load()
          }}
        />
      )}
      {dismissFor && (
        <DismissAttemptDialog
          attempt={dismissFor}
          onClose={() => setDismissFor(null)}
          onSuccess={() => {
            setDismissFor(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'PENDING'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : status === 'APPROVED'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-slate-100 text-slate-600 border-slate-200'
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded border ${styles}`}>
      {status}
    </span>
  )
}

function ApproveAttemptDialog({
  attempt,
  departments,
  managers,
  onClose,
  onSuccess,
}: {
  attempt: SignupAttemptRow
  departments: Department[]
  managers: Manager[]
  onClose: () => void
  onSuccess: () => void
}) {
  const initialName = [attempt.firstName, attempt.lastName].filter(Boolean).join(' ')
  const [form, setForm] = useState({
    fullName: initialName,
    designation: '',
    departmentId: departments[0]?.id ?? '',
    reportingManagerId: '',
    employeeType: 'PROBATION',
    joiningDate: new Date().toISOString().slice(0, 10),
    role: 'EMPLOYEE',
    additionalRoles: [] as string[],
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/settings/signup-attempts/${attempt.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Approve failed')
        return
      }
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <header className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Approve Sign-up</h2>
            <p className="text-xs text-slate-500 mt-1">
              Creates a User + Employee record and sends a Clerk invitation to{' '}
              <span className="font-mono">{attempt.email}</span>.
            </p>
          </header>
          <div className="p-6 space-y-4">
            <Field label="Email">
              <input value={attempt.email} disabled className="input bg-slate-50 text-slate-500" />
            </Field>
            <Field label="Full Name *">
              <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="input" />
            </Field>
            <Field label="Designation *">
              <input required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className="input" />
            </Field>
            <Field label="Department *">
              <select required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="input">
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Reports To">
              <select value={form.reportingManagerId} onChange={(e) => setForm({ ...form, reportingManagerId: e.target.value })} className="input">
                <option value="">— none —</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.fullName} ({m.designation})</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Employee Type">
                <select value={form.employeeType} onChange={(e) => setForm({ ...form, employeeType: e.target.value })} className="input">
                  {EMPLOYEE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Joining Date">
                <input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} className="input" />
              </Field>
            </div>
            <Field label="Primary Role">
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input">
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Additional roles</p>
              <div className="flex flex-wrap gap-3">
                {ROLE_OPTIONS.filter((r) => r !== form.role).map((r) => (
                  <label key={r} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={form.additionalRoles.includes(r)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...form.additionalRoles, r]
                          : form.additionalRoles.filter((x) => x !== r)
                        setForm({ ...form, additionalRoles: next })
                      }}
                    />
                    {r}
                  </label>
                ))}
              </div>
            </div>
            <Field label="Notes (optional)">
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="input"
                rows={2}
                placeholder="e.g. used personal gmail by mistake"
              />
            </Field>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          </div>
          <footer className="px-6 py-3 border-t border-slate-200 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded">Cancel</button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-slate-400"
            >
              {submitting ? 'Approving…' : 'Approve & Invite'}
            </button>
          </footer>
        </form>
        <style jsx>{`
          .input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; }
          .input:focus { outline: none; border-color: #0f172a; box-shadow: 0 0 0 1px #0f172a; }
        `}</style>
      </div>
    </div>
  )
}

function DismissAttemptDialog({
  attempt,
  onClose,
  onSuccess,
}: {
  attempt: SignupAttemptRow
  onClose: () => void
  onSuccess: () => void
}) {
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/settings/signup-attempts/${attempt.id}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Dismiss failed')
        return
      }
      onSuccess()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md">
        <form onSubmit={handleSubmit}>
          <header className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Dismiss Sign-up Attempt</h2>
            <p className="text-xs text-slate-500 mt-1">
              <span className="font-mono">{attempt.email}</span> will be marked dismissed. They won&apos;t be invited.
            </p>
          </header>
          <div className="p-6 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1">Reason (optional)</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                rows={3}
                placeholder="e.g. spam, not an employee, unknown name"
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          </div>
          <footer className="px-6 py-3 border-t border-slate-200 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded">Cancel</button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded hover:bg-slate-800 disabled:bg-slate-400"
            >
              {submitting ? 'Dismissing…' : 'Dismiss'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

function InviteDialog({
  departments,
  managers,
  onClose,
  onSuccess,
}: {
  departments: Department[]
  managers: Manager[]
  onClose: () => void
  onSuccess: (empId: string) => void
}) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    designation: '',
    departmentId: departments[0]?.id ?? '',
    reportingManagerId: '',
    employeeType: 'PROBATION',
    joiningDate: new Date().toISOString().slice(0, 10),
    primaryRole: 'EMPLOYEE',
    additionalRoles: [] as string[],
    sendInvite: true,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/settings/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Invite failed')
        return
      }
      onSuccess(data.employeeId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <header className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Invite New Employee</h2>
          </header>
          <div className="p-6 space-y-4">
            <Field label="Full Name *">
              <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="input" />
            </Field>
            <Field label="Email *">
              <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" placeholder="name@convertt.co" />
            </Field>
            <Field label="Designation *">
              <input required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className="input" />
            </Field>
            <Field label="Department">
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="input">
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Reports To">
              <select value={form.reportingManagerId} onChange={(e) => setForm({ ...form, reportingManagerId: e.target.value })} className="input">
                <option value="">— none —</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.fullName} ({m.designation})</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Employee Type">
                <select value={form.employeeType} onChange={(e) => setForm({ ...form, employeeType: e.target.value })} className="input">
                  {EMPLOYEE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Joining Date">
                <input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} className="input" />
              </Field>
            </div>
            <Field label="Primary Role">
              <select value={form.primaryRole} onChange={(e) => setForm({ ...form, primaryRole: e.target.value })} className="input">
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Additional roles</p>
              <div className="flex flex-wrap gap-3">
                {ROLE_OPTIONS.filter((r) => r !== form.primaryRole).map((r) => (
                  <label key={r} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={form.additionalRoles.includes(r)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...form.additionalRoles, r]
                          : form.additionalRoles.filter((x) => x !== r)
                        setForm({ ...form, additionalRoles: next })
                      }}
                    />
                    {r}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.sendInvite}
                onChange={(e) => setForm({ ...form, sendInvite: e.target.checked })}
              />
              Send Clerk invite email immediately
            </label>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          </div>
          <footer className="px-6 py-3 border-t border-slate-200 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded">Cancel</button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded hover:bg-slate-800 disabled:bg-slate-400"
            >
              {submitting ? 'Sending…' : 'Send Invite'}
            </button>
          </footer>
        </form>
      </div>
      <style jsx>{`
        .input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; }
        .input:focus { outline: none; border-color: #0f172a; box-shadow: 0 0 0 1px #0f172a; }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-700 mb-1">{label}</p>
      {children}
    </div>
  )
}
