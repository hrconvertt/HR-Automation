/**
 * Shared status → AttendanceLog field mapping for HR manual edits.
 *
 * Used by BOTH the single-cell PATCH (/api/attendance/[employeeId]/[date])
 * and the per-employee month bulk editor
 * (POST /api/attendance/[employeeId]/bulk-month) so a day written either way
 * produces the IDENTICAL AttendanceLog row. If you change the mapping, both
 * write paths change together.
 */

export type CellStatus = 'PRESENT' | 'LEAVE' | 'WFH' | 'HALF_DAY' | 'ABSENT'

export const CELL_DEFAULTS: Record<CellStatus, { status: string; workType: string; hoursWorked: number }> = {
  PRESENT:  { status: 'PRESENT',  workType: 'ONSITE', hoursWorked: 8 },
  WFH:      { status: 'PRESENT',  workType: 'WFH',    hoursWorked: 8 },
  LEAVE:    { status: 'LEAVE',    workType: 'ONSITE', hoursWorked: 0 },
  HALF_DAY: { status: 'HALF_DAY', workType: 'ONSITE', hoursWorked: 4 },
  ABSENT:   { status: 'ABSENT',   workType: 'ONSITE', hoursWorked: 0 },
}

/** Statuses that mean the month's REGULAR payroll is closed — no attendance
 *  edits allowed. Mirrors PAYROLL_CLOSED_STATUSES in the corrections route. */
export const PAYROLL_CLOSED_STATUSES = ['PAID', 'LOCKED', 'DISBURSED', 'CLOSED']
