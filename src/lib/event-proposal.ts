/**
 * The event proposal, built from the plan rather than written beside it.
 *
 * The Mango Party proposal that went to the CEO was a Word document typed by
 * hand: overview, objectives, what was included, decoration, a run of show,
 * roles with headcounts, a budget and success metrics. Every one of those is a
 * field on the event now, so the document is a rendering of the plan. Change
 * the plan and regenerate — the two cannot drift.
 *
 * The output is plain text on purpose. It goes on screen, into the clipboard,
 * and into a print view without a second template to keep in step.
 */

import { COST_CATEGORY_LABELS, type CostCategory } from '@/lib/event-presets'

export const COMPANY_NAME = 'CONVERTT'
export const COMPANY_ADDRESS = 'Mega Tower, Main Boulevard Gulberg, Lahore'

export interface ProposalCost {
  label: string
  category: string
  quantity: number
  unitCost: number
  actual?: number | null
}

export interface ProposalRole {
  role: string
  headcount: number
  responsibility?: string | null
  personName?: string | null
}

export interface ProposalInput {
  title: string
  category: string
  eventDate?: Date | string | null
  startTime?: string | null
  endTime?: string | null
  location?: string | null
  expectedGuests?: number | null
  overview?: string | null
  objectives?: string | null
  refreshments?: string | null
  activities?: string | null
  rewards?: string | null
  decoration?: string | null
  runOfShow?: string | null
  requirements?: string | null
  successMetrics?: string | null
  whyItMatters?: string | null
  notes?: string | null
  currency?: string | null
  costs?: ProposalCost[]
  roles?: ProposalRole[]
  financeOwnerName?: string | null
  proposedByName?: string | null
}

const TBC = '[To be confirmed]'

function money(n: number, currency: string): string {
  return `${currency} ${n.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`
}

