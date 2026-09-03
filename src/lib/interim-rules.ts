/**
 * The rules that exist only because HR is the only person using the system.
 *
 * Of 44 accounts, 37 have never logged in. Every route into the app that
 * expects an employee to do something for themselves is currently a dead end,
 * and several deliberate shortcuts route around that. They are shortcuts, not
 * the design.
 *
 * They live here rather than only in a document so the Settings screen and the
 * code cannot drift: a rule that is switched off here is switched off in the
 * behaviour, and one that has no switch says so plainly instead of pretending.
 *
 * `configKey` is the Config row that turns it off. `null` means there is
 * nothing to toggle — it is a fact about how the app is being used, or a
 * missing credential, and the entry is here to be read rather than clicked.
 */

export type RuleStatus = 'SWITCHABLE' | 'PRACTICE' | 'CREDENTIAL'

export interface InterimRule {
  id: string
  title: string
  /** What it does today. */
  now: string
  /** Why it exists. */
  because: string
  /** What replaces it when employees are on the system. */
  then: string
  /** Where it lives, for whoever removes it. */
  where: string
  status: RuleStatus
  /** Config key that disables it, when there is one. */
  configKey: string | null
  /** What the app does once the switch is off. */
  whenOff?: string
}

export const INTERIM_RULES: InterimRule[] = [
  {
    id: 'grid-leave',
    title: 'Marking L on the attendance grid creates the leave request',
    now: 'Marking a cell LEAVE writes an approved leave request for that day, and '
      + 'changing the cell back withdraws the one it created.',
    because: 'A day marked L existed only as a letter in a grid — invisible to payroll, '
      + 'to the sandwich rule and to the leave list.',
    then: 'Reverse the direction. The approved request marks the grid, not the other way round.',
    where: 'src/lib/grid-leave.ts',
    status: 'SWITCHABLE',
    configKey: 'interim_grid_leave',
    whenOff: 'Marking a cell L records attendance only. Nothing appears in Leave Approved.',
  },
  {
    id: 'payroll-grid-leave',
    title: 'Payroll counts leave marked on the grid, not just approved requests',
    now: 'Payroll reads both sources and de-duplicates, so a day marked L is paid as leave.',
    because: 'Payroll read approved requests only, so a day marked L was paid as a day worked.',
    then: 'Requests become the single source and reading the grid stops being necessary.',
    where: 'src/lib/payroll-leave.ts',
    status: 'SWITCHABLE',
    configKey: 'interim_payroll_grid_leave',
    whenOff: 'Payroll counts approved leave requests only.',
  },
  {
    id: 'sandwich-grid-leave',
    title: 'The sandwich rule assesses leave marked on the grid',
    now: 'Friday and Monday cells marked L are surfaced for assessment even with no request behind them.',
    because: 'Altaf’s Friday 28 August was a grid cell and nothing else, so the rule could '
      + 'not see the absence it exists to assess.',
    then: 'As above — requests become the single source.',
    where: 'src/app/api/sandwich/route.ts',
    status: 'SWITCHABLE',
    configKey: 'interim_sandwich_grid_leave',
    whenOff: 'Only approved leave requests are assessed.',
  },
  {
    id: 'hr-files-for-others',
    title: 'HR files leave and WFH on anyone’s behalf',
    now: 'The leave dialog has an employee picker; only HR may file against another person’s record.',
    because: 'Nobody else logs in, so a request only the employee can raise is a request that never exists.',
    then: 'Employees raise their own. The picker stays for HR but as the exception — '
      + 'somebody off sick with no laptop — rather than the only path.',
    where: 'src/app/api/leave/route.ts, src/app/dashboard/leave/_views/admin-leave-view.tsx',
    status: 'SWITCHABLE',
    configKey: 'interim_hr_files_for_others',
    whenOff: 'HR can only file their own leave, like everybody else.',
  },
  {
    id: 'friday-monday-evidence',
    title: 'Friday and Monday sick leave and WFH need evidence attached',
    now: 'Refused at submission without a document.',
    because: 'The claim that a Friday was not an ordinary long weekend is only worth '
      + 'anything with the document behind it. Today the employee emails it and HR attaches it.',
    then: 'Keep the rule — it is a real policy, not a workaround. What changes is who '
      + 'attaches the file: the employee, when they raise the request.',
    where: 'src/lib/sandwich.ts, src/app/api/leave/route.ts',
    status: 'SWITCHABLE',
    configKey: 'interim_friday_monday_evidence',
    whenOff: 'The request is accepted without evidence and flagged for the sandwich '
      + 'rule instead of being refused.',
  },
  {
    id: 'entered-approved',
    title: 'Records are entered already approved',
    now: 'Leave agreed over email is written straight in as APPROVED with both approval '
      + 'stamps back-dated to the dates on the thread.',
    because: 'The approval genuinely happened — in Gmail. Re-running it through the queue '
      + 'would mean HR approving a request HR had just typed.',
    then: 'The approval happens in the app, and the status means what it says.',
    where: 'Practice, not code. The API still routes new requests PENDING → PENDING_HR → APPROVED.',
    status: 'PRACTICE',
    configKey: null,
  },
  {
    id: 'typed-attendance',
    title: 'Attendance is typed, not clocked',
    now: 'HR fills the grid by hand. The clock-in path, punches, device trust scoring and '
      + 'geofencing are all built and all unused.',
    because: 'Nobody logs in to clock in.',
    then: 'Employees clock in; HR’s manual entry becomes the correction path, and the '
      + 'conflict list at Time → Conflicts starts earning its keep.',
    where: 'The manual-entry branch of POST /api/attendance',
    status: 'PRACTICE',
    configKey: null,
  },
  {
    id: 'approver-dropdown',
    title: 'The approver is named from a dropdown',
    now: 'HR records who approved rather than the system knowing because they clicked it.',
    because: 'The approval happened in email.',
    then: 'The approver is whoever actioned it, and the field stops being editable.',
    where: 'leadsOnly / hrOnly filters on GET /api/employees',
    status: 'PRACTICE',
    configKey: null,
  },
  {
    id: 'ot-hr-only',
    title: 'Overtime approval is HR-only',
    now: 'The manager-facing control is disabled; approvals go through HR’s Approvals tab.',
    because: 'Managers are not in the system either.',
    then: 'Managers approve their own team’s overtime.',
    where: 'src/app/dashboard/attendance/_views/team-time-view.tsx',
    status: 'PRACTICE',
    configKey: null,
  },
  {
    id: 'doc-tickbox',
    title: 'Signed onboarding documents are a tick-box',
    now: '"Tick the box once you have sent the signed copy to HR."',
    because: 'There is nobody to upload it.',
    then: 'The employee uploads the signed copy and the tick follows the file.',
    where: 'src/app/dashboard/journeys/journeys-client.tsx',
    status: 'PRACTICE',
    configKey: null,
  },
  {
    id: 'appraisee-column',
    title: 'HR fills the appraisal’s Appraisee column too',
    now: 'Both scoring columns are editable by the same person.',
    because: 'The paper form has the employee self-rate. With no employee logins, HR transcribes it.',
    then: 'The employee fills their column, and the appraiser cannot see it until they '
      + 'have filled theirs — which is the point of having two columns.',
    where: 'src/app/dashboard/performance/appraisals/_components/appraisal-form-editor.tsx',
    status: 'PRACTICE',
    configKey: null,
  },
  {
    id: 'no-email',
    title: 'Nothing is actually emailed',
    now: 'Every message the app composes is downloaded and sent by hand from Gmail.',
    because: 'SMTP_HOST, SMTP_USER and SMTP_PASS are not set. The EmailSend table is '
      + 'empty and no payslip has ever been marked sent.',
    then: 'Set the three variables in Vercel. Unlike the rest of this list, this one does '
      + 'not need anybody to log in first — it can be fixed today.',
    where: 'Environment, not code',
    status: 'CREDENTIAL',
    configKey: null,
  },
]

/** Default state: every switchable rule is ON, because today they are all needed. */
export const DEFAULT_ENABLED = true

export const SWITCHABLE_RULES = INTERIM_RULES.filter((r) => r.configKey !== null)

export const RULE_BY_KEY = new Map(
  SWITCHABLE_RULES.map((r) => [r.configKey as string, r]),
)
