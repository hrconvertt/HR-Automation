/**
 * Data backups — every data set in the system written out as CSV files,
 * grouped into folders, and kept in the database so HR can download them.
 *
 * The columns come from the Prisma schema itself (every plain field of the
 * model), so a field added next month is in the next backup without anyone
 * remembering to add it here. What this file decides is which tables are
 * worth a file, which folder each goes in, and what never leaves: file
 * contents (Bytes), and anything that looks like a password, token or secret.
 *
 * Wherever a row has an employeeId, the employee's code and name are added
 * beside it, because a column of cuids means nothing in Excel.
 */
import { gzipSync, gunzipSync, deflateRawSync } from 'zlib'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const BACKUP_INTERVAL_DAYS = 14
/** How often to repeat the reminder while the latest backup sits undownloaded. */
export const REMIND_EVERY_DAYS = 3

interface Dataset {
  key: string
  folder: string
  label: string
  model: string
  where?: Record<string, unknown>
}

const d = (folder: string, key: string, label: string, model: string, where?: Record<string, unknown>): Dataset =>
  ({ folder, key, label, model, where })

/** Folder order is the order they appear in the screen and the zip. */
export const DATASETS: Dataset[] = [
  d('People', 'employees', 'Employees', 'Employee'),
  d('People', 'departments', 'Departments', 'Department'),
  d('People', 'positions', 'Positions', 'Position'),
  d('People', 'legal-entities', 'Legal entities', 'LegalEntity'),
  d('People', 'locations', 'Locations', 'Location'),
  d('People', 'job-changes', 'Job changes', 'JobChange'),
  d('People', 'manager-history', 'Manager history', 'ManagerHistory'),
  d('People', 'promotion-requests', 'Promotion requests', 'PromotionRequest'),
  d('People', 'employee-documents', 'Employee documents (list only)', 'EmployeeDocument'),
  d('People', 'users', 'System users', 'User'),
  d('People', 'user-roles', 'User roles', 'UserRole'),

  d('Leave', 'leave-requests', 'Leave requests', 'LeaveRequest', { category: { not: 'WFH' } }),
  d('Leave', 'leave-balances', 'Leave balances', 'LeaveBalance'),
  d('Leave', 'leave-policies', 'Leave policies', 'LeavePolicy'),
  d('Leave', 'leaves-of-absence', 'Leaves of absence', 'LeaveOfAbsence'),
  d('Leave', 'leave-of-absence-policies', 'Leave of absence policies', 'LeaveOfAbsencePolicy'),
  d('Leave', 'sandwich-deductions', 'Sandwich deductions', 'SandwichDeduction'),
  d('Leave', 'holidays', 'Holidays', 'Holiday'),

  d('Work from home', 'wfh-requests', 'Work from home requests', 'LeaveRequest', { category: 'WFH' }),

  d('Attendance', 'attendance-logs', 'Attendance (daily)', 'AttendanceLog'),
  d('Attendance', 'attendance-punches', 'Clock-ins and clock-outs', 'AttendancePunch'),
  d('Attendance', 'attendance-corrections', 'Attendance corrections', 'AttendanceCorrection'),
  d('Attendance', 'timesheets', 'Timesheet entries', 'TimesheetEntry'),
  d('Attendance', 'shifts', 'Shifts', 'ScheduleShift'),
  d('Attendance', 'daily-logs', 'Daily logs', 'DailyLog'),

  d('Payroll & compensation', 'payroll-runs', 'Payroll runs', 'PayrollRun'),
  d('Payroll & compensation', 'payroll-approvals', 'Payroll approvals', 'PayrollRunApproval'),
  d('Payroll & compensation', 'payslips', 'Payslips', 'Payslip'),
  d('Payroll & compensation', 'salaries', 'Salaries', 'Salary'),
  d('Payroll & compensation', 'compensation-history', 'Compensation history', 'CompensationHistory'),
  d('Payroll & compensation', 'salary-advances', 'Salary advances', 'SalaryAdvance'),
  d('Payroll & compensation', 'salary-bands', 'Salary bands', 'SalaryBand'),
  d('Payroll & compensation', 'salary-components', 'Salary components', 'SalaryComponent'),
  d('Payroll & compensation', 'tax-slabs', 'Income tax slabs', 'TaxSlab'),
  d('Payroll & compensation', 'bank-codes', 'Bank codes', 'BankCode'),
  d('Payroll & compensation', 'increment-cycles', 'Increment cycles', 'IncrementCycle'),
  d('Payroll & compensation', 'increment-reviews', 'Increment reviews', 'IncrementReview'),

  d('Performance', 'appraisal-forms', 'Appraisal forms', 'AppraisalForm'),
  d('Performance', 'performance-reviews', 'Performance reviews', 'PerformanceReview'),
  d('Performance', 'goals', 'Goals', 'Goal'),
  d('Performance', 'pips', 'Performance improvement plans', 'PIP'),
  d('Performance', 'probation-records', 'Probation records', 'ProbationRecord'),
  d('Performance', 'probation-reviews', 'Probation reviews', 'ProbationReview'),
  d('Performance', 'check-ins', 'Check-ins', 'CheckIn'),
  d('Performance', 'kpi-metrics', 'KPI metrics', 'KpiMetric'),
  d('Performance', 'kpi-assignments', 'KPI assignments', 'KpiAssignment'),
  d('Performance', 'daily-kpis', 'Daily KPIs', 'DailyKpi'),

  d('Discipline & exits', 'show-causes', 'Show cause notices', 'ShowCause'),
  d('Discipline & exits', 'warnings', 'Warnings', 'EmployeeWarning'),
  d('Discipline & exits', 'resignations', 'Resignations', 'Resignation'),
  d('Discipline & exits', 'terminations', 'Terminations', 'Termination'),
  d('Discipline & exits', 'exit-clearances', 'Exit clearances', 'ExitClearance'),
  d('Discipline & exits', 'exit-interviews', 'Exit interviews', 'ExitInterview'),

  d('Onboarding', 'onboarding-checklists', 'Onboarding checklists', 'OnboardingChecklist'),
  d('Onboarding', 'onboarding-tasks', 'Onboarding tasks', 'OnboardingTask'),
  d('Onboarding', 'onboarding-feedback', 'Onboarding feedback', 'OnboardingFeedback'),
  d('Onboarding', 'background-verifications', 'Background verifications', 'BackgroundVerification'),

  d('Recruiting', 'manpower-requisitions', 'Manpower requisitions', 'ManpowerRequisition'),
  d('Recruiting', 'job-requisitions', 'Job requisitions', 'JobRequisition'),
  d('Recruiting', 'job-postings', 'Job posts', 'JobPosting'),
  d('Recruiting', 'candidates', 'Candidates', 'Candidate'),
  d('Recruiting', 'candidate-evaluations', 'Candidate evaluations', 'CandidateEvaluation'),
  d('Recruiting', 'candidate-assessments', 'Candidate assessments', 'CandidateAssessment'),
  d('Recruiting', 'candidate-comments', 'Candidate comments', 'CandidateComment'),
  d('Recruiting', 'interviews', 'Interviews', 'Interview'),
  d('Recruiting', 'scorecards', 'Scorecards', 'Scorecard'),
  d('Recruiting', 'job-offers', 'Job offers', 'JobOffer'),

  d('Learning', 'training-programs', 'Training programs', 'TrainingProgram'),
  d('Learning', 'training-records', 'Training records', 'TrainingRecord'),
  d('Learning', 'certifications', 'Certifications', 'Certification'),
  d('Learning', 'learning-assignments', 'Learning assignments', 'LearningAssignment'),

  d('Assets', 'assets', 'Assets', 'Asset'),
  d('Assets', 'asset-assignments', 'Asset assignments', 'AssetAssignment'),

  d('Policies, letters & help desk', 'policies', 'Policies', 'PolicyDocument'),
  d('Policies, letters & help desk', 'policy-acknowledgments', 'Policy acknowledgments', 'PolicyAcknowledgment'),
  d('Policies, letters & help desk', 'letter-requests', 'Letter requests', 'LetterRequest'),
  d('Policies, letters & help desk', 'help-desk-tickets', 'Help desk tickets', 'HelpDeskTicket'),
  d('Policies, letters & help desk', 'ticket-replies', 'Help desk replies', 'TicketReply'),

  d('Culture', 'kudos', 'Kudos', 'Kudos'),
  d('Culture', 'company-events', 'Company events', 'CompanyEvent'),
  d('Culture', 'announcements', 'Announcements', 'Announcement'),

  d('Audit', 'audit-log', 'Audit trail', 'AuditLog'),
]

