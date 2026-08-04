// Shared document type catalog (used by Document Center + Employee Profile).
export const DOC_TYPES = [
  { value: 'CNIC', label: 'CNIC' },
  { value: 'PHOTO', label: 'Photo' },
  { value: 'ADDRESS_PROOF', label: 'Address Proof' },
  { value: 'RESUME', label: 'Resume' },
  { value: 'EDUCATIONAL_CERTIFICATE', label: 'Educational Certificate' },
  { value: 'EXPERIENCE', label: 'Experience Letter' },
  { value: 'OFFER_LETTER', label: 'Offer Letter' },
  { value: 'NDA', label: 'NDA' },
  { value: 'SALARY_SLIP', label: 'Salary Slip' },
  { value: 'MEDICAL_REPORT', label: 'Medical Report' },
  { value: 'INSURANCE_CARD', label: 'Insurance Card' },
  { value: 'VACCINATION_RECORD', label: 'Vaccination Record' },
  { value: 'BANK_STATEMENT', label: 'Bank Statement' },
  { value: 'VISA_PASSPORT', label: 'Visa / Passport' },
  { value: 'REFERENCE_LETTER', label: 'Reference Letter' },
  { value: 'TRAINING_CERTIFICATE', label: 'Training Certificate' },
  { value: 'DRIVING_LICENSE', label: 'Driving License' },
  { value: 'SALARY_HISTORY', label: 'Salary History' },
  { value: 'TAX_CERTIFICATE', label: 'Tax Certificate' },
  { value: 'OTHER', label: 'Other' },
] as const

export type DocTypeValue = (typeof DOC_TYPES)[number]['value']

export function docTypeLabel(value: string): string {
  return DOC_TYPES.find((t) => t.value === value)?.label ?? value
}

/**
 * The canonical name for a document of a given type.
 *
 * A document sitting on an employee's own record does not need to repeat whose
 * it is — "Profile photo — Ali Hassan" on Ali Hassan's profile says the name
 * twice and, worse, says it differently from every other row. Names that were
 * typed by hand while filing carry the filer's habits, not the system's.
 *
 * A period is not a name: "Salary Slip — May 2026" stays, because May and June
 * are genuinely different documents. Anything else is just the type.
 */
export function canonicalDocName(type: string, period?: string | null): string {
  const label = docTypeLabel(type)
  return period ? `${label} — ${period}` : label
}
