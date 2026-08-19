/**
 * The events Convertt runs, and what each one usually needs.
 *
 * Starting a Mango Party from a blank form means retyping the same
 * refreshments, games and roles every year. These are starting points — every
 * field is editable once the event exists, so a preset is a head start rather
 * than a template that has to be obeyed.
 *
 * Dates are deliberately absent. Eid moves, the dinner is whenever it suits,
 * and a date filled in automatically and wrongly is worse than an empty one.
 */

export const EVENT_CATEGORIES = [
  'DINNER', 'EID', 'NATIONAL', 'SEASONAL', 'SPORTS',
  'TOWN_HALL', 'TRIP', 'TRAINING', 'PROMOTION', 'GENERAL',
] as const
export type EventCategory = (typeof EVENT_CATEGORIES)[number]

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  DINNER: 'Dinner', EID: 'Eid', NATIONAL: 'National day', SEASONAL: 'Seasonal',
  SPORTS: 'Sports', TOWN_HALL: 'Town hall', TRIP: 'Trip', TRAINING: 'Training',
  PROMOTION: 'Promotion', GENERAL: 'General',
}

export const EVENT_STATUSES = ['PLANNING', 'PROPOSED', 'APPROVED', 'HELD', 'CANCELLED'] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

export const STATUS_LABELS: Record<EventStatus, string> = {
  PLANNING: 'Planning', PROPOSED: 'Proposed', APPROVED: 'Approved',
  HELD: 'Held', CANCELLED: 'Cancelled',
}

export const STATUS_TONE: Record<EventStatus, string> = {
  PLANNING: 'bg-slate-50 text-slate-600 border-slate-200',
  PROPOSED: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  HELD: 'bg-sky-50 text-sky-800 border-sky-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
}

export const COST_CATEGORIES = [
  'REFRESHMENTS', 'DECORATION', 'PRIZES', 'VENUE', 'EQUIPMENT', 'OTHER',
] as const
export type CostCategory = (typeof COST_CATEGORIES)[number]

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  REFRESHMENTS: 'Refreshments', DECORATION: 'Decoration', PRIZES: 'Prizes',
  VENUE: 'Venue', EQUIPMENT: 'Equipment', OTHER: 'Other',
}

export interface EventPreset {
  key: string
  title: string
  category: EventCategory
  /** Roughly when it falls — a hint for the catalogue, not a date. */
  timing: string
  overview: string
  objectives: string
  refreshments?: string
  activities?: string
  rewards?: string
  decoration?: string
  runOfShow?: string
  requirements?: string
  successMetrics?: string
  whyItMatters?: string
  roles?: Array<{ role: string; headcount: number; responsibility: string }>
  costs?: Array<{ label: string; category: CostCategory; quantity: number; unitCost: number }>
}

const METRICS =
  'Attendance against total headcount\n'
  + 'Informal feedback on the day or a quick follow-up message\n'
  + 'Whether people mixed across teams rather than sticking to their own'

