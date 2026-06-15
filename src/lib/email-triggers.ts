/**
 * Email trigger engine.
 *
 * Public API:
 *   triggerEmail({ event, employeeId?, candidateId?, variables, ... })
 *
 * Matches all active EmailTemplate rows whose triggerEvent contains `event`
 * (supporting "a | b | c" multi-trigger templates), evaluates the template
 * condition, applies guards (business hours / weekends / dedupe / manual
 * review / fraud alert / never-instant-after-interview), substitutes
 * [Placeholder] variables, and creates an EmailSend row.
 *
 * Idempotent: a `dedupeKey` derived from (subject, template_id, conditionContext)
 * prevents duplicate sends for the same event.
 */

import { prisma } from '@/lib/prisma'
import { PK_HOLIDAYS_2026 } from '@/lib/pk-holidays'

export interface TriggerContext {
  event: string
  employeeId?: string
  candidateId?: string
  variables: Record<string, string>
  createdById?: string
  /** Used by condition expressions, e.g. { stage: 'shortlisted' } */
  conditionContext?: Record<string, unknown>
  /** Optional override of the dedupe component beyond default subject/template_id. */
  dedupeSalt?: string
}

interface ResolvedRecipient {
  email: string
  employeeId?: string
  candidateId?: string
}

const BUSINESS_HOURS_START = 9
const BUSINESS_HOURS_END = 18

/* ───────────────── helpers ───────────────── */

/** Match `template.triggerEvent` against `event`. Handles "a | b | c". */
function eventMatches(triggerEvent: string | null | undefined, event: string): boolean {
  if (!triggerEvent) return false
  const parts = triggerEvent.split('|').map((s) => s.trim()).filter(Boolean)
  return parts.includes(event)
}

/**
 * Very small expression evaluator. Supports:
 *   - "always" → always true
 *   - "<key> == 'value'" or "<key> == \"value\""
 *   - "<key> == true" / "<key> == false"
 *   - "<key> in ['a','b']"
 *   - "<key> >= <number>"
 *   - chained " && " (AND) and " || " (OR)
 *
 * Returns true if condition is null/undefined/"always".
 * Returns true if expression can't be parsed (best-effort — better to draft than skip).
 */
export function evaluateCondition(
  condition: string | null | undefined,
  ctx: Record<string, unknown> = {},
): boolean {
  if (!condition) return true
  const c = condition.trim()
  if (!c || c.toLowerCase() === 'always') return true

  // Split on OR first (lower precedence)
  if (c.includes(' || ')) {
    return c.split(' || ').some((part) => evaluateCondition(part, ctx))
  }
  if (c.includes(' && ')) {
    return c.split(' && ').every((part) => evaluateCondition(part, ctx))
  }

  // === operator: equality
  let m = c.match(/^([A-Za-z_][\w.]*)\s*==\s*(.+)$/)
  if (m) {
    const key = m[1]
    const rhs = m[2].trim()
    const lhs = ctx[key]
    if (rhs === 'true') return lhs === true
    if (rhs === 'false') return lhs === false
    if (/^-?\d+(\.\d+)?$/.test(rhs)) return Number(lhs) === Number(rhs)
    const strMatch = rhs.match(/^['"](.*)['"]$/)
    if (strMatch) return String(lhs) === strMatch[1]
    return false
  }

  // >= <number>
  m = c.match(/^([A-Za-z_][\w.]*)\s*>=\s*(.+)$/)
  if (m) {
    const lhs = Number(ctx[m[1]])
    const rhs = Number(m[2])
    if (!Number.isFinite(lhs) || !Number.isFinite(rhs)) return false
    return lhs >= rhs
  }
  m = c.match(/^([A-Za-z_][\w.]*)\s*>\s*(.+)$/)
  if (m) {
    const lhs = Number(ctx[m[1]])
    const rhs = Number(m[2])
    if (!Number.isFinite(lhs) || !Number.isFinite(rhs)) return false
    return lhs > rhs
  }

  // in [list]
  m = c.match(/^([A-Za-z_][\w.]*)\s+in\s+\[(.+)\]$/)
  if (m) {
    const lhs = ctx[m[1]]
    const list = m[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    return list.includes(String(lhs))
  }

  // Unparseable — best-effort accept
  return true
}

/** Substitute [Placeholder] (square-bracket vars from the JSON library). */
export function substituteSquareBracketVars(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\[([^\]]+)\]/g, (full, key) => {
    const trimmed = String(key).trim()
    // Skip known structural markers like INVITE: / CONFIRM: that aren't vars
    if (/^[A-Z]+:/.test(trimmed)) return full
    if (vars[trimmed] != null) return vars[trimmed]
    return full // leave intact so HR sees what needs filling
  })
}

function isWeekend(d: Date): boolean {
  const dow = d.getDay()
  return dow === 0 || dow === 6
}

function isPKHoliday(d: Date): boolean {
  const iso = d.toISOString().slice(0, 10)
  return PK_HOLIDAYS_2026.some((h) => h.date === iso)
}

/** Push date forward to next business day (skipping weekends + PK holidays). */
function nextBusinessDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(BUSINESS_HOURS_START, 0, 0, 0)
  while (isWeekend(out) || isPKHoliday(out)) {
    out.setDate(out.getDate() + 1)
  }
  return out
}

