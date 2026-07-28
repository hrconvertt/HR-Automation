/**
 * Standard 17-item onboarding checklist — Convertt master sheet.
 *
 * Issued by Convertt:
 *   1. Welcome Email Sent
 *   2. First Day Induction
 *   3. Offer Letter Issued
 *   4. Employment Agreement Signed (variant by employeeType)
 *   5. NDA Signed
 *   6. Employee Handbook Shared
 *
 * Uploaded by Employee (5 self-serve docs):
 *   7. CNIC Collected
 *   8. Photo Collected
 *   9. Address Proof
 *  10. Education Certificate
 *  11. Experience Letter
 *
 * System Setup:
 *  12. Bank Details Captured
 *  13. Email ID Created
 *  14. System Access Given
 *  15. Laptop / Asset Issued
 *  16. ID Card Issued
 *  17. Policy Explained
 *
 * Per-task properties:
 *   owner                 — HR | MANAGER | EMPLOYEE | IT
 *   category              — PRE_ARRIVAL | DAY_1 | WEEK_1_PAPERWORK | WEEK_1_IT | OTHER
 *   isEmployeeUploadable  — true for items 7–11 (drives self-upload UI)
 *   documentType          — EmployeeDocument.type to link the upload to
 */

export interface OnboardingTaskSeed {
  title: string
  description?: string
  owner: 'HR' | 'MANAGER' | 'EMPLOYEE' | 'IT'
  category: 'PRE_ARRIVAL' | 'DAY_1' | 'WEEK_1_PAPERWORK' | 'WEEK_1_IT' | 'OTHER'
  orderIndex: number
  isEmployeeUploadable?: boolean
  documentType?: string
}

/** Build the standard checklist, varying the Employment Agreement title
 *  by employeeType. PROBATION/PERMANENT → "Probation & Permanent",
 *  INTERNSHIP/TRAINING → "Training & Internship". */
export function buildStandardOnboardingTasks(
  employeeType: string,
): OnboardingTaskSeed[] {
  const agreementVariant =
    employeeType === 'INTERNSHIP' || employeeType === 'TRAINING'
      ? 'Training & Internship'
      : 'Probation & Permanent'

  return [
    // ── Company documents (issued BY Convertt) ──
    { title: 'Welcome Email Sent', owner: 'HR', category: 'PRE_ARRIVAL', orderIndex: 1 },
    { title: 'First Day Induction', owner: 'HR', category: 'DAY_1', orderIndex: 1 },
    { title: 'Offer Letter Issued', owner: 'HR', category: 'WEEK_1_PAPERWORK', orderIndex: 1 },
    { title: `Employment Agreement Signed (${agreementVariant})`, owner: 'HR', category: 'WEEK_1_PAPERWORK', orderIndex: 2 },
    { title: 'NDA Signed', owner: 'HR', category: 'WEEK_1_PAPERWORK', orderIndex: 3 },
    { title: 'Employee Handbook Shared', owner: 'HR', category: 'WEEK_1_PAPERWORK', orderIndex: 4 },

    // ── Employee-provided documents (self-upload) ──
    { title: 'CNIC Collected (photocopy)', owner: 'EMPLOYEE', category: 'WEEK_1_PAPERWORK', orderIndex: 5, isEmployeeUploadable: true, documentType: 'CNIC' },
    { title: 'Photo Collected (passport-sized)', owner: 'EMPLOYEE', category: 'WEEK_1_PAPERWORK', orderIndex: 6, isEmployeeUploadable: true, documentType: 'PHOTO' },
    { title: 'Address Proof', owner: 'EMPLOYEE', category: 'WEEK_1_PAPERWORK', orderIndex: 7, isEmployeeUploadable: true, documentType: 'ADDRESS_PROOF' },
    { title: 'Education Certificate (latest degree/transcript)', owner: 'EMPLOYEE', category: 'WEEK_1_PAPERWORK', orderIndex: 8, isEmployeeUploadable: true, documentType: 'EDUCATIONAL_CERTIFICATE' },
    { title: 'Experience Letter (from previous employer)', owner: 'EMPLOYEE', category: 'WEEK_1_PAPERWORK', orderIndex: 9, isEmployeeUploadable: true, documentType: 'EXPERIENCE' },

    // ── System setup ──
    { title: 'Bank Details Captured', owner: 'HR', category: 'WEEK_1_PAPERWORK', orderIndex: 10 },
    { title: 'Email ID Created', owner: 'IT', category: 'WEEK_1_IT', orderIndex: 1 },
    { title: 'System Access Given', owner: 'IT', category: 'WEEK_1_IT', orderIndex: 2 },
    { title: 'Laptop / Asset Issued', owner: 'IT', category: 'WEEK_1_IT', orderIndex: 3 },
    { title: 'ID Card Issued', owner: 'HR', category: 'WEEK_1_IT', orderIndex: 4 },
    { title: 'Policy Explained', owner: 'HR', category: 'DAY_1', orderIndex: 2 },
  ]
}

/** The five employee-uploadable doc types (matches OnboardingTask.documentType). */
export const EMPLOYEE_UPLOADABLE_DOC_TYPES = [
  'CNIC',
  'PHOTO',
  'ADDRESS_PROOF',
  'EDUCATIONAL_CERTIFICATE',
  'EXPERIENCE',
] as const

export type EmployeeUploadableDocType = (typeof EMPLOYEE_UPLOADABLE_DOC_TYPES)[number]

export const EMPLOYEE_UPLOADABLE_DOC_LABEL: Record<EmployeeUploadableDocType, string> = {
  CNIC: 'CNIC (photocopy)',
  PHOTO: 'Photo (passport-sized)',
  ADDRESS_PROOF: 'Address Proof',
  EDUCATIONAL_CERTIFICATE: 'Education Certificate',
  EXPERIENCE: 'Experience Letter',
}
