'use client'

/**
 * Leave Policies — transposed matrix.
 *   Rows    = leave types (CASUAL / SICK / ANNUAL / MATERNITY / …)
 *   Columns = audience tiers (PERMANENT / PROBATION / INTERNSHIP / TRAINING / CONTRACT)
 *   Cell    = allotted days for that (leave type × tier). Zero = tier explicitly
 *             does not get that leave type.
 * HR clicks a cell to edit; the number persists via POST /api/settings/leave-policies.
 */
import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface LeavePolicy { id: string; leaveType: string; daysPerYear: number; employeeType: string }

const LEAVE_TYPES = ['CASUAL', 'SICK', 'ANNUAL', 'EARNED', 'MATERNITY', 'PATERNITY', 'UNPAID'] as const
const EMPLOYEE_TYPES = ['PERMANENT', 'PROBATION', 'INTERNSHIP', 'TRAINING', 'CONTRACT'] as const

type LeaveType = typeof LEAVE_TYPES[number]
type EmployeeType = typeof EMPLOYEE_TYPES[number]

export default function LeavePoliciesSettingsPage() {
  const [policies, setPolicies] = useState<LeavePolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<{ leaveType: LeaveType; employeeType: EmployeeType } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const r = await fetch('/api/settings/leave-policies')
    const d = await r.json()
    setPolicies(d.policies ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function cellValue(leaveType: LeaveType, employeeType: EmployeeType): number | null {
    const p = policies.find((x) => x.leaveType === leaveType && x.employeeType === employeeType)
    return p ? p.daysPerYear : null
  }

  async function saveCell() {
    if (!editing) return
    setSaving(true)
    const days = Number(editValue)
    if (!Number.isFinite(days) || days < 0) { setSaving(false); return }
    await fetch('/api/settings/leave-policies', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaveType: editing.leaveType, employeeType: editing.employeeType, daysPerYear: days }),
    })
    setEditing(null); setEditValue('')
    await load()
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader className="border-b border-slate-100">
        <CardTitle>Leave Policies</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <p className="px-6 py-3 text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
          Rows are leave types; columns are audience tiers. Click a cell to edit the
          allotted days. Explicit <span className="font-semibold">0</span> means that
          tier does not get that leave. PROBATION/INTERNSHIP/TRAINING accrue 1 day per
          month worked; PERMANENT gets the full quota one-shot.
        </p>
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-slate-600">Leave Type</th>
                  {EMPLOYEE_TYPES.map((t) => (
                    <th key={t} className="text-center px-4 py-2 font-medium text-slate-600">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LEAVE_TYPES.map((lt) => (
                  <tr key={lt} className="border-b border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">{lt}</td>
                    {EMPLOYEE_TYPES.map((et) => {
                      const v = cellValue(lt, et)
                      const isEditing = editing?.leaveType === lt && editing?.employeeType === et
                      return (
                        <td key={et} className="px-2 py-2 text-center">
                          {isEditing ? (
                            <div className="flex items-center gap-1 justify-center">
                              <Input
                                autoFocus
                                type="number" min={0}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveCell()
                                  if (e.key === 'Escape') { setEditing(null); setEditValue('') }
                                }}
                                className="w-16 h-8 text-center"
                              />
                              <Button size="sm" onClick={saveCell} disabled={saving}>OK</Button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditing({ leaveType: lt, employeeType: et }); setEditValue(String(v ?? 0)) }}
                              className="min-w-[3rem] px-3 py-1 rounded hover:bg-slate-100 transition-colors"
                            >
                              {v === null ? (
                                <span className="text-slate-300">—</span>
                              ) : (
                                <span className={`font-medium ${v === 0 ? 'text-slate-400' : 'text-slate-800'}`}>{v}</span>
                              )}
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