export const EVENT_PRESETS: EventPreset[] = [
  {
    key: 'company-dinner',
    title: 'Company Dinner',
    category: 'DINNER',
    timing: 'Any month',
    overview:
      'A sit-down dinner for the whole team away from the office — the one evening in '
      + 'the year where everybody is in the same room with nothing to deliver.',
    objectives:
      'Get the whole company in one room, including people who rarely overlap\n'
      + 'Mark what the year has delivered somewhere other than a meeting room\n'
      + 'Give the team an evening that feels like a thank-you rather than an obligation',
    refreshments: 'Full dinner menu\nSoft drinks and mocktails\nDessert',
    activities: 'Short address from leadership\nAwards and shout-outs\nMusic and open mingling',
    decoration: 'Reserved area with table settings and a small backdrop for photographs',
    runOfShow:
      '0:00-0:30 | Arrival and seating\n'
      + '0:30-0:45 | Welcome and a short address\n'
      + '0:45-1:45 | Dinner served\n'
      + '1:45-2:15 | Awards, shout-outs and photographs\n'
      + '2:15-2:30 | Closing and departures',
    requirements:
      'Venue booked and headcount confirmed\nMenu selected\nTransport for anyone who needs it',
    successMetrics: METRICS,
    whyItMatters:
      'The dinner is the event people remember the year by. It costs the most and it is '
      + 'the one nobody skips.',
    roles: [
      { role: 'Venue and booking', headcount: 1, responsibility: 'Reserve the venue, confirm headcount, settle the bill' },
      { role: 'Host', headcount: 1, responsibility: 'Run the evening and keep the schedule moving' },
      { role: 'Photography', headcount: 1, responsibility: 'Photographs on the night for the culture channel' },
    ],
    costs: [
      { label: 'Dinner per head', category: 'REFRESHMENTS', quantity: 25, unitCost: 2500 },
      { label: 'Venue booking', category: 'VENUE', quantity: 1, unitCost: 15000 },
      { label: 'Decoration and backdrop', category: 'DECORATION', quantity: 1, unitCost: 8000 },
    ],
  },
  {
    key: 'eid-ul-fitr',
    title: 'Eid ul-Fitr Celebration',
    category: 'EID',
    timing: 'After Ramadan',
    overview:
      'A short in-office celebration on the first working day back after Eid — sweets, '
      + 'Eidi for the team, and time to greet each other properly before work resumes.',
    objectives:
      'Mark Eid together rather than everyone returning straight to their desk\n'
      + 'Give people a moment to greet colleagues they have not seen over the break\n'
      + 'Keep it short enough that it does not eat the first day back',
    refreshments: 'Sweets and mithai\nTea and soft drinks\nSavoury snacks',
    activities: 'Eid greetings\nGroup photograph\nEidi envelopes for the team',
    rewards: 'Eidi envelopes',
    decoration: 'Eid banner, string lights and a small table setting in the common area',
    runOfShow:
      '0:00-0:15 | Greetings and refreshments\n'
      + '0:15-0:35 | Eidi distribution and group photograph\n'
      + '0:35-0:45 | Wind-down, back to work',
    requirements: 'Sweets ordered the day before\nEidi envelopes prepared\nEid decoration',
    successMetrics: METRICS,
    whyItMatters:
      'Coming back from Eid to nothing at all is flat. Forty-five minutes changes the '
      + 'tone of the whole first day back.',
    roles: [
      { role: 'Refreshments', headcount: 2, responsibility: 'Order sweets, set up and clear the table' },
      { role: 'Eidi', headcount: 1, responsibility: 'Prepare and hand out envelopes' },
    ],
    costs: [
      { label: 'Sweets and mithai', category: 'REFRESHMENTS', quantity: 1, unitCost: 8000 },
      { label: 'Eidi envelopes', category: 'PRIZES', quantity: 25, unitCost: 1000 },
      { label: 'Decoration', category: 'DECORATION', quantity: 1, unitCost: 3000 },
    ],
  },
  {
    key: 'eid-ul-adha',
    title: 'Eid ul-Adha Celebration',
    category: 'EID',
    timing: 'Dhul Hijjah',
    overview:
      'The same shape as the Eid ul-Fitr celebration, on the first working day back — '
      + 'greetings, refreshments and a group photograph before the day starts properly.',
    objectives:
      'Mark Eid together rather than each person returning to their desk alone\n'
      + 'Keep the return from a long break warm and short',
    refreshments: 'Sweets and mithai\nTea and soft drinks\nSavoury snacks',
    activities: 'Eid greetings\nGroup photograph',
    decoration: 'Eid banner and a small table setting in the common area',
    runOfShow:
      '0:00-0:15 | Greetings and refreshments\n'
      + '0:15-0:30 | Group photograph\n'
      + '0:30-0:45 | Wind-down, back to work',
    requirements: 'Sweets ordered the day before\nEid decoration',
    successMetrics: METRICS,
    roles: [
      { role: 'Refreshments', headcount: 2, responsibility: 'Order sweets, set up and clear the table' },
    ],
    costs: [
      { label: 'Sweets and mithai', category: 'REFRESHMENTS', quantity: 1, unitCost: 8000 },
      { label: 'Decoration', category: 'DECORATION', quantity: 1, unitCost: 3000 },
    ],
  },
  {
    key: 'mango-day',
    title: 'Mango Day',
    category: 'SEASONAL',
    timing: 'June to August',
    overview:
      'With mango season in full swing, a Mango Party for all Convertt staff — a light, '
      + 'fun, team-bonding afternoon combining seasonal refreshments with casual games '
      + 'and a small prize pool.',
    objectives:
      'Give the team a genuine, low-pressure break from day-to-day deadlines\n'
      + 'Encourage informal interaction between people who do not normally work together\n'
      + 'Build a small recurring culture moment tied to the mango season\n'
      + 'Keep the format simple and low-cost enough to run without disrupting the work day',
    refreshments:
      'Fresh cut mangoes, served throughout\n'
      + 'Mango shakes, prepared fresh on the day\n'
      + 'Mango juice, chilled, on arrival and mid-session',
    activities: 'Jhonya\nLudo\nUno\nCards (Taash)\nCarrom board',
    rewards:
      'Cash prize for the overall winner across the games\n'
      + 'Certificate of recognition presented alongside it',
    decoration:
      'Simple mango and summer themed decoration for the seating and games area — '
      + 'balloons, banners or table runners in mango-yellow and green\n'
      + 'Designated zones: one refreshments table, two or three games clusters, and an open mingling area',
    runOfShow:
      '0:00-0:10 | Welcome, brief kickoff, refreshments open\n'
      + '0:10-1:00 | Games run in parallel across stations, free mingling and rotation\n'
      + '1:00-1:15 | Wind-down, last refreshment round, volunteers tally results\n'
      + '1:15-1:30 | Prize distribution and closing remarks',
    requirements:
      'Mangoes, milk and ice ordered the morning of\nBlender and glasses\n'
      + 'Board games gathered from the office\nCertificate printed',
    successMetrics: METRICS,
    whyItMatters:
      'Small, informal events like this cost little but go a long way in keeping morale '
      + 'up between project deadlines. It is a low-effort, high-goodwill initiative that '
      + 'fits naturally into Convertt culture.',
    roles: [
      { role: 'Refreshments volunteers', headcount: 3, responsibility: 'Prep, serving and cleanup on the day' },
      { role: 'Games coordination', headcount: 2, responsibility: 'Run the stations, rotate people through, tally wins' },
      { role: 'Decoration', headcount: 2, responsibility: 'Set up the area beforehand and clear it after' },
    ],
    costs: [
      { label: 'Mangoes', category: 'REFRESHMENTS', quantity: 1, unitCost: 6000 },
      { label: 'Milk, ice and sundries for shakes', category: 'REFRESHMENTS', quantity: 1, unitCost: 2500 },
      { label: 'Winner cash prize', category: 'PRIZES', quantity: 1, unitCost: 2000 },
      { label: 'Decoration', category: 'DECORATION', quantity: 1, unitCost: 2500 },
    ],
  },
  {
    key: 'independence-day',
    title: 'Independence Day',
    category: 'NATIONAL',
    timing: '14 August',
    overview:
      'A short green-and-white morning in the office to mark Independence Day — '
      + 'refreshments, a photograph and a nod to the day before work carries on.',
    objectives:
      'Mark the day together as a team\nKeep it brief and in the flow of the working day',
    refreshments: 'Green and white themed sweets\nTea and soft drinks',
    activities: 'Group photograph in green and white\nNational anthem\nBest-dressed shout-out',
    decoration: 'Flags, buntings and green-and-white balloons across the common area',
    runOfShow:
      '0:00-0:10 | Gather, anthem\n'
      + '0:10-0:30 | Refreshments and photographs\n'
      + '0:30-0:40 | Shout-outs and back to work',
    requirements:
      'Flags and buntings\nThemed sweets ordered\nDress-code message sent the week before',
    successMetrics: METRICS,
    roles: [
      { role: 'Decoration', headcount: 2, responsibility: 'Put up flags and buntings before anyone arrives' },
      { role: 'Refreshments', headcount: 1, responsibility: 'Order and lay out the sweets' },
    ],
    costs: [
      { label: 'Flags, buntings and balloons', category: 'DECORATION', quantity: 1, unitCost: 4000 },
      { label: 'Themed sweets', category: 'REFRESHMENTS', quantity: 1, unitCost: 5000 },
    ],
  },
  {
    key: 'labour-day',
    title: 'Labour Day',
    category: 'NATIONAL',
    timing: '1 May',
    overview:
      'A public holiday rather than an event. Kept here so the closure notice and the '
      + 'attendance marking are planned alongside everything else.',
    objectives: 'Close the office and tell everyone in good time',
    requirements: 'Closure notice sent\nHoliday applied to the attendance calendar',
    successMetrics: 'Notice went out before the day, and attendance shows the holiday',
    roles: [
      { role: 'Notice', headcount: 1, responsibility: 'Send the closure notice and apply the holiday' },
    ],
  },
  {
    key: 'padel-day',
    title: 'Padel Day',
    category: 'SPORTS',
    timing: 'Any month',
    overview:
      'Court booking for the team — a couple of hours of padel, rotating so everyone '
      + 'plays regardless of whether they have held a racket before.',
    objectives:
      'Get people moving and out of the office together\n'
      + 'Mix teams up by rotating pairs rather than letting the usual groups form\n'
      + 'Keep it playable for beginners',
    refreshments: 'Water and sports drinks\nSnacks after play',
    activities: 'Rotating doubles across the booked courts\nShort knockout at the end',
    rewards: 'Small prize for the winning pair',
    runOfShow:
      '0:00-0:15 | Arrival, pairing and warm-up\n'
      + '0:15-1:30 | Rotating doubles across courts\n'
      + '1:30-2:00 | Knockout and prize',
    requirements: 'Courts booked\nRackets arranged for anyone without\nWater and snacks',
    successMetrics: METRICS,
    roles: [
      { role: 'Booking', headcount: 1, responsibility: 'Book courts, confirm numbers, settle the bill' },
      { role: 'Pairing and rotation', headcount: 1, responsibility: 'Keep the rotation fair and moving' },
    ],
    costs: [
      { label: 'Court booking per hour', category: 'VENUE', quantity: 4, unitCost: 4000 },
      { label: 'Racket hire', category: 'EQUIPMENT', quantity: 6, unitCost: 500 },
      { label: 'Water and snacks', category: 'REFRESHMENTS', quantity: 1, unitCost: 4000 },
      { label: 'Winning pair prize', category: 'PRIZES', quantity: 1, unitCost: 3000 },
    ],
  },
  {
    key: 'cricket-day',
    title: 'Cricket Day',
    category: 'SPORTS',
    timing: 'Any month',
    overview:
      'A ground booking and a short tape-ball tournament — teams drawn across '
      + 'departments so nobody plays only with the people they sit next to.',
    objectives:
      'Get the company outside together for an afternoon\n'
      + 'Draw teams across departments rather than by team\n'
      + 'Keep the format short enough that everyone bats and bowls',
    refreshments: 'Water and soft drinks throughout\nFood after the final',
    activities: 'Short-format tape-ball matches\nFinal between the top two sides',
    rewards: 'Winning team prize\nMan of the match',
    runOfShow:
      '0:00-0:20 | Arrival, team draw, warm-up\n'
      + '0:20-2:00 | League matches\n'
      + '2:00-2:45 | Final\n'
      + '2:45-3:00 | Prizes and photographs',
    requirements:
      'Ground booked\nTape balls and bats\nStumps and scoreboard\nFood ordered for after',
    successMetrics: METRICS,
    roles: [
      { role: 'Ground booking', headcount: 1, responsibility: 'Book the ground and settle the bill' },
      { role: 'Umpiring and scoring', headcount: 2, responsibility: 'Umpire, keep score, run the draw' },
      { role: 'Refreshments', headcount: 2, responsibility: 'Water through the day, food after the final' },
    ],
    costs: [
      { label: 'Ground booking', category: 'VENUE', quantity: 1, unitCost: 12000 },
      { label: 'Tape balls and equipment', category: 'EQUIPMENT', quantity: 1, unitCost: 4000 },
      { label: 'Water and food', category: 'REFRESHMENTS', quantity: 25, unitCost: 600 },
      { label: 'Winning team and man of the match', category: 'PRIZES', quantity: 1, unitCost: 6000 },
    ],
  },
]

export function presetByKey(key: string): EventPreset | undefined {
  return EVENT_PRESETS.find((p) => p.key === key)
}
