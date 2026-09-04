/**
 * Nothing is worked until the requisition is authorised.
 *
 * The Manpower Requisition Form says it itself: "All the requisitions will be
 * processed only after the necessary approvals." Until now the app ignored
 * that — a JD could be generated, a post published and candidates screened
 * against a role nobody had signed off. That is unauthorised headcount, and
 * the form exists to prevent exactly it.
 *
 * Three decisions, taken deliberately:
 *
 * 1. The form is the requisition. A "request to hire" and a "requisition" were
 *    the same JobRequisition row at two statuses, under two menu entries, and
 *    the form was a third name for the same thing. One record, one list.
 *
 * 2. The gate is on the work, not the record. Creating and editing a
 *    requisition stays open — that is how the form gets filled. What is gated
 *    is everything downstream that spends money or reaches a candidate.
 *
 * 3. Everything that existed before this shipped is grandfathered. Thirteen
 *    live requisitions predate the form; freezing them to enforce a rule
 *    retrospectively would stop real hiring to make a point.
 */
import { prisma } from '@/lib/prisma'

/**
 * Requisitions created before this need no form. The date this shipped —
 * everything after it goes through the chain.
 */
export const GATE_FROM = new Date('2026-09-04T00:00:00Z')

export interface GateResult {
  ok: boolean
  /** Why it is allowed or refused, in words that can go straight on screen. */
  reason: string
  grandfathered: boolean
  formId: string | null
  formStatus: string | null
}

export async function requisitionAuthorised(requisitionId: string): Promise<GateResult> {
  const req = await prisma.jobRequisition.findUnique({
    where: { id: requisitionId },
    select: {
      createdAt: true,
      manpowerForm: { select: { id: true, status: true } },
    },
  })
  if (!req) {
    return { ok: false, reason: 'Requisition not found.', grandfathered: false, formId: null, formStatus: null }
  }

  const form = req.manpowerForm
  if (req.createdAt < GATE_FROM) {
    return {
      ok: true,
      reason: 'Raised before the requisition form was introduced.',
      grandfathered: true,
      formId: form?.id ?? null,
      formStatus: form?.status ?? null,
    }
  }
  if (!form) {
    return {
      ok: false,
      reason: 'This role has no Manpower Requisition Form. Start one and get it approved first.',
      grandfathered: false, formId: null, formStatus: null,
    }
  }
  if (form.status !== 'APPROVED') {
    return {
      ok: false,
      reason: `The requisition form is ${form.status.toLowerCase()}. It has to be approved before the role is worked.`,
      grandfathered: false, formId: form.id, formStatus: form.status,
    }
  }
  return {
    ok: true,
    reason: 'Requisition form approved.',
    grandfathered: false, formId: form.id, formStatus: form.status,
  }
}

/** The same answer for a whole list, in one query rather than N. */
export async function authorisationForAll(): Promise<Map<string, GateResult>> {
  const reqs = await prisma.jobRequisition.findMany({
    select: {
      id: true, createdAt: true,
      manpowerForm: { select: { id: true, status: true } },
    },
  })
  const out = new Map<string, GateResult>()
  for (const r of reqs) {
    const form = r.manpowerForm
    if (r.createdAt < GATE_FROM) {
      out.set(r.id, {
        ok: true, reason: 'Raised before the form was introduced.',
        grandfathered: true, formId: form?.id ?? null, formStatus: form?.status ?? null,
      })
    } else if (!form) {
      out.set(r.id, {
        ok: false, reason: 'No requisition form yet.',
        grandfathered: false, formId: null, formStatus: null,
      })
    } else if (form.status !== 'APPROVED') {
      out.set(r.id, {
        ok: false, reason: `Form ${form.status.toLowerCase()}.`,
        grandfathered: false, formId: form.id, formStatus: form.status,
      })
    } else {
      out.set(r.id, {
        ok: true, reason: 'Approved.',
        grandfathered: false, formId: form.id, formStatus: form.status,
      })
    }
  }
  return out
}
