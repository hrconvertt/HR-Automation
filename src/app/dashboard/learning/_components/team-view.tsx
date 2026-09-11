'use client'

/**
 * My Team's Learning — the required learning of everyone who reports to you.
 *
 * Where Workday's Team Highlights card sends a manager. One card per person,
 * each course HR sent them with its status and deadline, overdue in red once
 * the date has passed. Completed courses stay listed, so a manager can see who
 * is done as well as who is not.
 */

import Link from 'next/link'
import { getInitials } from '@/lib/utils'
import {
  PROGRAM_TYPE_LABELS, RECORD_STATUS_LABELS, RECORD_STATUS_TONE,
  type ProgramType, type RecordStatus,
} from '@/lib/learning'

export interface TeamRow {
  id: string
  employeeId: string
  employeeName: string
  programId: string
  title: string
  type: string
  status: string
  score: number | null
  dueDate: string | null
  /** Worked out on the server, against the request's own clock. */
  overdue: boolean
}

const typeLabel = (t: string) => PROGRAM_TYPE_LABELS[t as ProgramType] ?? t
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export function TeamView({ rows }: { rows: TeamRow[] }) {
  const people = new Map<string, { name: string; rows: TeamRow[] }>()
  for (const r of rows) {
    const p = people.get(r.employeeId) ?? { name: r.employeeName, rows: [] }
    p.rows.push(r)
    people.set(r.employeeId, p)
  }
  const open = rows.filter((r) => r.status !== 'COMPLETED').length
  const overdue = rows.filter((r) => r.overdue).length
  const done = rows.filter((r) => r.status === 'COMPLETED').length

  return (
    <>
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">My Team&apos;s Learning</h1>
        <p className="text-sm text-slate-500 mt-1">The required learning of everyone who reports to you.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="People" value={people.size} />
        <Tile label="Still to do" value={open} />
        <Tile label="Overdue" value={overdue} alarm={overdue > 0} />
        <Tile label="Completed" value={done} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-sm text-slate-600">Nobody who reports to you has required learning.</p>
          <p className="text-xs text-slate-400 mt-1">It appears here as soon as HR sends a course to someone on your team.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...people.entries()].map(([id, p]) => {
            const mineDone = p.rows.filter((r) => r.status === 'COMPLETED').length
            return (
              <div key={id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100">
                  <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                    {getInitials(p.name)}
                  </span>
                  <Link href={`/dashboard/employees/${id}`} className="text-sm font-semibold text-blue-700 hover:underline">
                    {p.name}
                  </Link>
                  <span className="ml-auto text-xs text-slate-500">
                    {p.rows.length} required · {mineDone} done
                  </span>
                </div>
                <ul className="divide-y divide-slate-50">
                  {p.rows.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                      <Link href={`/dashboard/learning/programs/${r.programId}`} className="flex-1 min-w-0 truncate font-medium text-slate-900 hover:underline">
                        {r.title}
                      </Link>
                      <span className="text-xs text-slate-500 hidden sm:inline whitespace-nowrap">{typeLabel(r.type)}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border whitespace-nowrap ${RECORD_STATUS_TONE[r.status as RecordStatus] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                        {RECORD_STATUS_LABELS[r.status as RecordStatus] ?? r.status}
                        {r.score != null ? ` · ${Math.round(r.score)}%` : ''}
                      </span>
                      <span className={`text-xs whitespace-nowrap w-32 text-right ${r.overdue ? 'text-red-700 font-semibold' : 'text-slate-600'}`}>
                        {r.dueDate ? `${r.overdue ? 'Overdue' : r.status === 'COMPLETED' ? 'Was due' : 'Due'} ${day(r.dueDate)}` : 'No deadline'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function Tile({ label, value, alarm }: { label: string; value: number; alarm?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className={`text-2xl font-semibold ${alarm ? 'text-red-700' : 'text-slate-900'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}
