/**
 * Training & Development — the shared vocabulary.
 *
 * A program is a course the company offers or sends people on; a record is one
 * person enrolled on one program and how far they got; a certification is a
 * credential someone holds, with an expiry the system can watch.
 */

export const PROGRAM_TYPES = ['TECHNICAL', 'SOFT_SKILLS', 'COMPLIANCE', 'ONBOARDING', 'EXTERNAL'] as const
export type ProgramType = (typeof PROGRAM_TYPES)[number]

export const PROGRAM_TYPE_LABELS: Record<ProgramType, string> = {
  TECHNICAL: 'Technical',
  SOFT_SKILLS: 'Soft skills',
  COMPLIANCE: 'Compliance',
  ONBOARDING: 'Onboarding',
  EXTERNAL: 'External',
}

export const RECORD_STATUSES = ['ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'FAILED'] as const
export type RecordStatus = (typeof RECORD_STATUSES)[number]

export const RECORD_STATUS_LABELS: Record<RecordStatus, string> = {
  ENROLLED: 'Enrolled',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
}

export const RECORD_STATUS_TONE: Record<RecordStatus, string> = {
  ENROLLED: 'bg-slate-50 text-slate-600 border-slate-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-800 border-amber-200',
  COMPLETED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
}

/** Days from now within which a certification counts as "expiring soon". */
export const CERT_EXPIRY_WINDOW_DAYS = 60

export function certExpiryState(expiry: Date | string | null | undefined):
  'none' | 'valid' | 'expiring' | 'expired' {
  if (!expiry) return 'none'
  const d = typeof expiry === 'string' ? new Date(expiry) : expiry
  if (Number.isNaN(d.getTime())) return 'none'
  const days = (d.getTime() - Date.now()) / 86_400_000
  if (days < 0) return 'expired'
  if (days <= CERT_EXPIRY_WINDOW_DAYS) return 'expiring'
  return 'valid'
}