const SECRET_FIELD = /password|token|secret|hash|otp/i

// ─── CSV ────────────────────────────────────────────────────────────────────

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s: string
  if (v instanceof Date) s = v.toISOString()
  else if (typeof v === 'object') s = JSON.stringify(v)
  else s = String(v)
  // A text cell starting with = + - @ runs as a formula when opened in Excel.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map(cell).join(',')]
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(','))
  // The BOM makes Excel read the file as UTF-8, so names like "Zubair N.C" and
  // Urdu text survive the double-click.
  return '﻿' + lines.join('\r\n') + '\r\n'
}

// ─── Building a backup ──────────────────────────────────────────────────────

function delegateName(model: string) {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

async function readDataset(ds: Dataset, people: Map<string, { code: string; name: string }>) {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === ds.model)
  if (!model) return null
  const fields = model.fields
    .filter((f) => (f.kind === 'scalar' || f.kind === 'enum') && f.type !== 'Bytes' && !SECRET_FIELD.test(f.name))
    .map((f) => f.name)
  const select = Object.fromEntries(fields.map((f) => [f, true]))
  const orderBy = fields.includes('createdAt') ? { createdAt: 'asc' as const } : undefined

  const delegate = (prisma as unknown as Record<string, { findMany: (args: unknown) => Promise<Record<string, unknown>[]> }>)[delegateName(ds.model)]
  const rows = await delegate.findMany({ select, where: ds.where, orderBy })

  const columns = [...fields]
  if (fields.includes('employeeId')) {
    columns.splice(fields.indexOf('employeeId') + 1, 0, 'employeeCode', 'employeeName')
    for (const r of rows) {
      const p = people.get(String(r.employeeId ?? ''))
      r.employeeCode = p?.code ?? ''
      r.employeeName = p?.name ?? ''
    }
  }
  return { columns, rows }
}