/** Returns next valid business-hours slot, or null if already in window. */
function applyBusinessHours(now: Date): Date | null {
  const d = new Date(now)
  if (isWeekend(d) || isPKHoliday(d)) return nextBusinessDay(d)
  const h = d.getHours()
  if (h < BUSINESS_HOURS_START) {
    d.setHours(BUSINESS_HOURS_START, 0, 0, 0)
    return d
  }
  if (h >= BUSINESS_HOURS_END) {
    d.setDate(d.getDate() + 1)
    return nextBusinessDay(d)
  }
  return null
}

/* ───────────────── recipient resolution ───────────────── */

async function resolveRecipient(
  employeeId?: string,
  candidateId?: string,
  varEmail?: string,
): Promise<ResolvedRecipient | null> {
  if (employeeId) {
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, email: true },
    })
    if (emp) {
      const e = emp.email || varEmail
      if (e) return { email: e, employeeId }
    }
  }
  if (candidateId) {
    const cand = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true, email: true, fullName: true },
    })
    if (cand?.email) return { email: cand.email, candidateId }
  }
  if (varEmail) return { email: varEmail, employeeId, candidateId }
  return null
}

/* ───────────────── guards ───────────────── */

interface GuardResult {
  status: 'DRAFT' | 'QUEUED' | 'SUPPRESSED'
  scheduledFor: Date | null
  fraudFlag: boolean
}

async function applyGuards(
  guards: string[],
  manualReview: boolean,
  event: string,
  ctx: TriggerContext,
): Promise<GuardResult> {
  let scheduledFor: Date | null = null
  let fraudFlag = false
  let status: 'DRAFT' | 'QUEUED' | 'SUPPRESSED' = manualReview ? 'DRAFT' : 'QUEUED'

  const now = new Date()

  for (const g of guards) {
    if (g === 'manual_review') status = 'DRAFT'

    if (g === 'never_instant_after_interview' && event === 'candidate.rejected' && ctx.candidateId) {
      // If candidate had an interview within last 2h, push to 2h from now
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
      const recent = await prisma.interview.findFirst({
        where: { candidateId: ctx.candidateId, scheduledAt: { gte: twoHoursAgo } },
        orderBy: { scheduledAt: 'desc' },
      })
      if (recent) {
        scheduledFor = new Date(now.getTime() + 2 * 60 * 60 * 1000)
      }
    }

    if (g === 'business_hours' || g === 'business_hours_optional') {
      const adj = applyBusinessHours(scheduledFor || now)
      if (adj) scheduledFor = adj
    }

    if (g === 'suppress_weekends_holidays') {
      const target = scheduledFor || now
      if (isWeekend(target) || isPKHoliday(target)) {
        scheduledFor = nextBusinessDay(target)
      }
    }

    if (g === 'fraud_alert_if_not_self_requested') {
      const selfRequested = ctx.conditionContext?.selfRequested === true
      if (!selfRequested) fraudFlag = true
    }

    // dedupe — handled separately via dedupeKey
  }

  return { status, scheduledFor, fraudFlag }
}

