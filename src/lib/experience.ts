/**
 * Journeys — the guided, step-by-step experiences people take: onboarding,
 * transition to management, anything HR builds.
 *
 * Distinct from EmployeeJourney, which is HR's business-process task list for
 * joiners and leavers. A journey here is written for the person walking it:
 * modules of steps — read this, open that course, do this task — some
 * required with a due date, some recommended. Modelled on Workday Journeys.
 *
 * Free of server imports so client components share the vocabulary.
 */

export const STEP_TYPES = [
  { value: 'ARTICLE', label: 'Article', verb: 'Read article' },
  { value: 'TEXT', label: 'Text', verb: null },
  { value: 'LINK', label: 'Link', verb: 'Open link' },
  { value: 'VIDEO', label: 'Video', verb: 'Watch video' },
  { value: 'LEARNING', label: 'Learning', verb: 'Open learning' },
  { value: 'TASK', label: 'Task', verb: 'Go to task' },
] as const
export type StepType = (typeof STEP_TYPES)[number]['value']
export const STEP_TYPE_VALUES = STEP_TYPES.map((t) => t.value) as readonly string[]
export function stepTypeOf(v: string) {
  return STEP_TYPES.find((t) => t.value === v) ?? STEP_TYPES[1]
}

export const JOURNEY_STATUSES = ['DRAFT', 'PUBLISHED'] as const

export const AUTO_ASSIGN = [
  { value: '', label: 'Only when HR distributes it' },
  { value: 'ONBOARDING', label: 'Every new joiner, when HR starts their onboarding' },
  { value: 'NEW_MANAGER', label: 'Anyone who gets their first direct report' },
] as const
export const AUTO_ASSIGN_VALUES = ['ONBOARDING', 'NEW_MANAGER'] as const

export const ASSIGN_METHOD_LABEL: Record<string, string> = {
  MANUAL: 'Chosen people',
  DEPARTMENT: 'A department',
  MANAGERS: 'All managers',
  EVERYONE: 'Everyone',
  AUTO_ONBOARDING: 'Automatic — onboarding',
  AUTO_NEW_MANAGER: 'Automatic — new manager',
}

/** Full class strings, so Tailwind keeps them. */
export const BANNER_TONES: Record<string, { label: string; gradient: string; ink: string }> = {
  blue: { label: 'Blue', gradient: 'from-sky-200 via-blue-200 to-indigo-300', ink: '#1d4ed8' },
  green: { label: 'Green', gradient: 'from-emerald-200 via-teal-200 to-cyan-200', ink: '#047857' },
  amber: { label: 'Amber', gradient: 'from-amber-100 via-amber-200 to-orange-300', ink: '#b45309' },
  rose: { label: 'Rose', gradient: 'from-rose-100 via-pink-200 to-rose-300', ink: '#be123c' },
  violet: { label: 'Violet', gradient: 'from-violet-200 via-purple-200 to-fuchsia-300', ink: '#6d28d9' },
}
export function toneOf(key: string | null | undefined) {
  return BANNER_TONES[key ?? 'blue'] ?? BANNER_TONES.blue
}

export interface TemplateStep {
  title: string
  body?: string
  type: StepType
  /** "{profile}" becomes the person's own profile link when the journey is taken. */
  url?: string
  /** For LEARNING: a word to find the course by title; falls back to a link to Learning. */
  learningTitle?: string
  required: boolean
  dueDays?: number
  minutes?: number
}
export interface TemplateModule {
  title: string
  description?: string
  steps: TemplateStep[]
}
export type TemplateKey = 'ONBOARDING' | 'NEW_MANAGER'

/**
 * Starting points HR edits. The steps point at parts of Convertt HR that
 * exist; nothing here states a company fact HR has not written.
 */