export async function createBackup(opts: { trigger: 'SCHEDULED' | 'MANUAL'; createdByName?: string | null }) {
  const people = new Map(
    (await prisma.employee.findMany({ select: { id: true, employeeCode: true, fullName: true } }))
      .map((e) => [e.id, { code: e.employeeCode ?? '', name: e.fullName }]),
  )

  const files: { folder: string; dataset: string; fileName: string; rowCount: number; sizeBytes: number; gz: Buffer }[] = []
  for (const ds of DATASETS) {
    const read = await readDataset(ds, people)
    if (!read) continue
    const csv = Buffer.from(toCsv(read.columns, read.rows), 'utf-8')
    files.push({
      folder: ds.folder,
      dataset: ds.key,
      fileName: `${ds.key}.csv`,
      rowCount: read.rows.length,
      sizeBytes: csv.length,
      gz: gzipSync(csv),
    })
  }

  return prisma.dataBackup.create({
    data: {
      trigger: opts.trigger,
      createdByName: opts.createdByName ?? null,
      fileCount: files.length,
      rowCount: files.reduce((n, f) => n + f.rowCount, 0),
      sizeBytes: files.reduce((n, f) => n + f.sizeBytes, 0),
      files: { create: files },
    },
    select: { id: true, createdAt: true, fileCount: true, rowCount: true },
  })
}

export function csvBytes(gz: Uint8Array): Buffer {
  return gunzipSync(Buffer.from(gz))
}

export function datasetLabel(key: string): string {
  return DATASETS.find((x) => x.key === key)?.label ?? key
}

export function folderOrder(folder: string): number {
  const i = DATASETS.findIndex((x) => x.folder === folder)
  return i === -1 ? DATASETS.length : i
}

/** "convertt-data-backup-2026-09-17" — dated in Pakistan time, as HR reads it. */
export function backupName(createdAt: Date): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(createdAt)
  return `convertt-data-backup-${day}`
}

// ─── Zip (stored folders, deflated files) ───────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zip(entries: { path: string; data: Buffer }[], when = new Date()): Buffer {
  const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2)
  const dosDate = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const e of entries) {
    const name = Buffer.from(e.path, 'utf-8')
    const body = deflateRawSync(e.data)
    const crc = crc32(e.data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(e.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, body)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(dosTime, 12)
    central.writeUInt16LE(dosDate, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(e.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += local.length + name.length + body.length
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}