/* ───────────────── main entry point ───────────────── */

export async function triggerEmail(ctx: TriggerContext): Promise<void> {
  try {
    const templates = await prisma.emailTemplate.findMany({
      where: { active: true },
    })

    const matched = templates.filter((t) => eventMatches(t.triggerEvent, ctx.event))
    if (matched.length === 0) {
      // No matching templates — nothing to do (not an error)
      return
    }

    for (const tpl of matched) {
      try {
        // Condition check
        if (!evaluateCondition(tpl.condition, ctx.conditionContext || {})) continue

        // Recipient
        const recipient = await resolveRecipient(
          ctx.employeeId,
          ctx.candidateId,
          ctx.variables['Email'] || ctx.variables['email'],
        )
        if (!recipient) {
          console.warn(`[email-trigger] No recipient resolvable for ${tpl.id} (${ctx.event})`)
          continue
        }

        // Dedupe key
        const subjectKey = recipient.employeeId || recipient.candidateId || recipient.email
        const saltExtra = ctx.dedupeSalt || JSON.stringify(ctx.conditionContext || {})
        const dedupeKey = `${subjectKey}:${tpl.id}:${saltExtra}`.slice(0, 250)

        const existing = await prisma.emailSend.findUnique({ where: { dedupeKey } })
        if (existing) continue

        // Guards
        const guards: string[] = tpl.guards ? safeJsonArray(tpl.guards) : []
        const guardResult = await applyGuards(guards, tpl.manualReview, ctx.event, ctx)

        // Substitute variables
        const subject = substituteSquareBracketVars(tpl.subject, ctx.variables)
        const body = substituteSquareBracketVars(tpl.body, ctx.variables)

        await prisma.emailSend.create({
          data: {
            templateId: tpl.id,
            toEmployeeId: recipient.employeeId || null,
            toCandidateId: recipient.candidateId || null,
            toEmail: recipient.email,
            subject,
            body,
            status: guardResult.status,
            scheduledFor: guardResult.scheduledFor,
            dedupeKey,
            eventName: ctx.event,
            eventPayload: ctx.conditionContext ? JSON.stringify(ctx.conditionContext) : null,
            createdById: ctx.createdById || null,
          },
        })

        if (guardResult.fraudFlag && recipient.employeeId) {
          try {
            await prisma.notification.create({
              data: {
                employeeId: recipient.employeeId,
                type: 'ANOMALY',
                title: `Fraud check: ${tpl.name || tpl.id}`,
                message: `${ctx.event} for ${subjectKey} not self-initiated — please verify.`,
              },
            })
          } catch { /* ignore */ }
        }

        console.log(`[email-trigger] ${tpl.id} (${ctx.event}) → ${guardResult.status} for ${recipient.email}`)
      } catch (innerErr) {
        console.error(`[email-trigger] template ${tpl.id} failed:`, innerErr)
      }
    }
  } catch (err) {
    // Never throw — trigger calls are best-effort side-effects
    console.error('[email-trigger] failed', err)
  }
}

function safeJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

/* ───────────────── small helpers for callers ───────────────── */

/** Common variable bundle for employee-targeted emails. */
export function employeeVars(emp: {
  fullName?: string | null
  designation?: string | null
  department?: { name: string } | null
}): Record<string, string> {
  const first = (emp.fullName || '').split(' ')[0] || ''
  return {
    'Employee Name': emp.fullName || '',
    'Employee First Name': first,
    'First Name': first,
    'Full Name': emp.fullName || '',
    'Designation': emp.designation || '',
    'Job Title': emp.designation || '',
    'Department': emp.department?.name || '',
    'Your Name': 'HR Team',
  }
}

/** Common variable bundle for candidate-targeted emails. */
export function candidateVars(cand: {
  fullName?: string | null
  jobTitle?: string | null
}): Record<string, string> {
  const full = cand.fullName || ''
  const first = full.split(' ')[0] || ''
  return {
    'Candidate Name': full,
    'Candidate First Name': first,
    'First Name': first,
    'Full Name': full,
    'Job Title': cand.jobTitle || '',
    'Your Name': 'HR Team',
  }
}
