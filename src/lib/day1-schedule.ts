/**
 * The Day 1 schedule, written for you rather than from a blank box.
 *
 * The same day gets retyped for every joiner: coffee with the manager, HR
 * orientation, the office tour, lunch, first task. What actually differs is the
 * role — a developer's afternoon is repo access and a first ticket, a designer's
 * is the design system and brand files, a video editor's is the drive and the
 * project archive. So the shape is fixed and the afternoon is chosen.
 *
 * The output is plain text in the textarea, editable before it is saved. It is
 * a first draft that is right most of the time, not a schedule the system
 * insists on.
 */

export interface Day1Input {
  fullName: string
  designation?: string | null
  department?: string | null
  managerName?: string | null
  /** Interns get a lighter day and no client context. */
  employeeType?: string | null
}

interface RoleTrack {
  /** Matched against designation and department, case-insensitive. */
  match: RegExp
  label: string
  afternoon: string[]
}

/**
 * Ordered — first match wins, so put the specific before the general. Shopify
 * before "developer", or every Shopify developer gets the generic track.
 */
const TRACKS: RoleTrack[] = [
  {
    match: /shopify/i,
    label: 'Shopify development',
    afternoon: [
      'Shopify partner account, store invites and theme access',
      'Walk through the current client stores and which is whose',
      'Repo access, branch conventions and how work gets reviewed',
      'First ticket — something small and real, paired with a lead',
    ],
  },
  {
    match: /wordpress|\bwp\b/i,
    label: 'WordPress development',
    afternoon: [
      'Hosting, staging and WP admin access for the live sites',
      'Walk through the current client sites and who owns each',
      'Repo access, branch conventions and how work gets reviewed',
      'First ticket — something small and real, paired with a lead',
    ],
  },
  {
    match: /back.?end|full.?stack|\bdeveloper\b|\bengineer\b|\bdev\b/i,
    label: 'Development',
    afternoon: [
      'Repo access, local environment set up and running',
      'Architecture walkthrough with a lead — what talks to what',
      'Branch, review and deployment conventions',
      'First ticket — something small and real, paired with a lead',
    ],
  },
  {
    match: /ui\s*\/?\s*ux|\bui\b|\bux\b|design/i,
    label: 'Design',
    afternoon: [
      'Figma access, shared libraries and the brand kit',
      'Walk through the design system and where the components live',
      'Current projects and which designer holds each',
      'First task — a small screen or revision, reviewed same week',
    ],
  },
  {
    match: /video|motion|editor|graphic|creative/i,
    label: 'Creative',
    afternoon: [
      'Drive access — raw footage, brand assets and the project archive',
      'Editing conventions: naming, versioning, export presets',
      'Walk through recent work and what "finished" looks like here',
      'First task — a short cut or revision, reviewed same week',
    ],
  },
  {
    match: /\bcro\b|conversion|experiment|analytic/i,
    label: 'CRO',
    afternoon: [
      'Analytics, testing tools and client dashboard access',
      'How an experiment runs here: hypothesis, build, read-out',
      'Current tests in flight and which client each belongs to',
      'First task — read a live test and write up what it says',
    ],
  },
  {
    match: /market|content|social|brand/i,
    label: 'Marketing',
    afternoon: [
      'Channel access — social, ad accounts, scheduling tools',
      'Brand voice, the content calendar and what is already booked',
      'Current campaigns and who owns each',
      'First task — a small piece of content, reviewed before it ships',
    ],
  },
  {
    match: /business development|\bbd\b|sales|partnership|account/i,
    label: 'Business development',
    afternoon: [
      'CRM access and how the pipeline is kept',
      'Services walkthrough — what we sell and what we do not',
      'Current conversations and which are live',
      'Shadow a call, or read three recent proposals end to end',
    ],
  },
  {
    match: /\bhr\b|human resource|people|admin|operation/i,
    label: 'People & operations',
    afternoon: [
      'HR system access and what sits behind each module',
      'The HR Playbook (CVT-HR-PB-001) — the parts that govern this role',
      'Where the registers live and which are kept daily',
      'First task — shadow a live process end to end',
    ],
  },
  {
    match: /finance|account|payroll/i,
    label: 'Finance',
    afternoon: [
      'Accounting system and bank portal access, read-only to start',
      'The payroll calendar and what falls due when',
      'Where invoices, receipts and reconciliations are filed',
      'First task — reconcile a closed month alongside someone',
    ],
  },
]

const GENERIC: RoleTrack = {
  match: /.^/,
  label: 'Role',
  afternoon: [
    'Tools and system access for the role',
    'Walk through current work and who owns what',
    'How work is reviewed and what "finished" looks like here',
    'First task — something small and real, reviewed this week',
  ],
}

export function trackFor(input: Day1Input): RoleTrack {
  const hay = `${input.designation ?? ''} ${input.department ?? ''}`
  return TRACKS.find((t) => t.match.test(hay)) ?? GENERIC
}

const isIntern = (t?: string | null) =>
  !!t && /intern|trainee/i.test(t)

/**
 * A Day 1 schedule for this person.
 *
 * Times are the office's actual shape rather than a neat hourly grid — the
 * afternoon block is longer because that is where the role-specific work sits
 * and it always overruns.
 */
export function buildDay1Schedule(input: Day1Input): string {
  const track = trackFor(input)
  const manager = input.managerName ?? 'their manager'
  const first = input.fullName.trim().split(/\s+/)[0] || input.fullName

  const lines: string[] = []
  lines.push(`Day 1 — ${input.fullName}${input.designation ? `, ${input.designation}` : ''}`)
  lines.push('')
  lines.push('09:00   Arrive, desk and welcome coffee')
  lines.push(`09:30   Introductions — the team, then ${manager} one to one`)
  lines.push('10:00   HR orientation: contract, leave, attendance, pay dates')
  lines.push('10:45   Code of Conduct and the policies that need signing')
  lines.push('11:15   Office tour — kitchen, prayer area, meeting rooms, exits')
  lines.push('11:45   IT set-up: laptop, email, password manager, Slack')
  lines.push('13:00   Lunch with the team')
  lines.push('')
  lines.push(`14:00   ${track.label} induction`)
  for (const item of track.afternoon) lines.push(`        · ${item}`)
  lines.push('')

  if (isIntern(input.employeeType)) {
    // Interns get the learning frame said out loud on day one; nobody should
    // have to guess whether they are being assessed.
    lines.push('16:30   What the internship is for — what you will learn, how it is reviewed')
    lines.push(`17:00   Wrap-up with ${manager}: questions, and what tomorrow looks like`)
  } else {
    lines.push(`16:30   30/60/90 plan with ${manager} — what good looks like at each mark`)
    lines.push(`17:00   Wrap-up: questions, and what ${first}'s first week looks like`)
  }
  lines.push('')
  lines.push('Buddy for the first two weeks: ____________________')

  return lines.join('\n')
}