export const JOURNEY_TEMPLATES: Record<TemplateKey, { title: string; description: string; tone: string; modules: TemplateModule[] }> = {
  ONBOARDING: {
    title: 'Onboarding',
    description: 'Welcome to Convertt. Take these steps one at a time — the paperwork first, then how things work here, then settling in.',
    tone: 'blue',
    modules: [
      {
        title: 'Preboarding',
        description: 'Before your first day — the paperwork and the basics, so day one can be about people.',
        steps: [
          { title: 'Complete your profile', type: 'TASK', url: '{profile}', required: true, dueDays: 3, minutes: 10,
            body: 'Check your personal details, emergency contact and bank details. Payroll and HR use them, so they need to be right.' },
          { title: 'Upload your documents', type: 'TASK', url: '{profile}?tab=documents', required: true, dueDays: 5, minutes: 10,
            body: 'Your CNIC, a photo, and your education and experience certificates go on your profile.' },
          { title: 'Read the company policies', type: 'LINK', url: '/dashboard/policies', required: true, dueDays: 7, minutes: 20,
            body: 'The policies that apply to you. Some ask you to acknowledge that you have read them.' },
        ],
      },
      {
        title: 'Orientation',
        description: 'Your first days: how the everyday things work, and where to go when you are stuck.',
        steps: [
          { title: 'What to expect on day one', type: 'TEXT', required: true, dueDays: 1, minutes: 3,
            body: 'Your manager and HR will walk you through your role, your team and your first week. Ask anything — nobody expects you to know how things work yet.' },
          { title: 'Set up your time clock', type: 'TASK', url: '/dashboard/time', required: true, dueDays: 1, minutes: 5,
            body: 'Clock in and out from Time Tracking each day, onsite or working from home.' },
          { title: 'Know your leave', type: 'LINK', url: '/dashboard/leave', required: true, dueDays: 7, minutes: 5,
            body: 'See the leave you have and how to apply for it.' },
          { title: 'Find your way around the Help Center', type: 'LINK', url: '/dashboard/help', required: true, dueDays: 7, minutes: 5,
            body: 'Most answers are here. When they are not, create a case and HR picks it up.' },
        ],
      },
      {
        title: 'First Week',
        description: 'You have finished your orientation — now the real work begins. You may still have questions as you settle into your role; here are some steps that may help.',
        steps: [
          { title: 'Learn about mentoring', type: 'LINK', url: '/dashboard/career', required: false, minutes: 5,
            body: 'Colleagues who are strong in what you want to learn, and how to reach them.' },
          { title: 'Get to know the team', type: 'LINK', url: '/dashboard/org-chart', required: false, minutes: 5,
            body: 'Who does what, and who reports to whom.' },
          { title: 'People & culture', type: 'LINK', url: '/dashboard/culture', required: false, minutes: 5,
            body: 'Events, recognition, birthdays and the pulse survey.' },
        ],
      },
    ],
  },
  NEW_MANAGER: {
    title: 'Transition to Management',
    description: 'People report to you now. These steps cover what changes, the expectations of a people leader, and the parts of Convertt HR you now own.',
    tone: 'green',
    modules: [
      {
        title: 'Introduction to Management',
        description: 'What changes when people report to you, and what is expected of the people who lead them.',
        steps: [
          { title: 'First Time Manager Training', type: 'LEARNING', learningTitle: 'manager', required: true, dueDays: 5, minutes: 30,
            body: 'Learning all the ropes of management at once is hard. This course gives you the basics of leading a team and the expectations placed on people leaders.' },
          { title: 'Code of Conduct', type: 'LINK', url: '/dashboard/policies', required: true, dueDays: 14, minutes: 15,
            body: 'As a manager you apply the code as well as follow it. Read it again with that in mind.' },
        ],
      },
      {
        title: 'Running Your Team',
        description: 'The parts of Convertt HR that now wait on you.',
        steps: [
          { title: 'Approve leave and work from home', type: 'TASK', url: '/dashboard/leave', required: true, dueDays: 7, minutes: 5,
            body: 'Requests from your team come to you. Approve them, or reject with a reason they can act on.' },
          { title: 'Hold your first check-ins', type: 'TASK', url: '/dashboard/team-insights', required: true, dueDays: 14, minutes: 15,
            body: 'Schedule a one-to-one with each person, add what you want to discuss, and record what was agreed.' },
          { title: 'Goals, reviews and appraisals', type: 'LINK', url: '/dashboard/performance', required: true, dueDays: 21, minutes: 10,
            body: 'How goals are set and how reviews and appraisal forms work for your team.' },
        ],
      },
      {
        title: 'Tips for New People Leaders',
        description: 'Recommended reading once the essentials are done.',
        steps: [
          { title: 'Performance & Show Cause guide', type: 'ARTICLE', url: '/dashboard/help/performance', required: false, minutes: 8 },
          { title: 'Leave management guide', type: 'ARTICLE', url: '/dashboard/help/leave', required: false, minutes: 6 },
          { title: 'Grow your people', type: 'LINK', url: '/dashboard/team-insights', required: false, minutes: 5,
            body: 'Suggest mentors and flex teams to your reports, and plan their development.' },
        ],
      },
    ],
  },
}
