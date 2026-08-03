/**
 * Exit clearance document prerequisites.
 *
 * Transcribed from the master sheet's "Terminated - Exit & Asset Requirements"
 * tab, which is the process of record. Each entry keeps the sheet's own name,
 * its applicability, and the Drive filename it corresponds to, so a row here
 * can always be traced back to the row HR already works from.
 *
 * `appliesTo` matters: four of these exist only when the company ends the
 * employment. Showing a Show Cause Notice on a voluntary resignation would
 * invite someone to issue one, so a resignation only ever renders the six
 * shared items.
 *
 * `generator` is the document-generator type that produces a draft. Two
 * entries have none — the exit interview is a conversation and assets are a
 * physical return — so those are evidence-upload only, never "generate".
 */
import type { DocumentType } from '@/lib/document-generator'

export type ExitScenario = 'TERMINATION' | 'RESIGNATION'

export interface ExitDocument {
  key: string
  /** Name exactly as it reads in the master sheet. */
  label: string
  appliesTo: ExitScenario[]
  /** Draft producible by the system, or null when the artefact is external. */
  generator: DocumentType | null
  /** EmployeeDocument.type the signed copy is filed under. */
  fileAs: string
  /** Source file in Drive, for anyone reconciling against the old process. */
  driveFile: string
  hint: string
}

const BOTH: ExitScenario[] = ['TERMINATION', 'RESIGNATION']
const TERM_ONLY: ExitScenario[] = ['TERMINATION']

export const EXIT_DOCUMENTS: ExitDocument[] = [
  {
    key: 'show_cause',
    label: 'Show Cause (3–7 days till 1 month)',
    appliesTo: TERM_ONLY,
    generator: 'show_cause_notice',
    fileAs: 'SHOW_CAUSE',
    driveFile: 'Show Cause Notice.docx',
    hint: 'Issued first, with a response window of 3–7 days.',
  },
  {
    key: 'notice_period',
    label: 'Notice Period',
    appliesTo: TERM_ONLY,
    generator: 'notice_period_letter',
    fileAs: 'NOTICE_PERIOD',
    driveFile: 'Notice Period - Ali Shan.docx',
    hint: 'Only when the company is terminating under the 1-month notice policy.',
  },
  {
    key: 'termination_letter',
    label: 'Termination Letter',
    appliesTo: TERM_ONLY,
    generator: 'termination_letter',
    fileAs: 'TERMINATION_LETTER',
    driveFile: 'Termination Letter.docx',
    hint: 'The formal letter. Sent as the attachment to the termination email.',
  },
  {
    key: 'termination_email',
    label: 'Termination Email',
    appliesTo: TERM_ONLY,
    generator: 'termination_email',
    fileAs: 'TERMINATION_LETTER',
    driveFile: 'Termination Letter.docx',
    hint: 'Covering note the letter is sent under — same reason and last day.',
  },
  {
    key: 'exit_interview',
    label: 'Exit Interview Done',
    appliesTo: BOTH,
    generator: 'exit_interview_form',
    fileAs: 'EXIT_INTERVIEW',
    driveFile: 'EXIT INTERVIEW FORM',
    hint: 'Generate the form to run the conversation, then upload the completed copy.',
  },
  {
    key: 'nda',
    label: 'NDA — Agreement',
    appliesTo: BOTH,
    generator: 'nda',
    fileAs: 'NDA',
    driveFile: 'NDA - AGREEMENT.pdf',
    hint: 'Confidentiality obligations continue after the last working day.',
  },
  {
    key: 'exit_form',
    label: 'Exit Form',
    appliesTo: BOTH,
    generator: 'exit_clearance_form',
    fileAs: 'EXIT_CLEARANCE',
    driveFile: 'Exit Clearance Form.docx',
    hint: 'Department sign-offs: IT, Finance, Admin, HR.',
  },
  {
    key: 'experience_letter',
    label: 'Experience Letter',
    appliesTo: BOTH,
    generator: 'experience_letter',
    fileAs: 'EXPERIENCE',
    driveFile: 'Experience letter',
    hint: 'Describes role and tenure for a future employer.',
  },
  {
    key: 'relieving_certificate',
    label: 'Relieving Certificate',
    appliesTo: BOTH,
    generator: 'relieving_certificate',
    fileAs: 'RELIEVING_CERTIFICATE',
    driveFile: 'Relieving Certificate - Ali Shan',
    hint: 'Confirms release and that no dues remain. Separate from the experience letter.',
  },
  {
    key: 'assets_returned',
    label: 'Assets Returned',
    appliesTo: BOTH,
    generator: null,
    fileAs: 'EXIT_CLEARANCE',
    driveFile: 'Exit Clearance Form.docx',
    hint: 'Physical return — upload the signed handover as evidence.',
  },
]

/** The prerequisites that apply to this exit. */
export function exitDocumentsFor(scenario: ExitScenario): ExitDocument[] {
  return EXIT_DOCUMENTS.filter((d) => d.appliesTo.includes(scenario))
}
