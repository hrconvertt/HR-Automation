/**
 * Reading the audit log back.
 *
 * Sixteen places in the API write to `AuditLog`, and until now nothing read it:
 * 1,515 rows recording who changed what, with no screen to look at them. That
 * matters most exactly when it is needed — four payslips disagree with the
 * salary sheet and nobody can say who moved a number, or when.
 *
 * The rows are not uniform. Most carry both `oldValue` and `newValue` as JSON;
 * the attendance ones carry only `newValue`, because the grid writes a cell
 * rather than editing a known previous state. So this renders a before/after
 * where there is a before, and "set to" where there is not, rather than
 * inventing an empty left-hand column.
 */

export interface AuditRow {
  id: string
  action: string
  entity: string
  entityId: string | null
  createdAt: string
  oldValue: string | null
  newValue: string | null
  ipAddress: string | null
  actor: { name: string; email: string } | null
  subject: { id: string; fullName: string; employeeCode: string } | null
}

/** What each entity is called in the product, rather than in the schema. */
export const ENTITY_LABEL: Record<string, string> = {
  AttendanceLog: 'Attendance',
  CompensationHistory: 'Compensation',
  Employee: 'Employee record',
  LeaveRequest: 'Leave',
  TotalRewards: 'Total rewards',
  PayrollReport: 'Payroll report',
  KnockoutCriterion: 'Screening criteria',
  Candidate: 'Candidate',
}
export const entityLabel = (e: string) => ENTITY_LABEL[e] ?? e

/**
 * Which entities are worth a second look. Attendance edits are the bulk of the
 * log by an order of magnitude and are mostly routine; money and identity are
 * neither.
 */
export const CONSEQUENTIAL = new Set(['CompensationHistory', 'Employee', 'PayrollReport', 'TotalRewards'])

export const ACTION_TONE: Record<string, string> = {
  UPDATE: 'bg-sky-50 text-sky-800 border-sky-200',
  DELETE: 'bg-red-50 text-red-700 border-red-200',
  CREATE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  APPROVE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  REJECT: 'bg-red-50 text-red-700 border-red-200',
  READ: 'bg-slate-50 text-slate-500 border-slate-200',
}
export const actionTone = (a: string) => ACTION_TONE[a] ?? 'bg-slate-50 text-slate-600 border-slate-200'

/** Field names as a person would say them. */
const FIELD_LABEL: Record<string, string> = {
  basicSalary: 'Basic salary', grossSalary: 'Gross salary', netSalary: 'Net salary',
  hoursWorked: 'Hours worked', workType: 'Work type', status: 'Status',
  effectiveDate: 'Effective date', joiningDate: 'Joining date', notes: 'Notes',
  note: 'Note', reason: 'Reason', amount: 'Amount', date: 'Date',
  designation: 'Designation', departmentId: 'Department', employeeType: 'Employee type',
}
export function fieldLabel(k: string): string {
  if (FIELD_LABEL[k]) return FIELD_LABEL[k]
  return k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()
}

export interface FieldChange {
  field: string
  before: string | null
  after: string | null
  /** The record was deleted, so `before` is what it held, not a former value. */
  removed?: boolean
}

function readable(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2)
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  // ISO timestamps read badly in a table; the date is the part anyone wants.
  const m = /^(\d{4})-(\d{2})-(\d{2})T/.exec(s)
  if (m) return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return s
}

function parse(json: string | null): Record<string, unknown> | null {
  if (!json) return null
  try {
    const v = JSON.parse(json)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch { return null }
}

/**
 * The fields that actually moved. Where there is no `oldValue` the change is
 * reported as a value set rather than as a change from nothing.
 */
export function describeChange(
  oldValue: string | null, newValue: string | null, action?: string,
): FieldChange[] {
  const before = parse(oldValue)
  const after = parse(newValue)
  if (!before && !after) return []

  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  const out: FieldChange[] = []
  for (const k of keys) {
    const b = readable(before?.[k])
    const a = readable(after?.[k])
    if (before && after && b === a) continue     // unchanged — not worth a line
    if (b === null && a === null) continue
    // On a deletion every field reads "value -> null", which is noise: the
    // record went, the fields did not each change to nothing.
    if (action === 'DELETE' && a === null && b !== null) {
      out.push({ field: fieldLabel(k), before: b, after: null, removed: true })
      continue
    }
    out.push({ field: fieldLabel(k), before: b, after: a })
  }
  return out.sort((x, y) => x.field.localeCompare(y.field))
}

/** True when the row records a real before-and-after rather than just a value. */
export const hasBefore = (r: { oldValue: string | null }) => !!r.oldValue