function longDate(d: Date | string | null | undefined): string {
  if (!d) return TBC
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return TBC
  return date.toLocaleDateString('en-GB', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

/** Lines of a multi-line field, blank ones dropped. */
function lines(v: string | null | undefined): string[] {
  if (!v) return []
  return v.split('\n').map((s) => s.trim()).filter(Boolean)
}

function bullets(v: string | null | undefined): string {
  return lines(v).map((l) => `  • ${l}`).join('\n')
}

/** A section only appears when it has something to say. */
function section(heading: string, body: string): string {
  return body.trim() ? `${heading}\n\n${body}\n` : ''
}

export function eventCostTotal(costs: ProposalCost[] | undefined): number {
  return (costs ?? []).reduce((n, c) => n + (c.quantity || 0) * (c.unitCost || 0), 0)
}

export function eventActualTotal(costs: ProposalCost[] | undefined): number {
  return (costs ?? []).reduce((n, c) => n + (c.actual ?? 0), 0)
}

/** Whether any line has a real spend recorded against it. */
export function hasActuals(costs: ProposalCost[] | undefined): boolean {
  return (costs ?? []).some((c) => c.actual != null)
}

export function buildProposal(input: ProposalInput): string {
  const currency = input.currency || 'PKR'
  const costs = input.costs ?? []
  const roles = input.roles ?? []
  const budget = eventCostTotal(costs)

  const when = input.startTime && input.endTime
    ? `${input.startTime} – ${input.endTime}`
    : input.startTime
      ? `From ${input.startTime}`
      : `${TBC} — suggest a window during a lighter work slot`

  const out: string[] = []

  out.push(COMPANY_NAME)
  out.push(COMPANY_ADDRESS)
  out.push('')
  out.push(`EVENT PROPOSAL — ${input.title.toUpperCase()}`)
  out.push('')

  out.push(section('Overview', input.overview?.trim() ?? ''))
  out.push(section('Objectives', bullets(input.objectives)))

  // "What's included" gathers the three things a reader wants in one place
  // rather than as three headings that each hold one line.
  const included: string[] = []
  if (lines(input.refreshments).length) {
    included.push('Refreshments\n' + bullets(input.refreshments))
  }
  if (lines(input.activities).length) {
    included.push('Games and activities\n' + bullets(input.activities))
  }
  if (lines(input.rewards).length) {
    included.push('Rewards\n' + bullets(input.rewards))
  }
  out.push(section("What's included", included.join('\n\n')))

  out.push(section('Decoration and set-up', bullets(input.decoration)))

  if (lines(input.runOfShow).length) {
    const rows = lines(input.runOfShow).map((l) => {
      const [time, ...rest] = l.split('|')
      return rest.length
        ? `  ${time.trim().padEnd(14)}${rest.join('|').trim()}`
        : `  ${l}`
    })
    out.push(section('Run of show', rows.join('\n')))
  }

  if (roles.length) {
    const rows = roles.map((r) => {
      const who = r.personName ? ` — ${r.personName}` : ''
      const head = r.headcount > 1 ? ` (${r.headcount})` : ''
      return `  ${r.role}${head}${who}\n      ${r.responsibility ?? ''}`.trimEnd()
    })
    out.push(section('Roles and responsibilities', rows.join('\n')))
  }

  out.push(section('What needs arranging', bullets(input.requirements)))

  // Financials. The table is the part the CEO actually reads, so it carries
  // the line, its quantity, the unit cost and the line total — and the actual
  // beside it once the money has been spent.
  if (costs.length) {
    const withActuals = hasActuals(costs)
    const rows = costs.map((c) => {
      const line = (c.quantity || 0) * (c.unitCost || 0)
      const label = COST_CATEGORY_LABELS[c.category as CostCategory] ?? c.category
      const base = `  ${c.label} (${label})`.padEnd(46)
        + `${c.quantity} × ${money(c.unitCost, currency)}`.padStart(24)
        + money(line, currency).padStart(16)
      return withActuals
        ? base + (c.actual != null ? money(c.actual, currency) : '—').padStart(16)
        : base
    })
    const header = withActuals
      ? '  Line'.padEnd(46) + 'Rate'.padStart(24) + 'Estimated'.padStart(16) + 'Actual'.padStart(16)
      : '  Line'.padEnd(46) + 'Rate'.padStart(24) + 'Estimated'.padStart(16)
    const totalRow = withActuals
      ? '  Total'.padEnd(70) + money(budget, currency).padStart(16)
        + money(eventActualTotal(costs), currency).padStart(16)
      : '  Total'.padEnd(70) + money(budget, currency).padStart(16)
    out.push(section('Financials', [header, ...rows, '', totalRow].join('\n')))
  }

  const financeLine = input.financeOwnerName
    ? `${input.financeOwnerName} is handling the spend on the day — buying, keeping receipts and reconciling afterwards.`
    : 'Nobody has been named to handle the spend yet.'
  out.push(section('Who handles the money', `  ${financeLine}`))

  const notes = [
    `  Date              ${longDate(input.eventDate)}`,
    `  Time              ${when}`,
    `  Venue             ${input.location || `${COMPANY_ADDRESS} (office premises)`}`,
    `  Expected turnout  ${input.expectedGuests ? `${input.expectedGuests} people` : `${TBC} — drives quantities and budget`}`,
    roles.length
      ? `  Volunteers        ${roles.reduce((n, r) => n + (r.headcount || 0), 0)} across ${roles.length} roles`
      : '',
    input.notes?.trim() ? `\n  ${input.notes.trim()}` : '',
  ].filter(Boolean).join('\n')
  out.push(section('Notes', notes))

  out.push(section('Success metrics', bullets(input.successMetrics)))
  out.push(section('Why this matters', input.whyItMatters?.trim() ?? ''))

  out.push(section('Approval', [
    `  Proposed by:  ${input.proposedByName ?? '___________________'}`,
    '  Date:         ___________________',
    '',
    '  Approved by:  ___________________',
    '  Date:         ___________________',
  ].join('\n')))

  out.push(`Prepared by ${input.proposedByName ?? 'HR'} — ${COMPANY_NAME}`)

  return out.filter((s) => s !== '').join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
