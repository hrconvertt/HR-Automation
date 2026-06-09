// Shared document type catalog (used by Document Center + Employee Profile).
export const DOC_TYPES = [
  { value: 'CNIC', label: 'CNIC' },
  { value: 'RESUME', label: 'Resume' },
  { value: 'EDUCATIONAL_CERTIFICATE', label: 'Educational Certificate' },
  { value: 'EXPERIENCE', label: 'Experience Letter' },
  { value: 'OFFER_LETTER', label: 'Offer Letter' },
  { value: 'NDA', label: 'NDA' },
  { value: 'PHOTO', label: 'Photo' },
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
